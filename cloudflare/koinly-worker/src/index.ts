import { connect, launch, type Browser } from "@cloudflare/playwright";
import { DurableObject } from "cloudflare:workers";

interface Env {
  BROWSER: Fetcher;
  BROWSER_SESSION: DurableObjectNamespace;
  DB: D1Database;
  KOINLY_ACCESS_KEY: string;
}

const KOINLY_LOGIN = "https://app.koinly.io/login";
const KOINLY_TRANSACTIONS = "https://app.koinly.io/transactions";
const SESSION_KEY = "koinly_storage_state";
const BROWSER_KEY = "koinly_browser_session";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "trading-koinly-worker" });
    }

    if (!authorized(request, env)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const session = env.BROWSER_SESSION.getByName("koinly-private-session");

    if (url.pathname === "/login") {
      return session.fetch(new Request(`${url.origin}/session/login`));
    }

    if (url.pathname === "/complete-login") {
      return session.fetch(new Request(`${url.origin}/session/complete-login`));
    }

    if (url.pathname === "/sync") {
      return session.fetch(new Request(`${url.origin}/session/sync`));
    }

    if (url.pathname === "/transactions") {
      const rows = await env.DB.prepare(
        "SELECT id, timestamp, raw_json, synced_at FROM koinly_transactions ORDER BY timestamp DESC LIMIT 250"
      ).all();
      return json(rows.results ?? []);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

export class BrowserSession extends DurableObject<Env> {
  private browser?: Browser;

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (path === "/session/login") {
      return this.startManualLogin();
    }

    if (path === "/session/complete-login") {
      return this.completeManualLogin();
    }

    if (path === "/session/sync") {
      return this.syncTransactions();
    }

    return new Response("Not found", { status: 404 });
  }

  private async startManualLogin(): Promise<Response> {
    const { browser, page } = await this.getFreshBrowser();
    await page.goto(KOINLY_LOGIN, { waitUntil: "domcontentloaded" });

    const cdp = await page.createCDPSession();
    const { devtoolsFrontendUrl } = await cdp.send("Cloudflare.getLiveView", {
      mode: "tab",
      expiresInMs: 3600000,
    });

    await this.ctx.storage.put(BROWSER_KEY, browser.sessionId());
    await browser.disconnect();

    return json({
      status: "login_required",
      message: "Open live_view_url, sign in to Koinly with Google, then tap Complete Login.",
      live_view_url: devtoolsFrontendUrl,
    });
  }

  private async completeManualLogin(): Promise<Response> {
    const sessionId = await this.ctx.storage.get<string>(BROWSER_KEY);
    if (!sessionId) {
      return json({ status: "no_login_session", message: "Start Login first." }, 409);
    }

    try {
      this.browser = await connect(this.env.BROWSER, sessionId);
      const page = this.browser.contexts()[0]?.pages()[0] ?? await this.browser.newPage();
      await page.goto(KOINLY_TRANSACTIONS, { waitUntil: "domcontentloaded" });

      if (page.url().includes("/login")) {
        const cdp = await page.createCDPSession();
        const { devtoolsFrontendUrl } = await cdp.send("Cloudflare.getLiveView", {
          mode: "tab",
          expiresInMs: 3600000,
        });
        await this.browser.disconnect();
        return json({
          status: "login_required",
          message: "Koinly is still logged out. Finish Google login in Live View, then tap Complete Login again.",
          live_view_url: devtoolsFrontendUrl,
        }, 401);
      }

      const state = await page.context().storageState();
      const encrypted = await encryptState(JSON.stringify(state), this.env.KOINLY_ACCESS_KEY);
      await this.ctx.storage.put(SESSION_KEY, encrypted);
      await this.ctx.storage.delete(BROWSER_KEY);
      await this.browser.close();
      this.browser = undefined;

      return json({
        status: "logged_in",
        message: "Koinly session saved securely. You can now use Sync without logging in each time unless Koinly expires the session.",
      });
    } catch (error) {
      return json({
        status: "login_session_error",
        message: error instanceof Error ? error.message : String(error),
      }, 500);
    }
  }

  private async syncTransactions(): Promise<Response> {
    try {
      const encrypted = await this.ctx.storage.get<string>(SESSION_KEY);
      if (!encrypted) {
        return this.startManualLogin();
      }

      const stateJson = await decryptState(encrypted, this.env.KOINLY_ACCESS_KEY);
      const storageState = JSON.parse(stateJson);

      const { browser, page } = await this.getBrowserWithState(storageState);
      await page.goto(KOINLY_TRANSACTIONS, { waitUntil: "domcontentloaded" });

      if (page.url().includes("/login")) {
        const cdp = await page.createCDPSession();
        const { devtoolsFrontendUrl } = await cdp.send("Cloudflare.getLiveView", {
          mode: "tab",
          expiresInMs: 3600000,
        });
        await this.ctx.storage.put(BROWSER_KEY, browser.sessionId());
        await browser.disconnect();
        return json({
          status: "login_required",
          message: "Koinly session expired. Log in again in Live View, then tap Complete Login.",
          live_view_url: devtoolsFrontendUrl,
        }, 401);
      }

      // Koinly currently renders the Transactions page dynamically. Start with
      // visible rows and keep the raw text so the dashboard can evolve without
      // changing the stored source record.
      const rows = await page.locator("table tbody tr").evaluateAll((els: Element[]) =>
        els.map((el) => ({ text: (el.textContent || "").replace(/\s+/g, " ").trim() }))
      );

      if (!rows.length) {
        await browser.disconnect();
        return json({
          status: "needs_selector_check",
          message: "Koinly loaded, but no transaction rows were detected. The authenticated DOM needs one selector update.",
        }, 422);
      }

      const syncedAt = new Date().toISOString();
      for (const row of rows) {
        const id = await sha256(row.text);
        await this.env.DB.prepare(
          "INSERT OR REPLACE INTO koinly_transactions (id, timestamp, raw_json, synced_at) VALUES (?, ?, ?, ?)"
        ).bind(id, syncedAt, JSON.stringify(row), syncedAt).run();
      }

      // Refresh the encrypted storage state so renewed cookies are retained.
      const refreshedState = await page.context().storageState();
      await this.ctx.storage.put(
        SESSION_KEY,
        await encryptState(JSON.stringify(refreshedState), this.env.KOINLY_ACCESS_KEY)
      );

      await browser.close();
      this.browser = undefined;
      return json({ status: "ok", count: rows.length, synced_at: syncedAt });
    } catch (error) {
      return json({
        status: "browser_session_error",
        message: error instanceof Error ? error.message : String(error),
      }, 500);
    }
  }

  private async getFreshBrowser() {
    this.browser = await launch(this.env.BROWSER, { keep_alive: 600000 });
    const page = await this.browser.newPage();
    return { browser: this.browser, page };
  }

  private async getBrowserWithState(storageState: unknown) {
    this.browser = await launch(this.env.BROWSER, { keep_alive: 600000 });
    const context = await this.browser.newContext({ storageState });
    const page = await context.newPage();
    return { browser: this.browser, page };
  }
}

function authorized(request: Request, env: Env): boolean {
  const value = request.headers.get("authorization") || "";
  return value === `Bearer ${env.KOINLY_ACCESS_KEY}`;
}

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptState(plaintext: string, secret: string): Promise<string> {
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}

async function decryptState(value: string, secret: string): Promise<string> {
  const [ivText, dataText] = value.split(".");
  const key = await encryptionKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivText) },
    key,
    fromBase64(dataText)
  );
  return new TextDecoder().decode(decrypted);
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
