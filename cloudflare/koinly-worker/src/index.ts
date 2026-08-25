import { connect, launch, type Browser } from "@cloudflare/playwright";
import { DurableObject } from "cloudflare:workers";

interface Env {
  BROWSER: Fetcher;
  BROWSER_SESSION: DurableObjectNamespace;
  DB: D1Database;
}

const KOINLY_LOGIN = "https://app.koinly.io/login";
const KOINLY_TRANSACTIONS = "https://app.koinly.io/transactions";
const SESSION_KEY = "koinly_storage_state";
const BROWSER_KEY = "koinly_browser_session";
const LOGIN_TOKEN_KEY = "koinly_login_token";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "trading-koinly-worker" });
    }

    const session = env.BROWSER_SESSION.getByName("koinly-private-session");

    if (url.pathname === "/login") {
      return session.fetch(new Request(`${url.origin}/session/login`));
    }

    if (url.pathname === "/complete-login") {
      return session.fetch(new Request(`${url.origin}/session/complete-login`, {
        headers: { "x-login-token": request.headers.get("x-login-token") || "" },
      }));
    }

    if (url.pathname === "/sync") {
      return session.fetch(new Request(`${url.origin}/session/sync`, {
        headers: { "x-login-token": request.headers.get("x-login-token") || "" },
      }));
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

    if (path === "/session/login") return this.startManualLogin();
    if (path === "/session/complete-login") return this.completeManualLogin(request);
    if (path === "/session/sync") return this.syncTransactions(request);

    return new Response("Not found", { status: 404 });
  }

  private async startManualLogin(): Promise<Response> {
    const loginToken = crypto.randomUUID();
    const { browser, page } = await this.getFreshBrowser();
    await page.goto(KOINLY_LOGIN, { waitUntil: "domcontentloaded" });

    const cdp = await page.createCDPSession();
    const { devtoolsFrontendUrl } = await cdp.send("Cloudflare.getLiveView", {
      mode: "tab",
      expiresInMs: 3600000,
    });

    await this.ctx.storage.put(BROWSER_KEY, browser.sessionId());
    await this.ctx.storage.put(LOGIN_TOKEN_KEY, loginToken);
    await browser.disconnect();

    return json({
      status: "login_required",
      login_token: loginToken,
      message: "Open live_view_url, sign in to Koinly with Google, then call Complete Login with this login_token.",
      live_view_url: devtoolsFrontendUrl,
    });
  }

  private async completeManualLogin(request: Request): Promise<Response> {
    if (!(await this.validToken(request))) return json({ status: "unauthorized" }, 401);

    const sessionId = await this.ctx.storage.get<string>(BROWSER_KEY);
    if (!sessionId) return json({ status: "no_login_session", message: "Start Login first." }, 409);

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
      await this.ctx.storage.put(SESSION_KEY, JSON.stringify(state));
      await this.ctx.storage.delete(BROWSER_KEY);
      await this.browser.close();
      this.browser = undefined;

      return json({
        status: "logged_in",
        message: "Koinly session saved securely. You can now use Sync without logging in each time unless Koinly expires the session.",
      });
    } catch (error) {
      return json({ status: "login_session_error", message: error instanceof Error ? error.message : String(error) }, 500);
    }
  }

  private async syncTransactions(request: Request): Promise<Response> {
    if (!(await this.validToken(request))) return json({ status: "unauthorized" }, 401);

    try {
      const stateJson = await this.ctx.storage.get<string>(SESSION_KEY);
      if (!stateJson) return this.startManualLogin();

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

      const rows = await page.locator("table tbody tr").evaluateAll((els: Element[]) =>
        els.map((el) => ({ text: (el.textContent || "").replace(/\s+/g, " ").trim() }))
      );

      if (!rows.length) {
        await browser.disconnect();
        return json({ status: "needs_selector_check", message: "Koinly loaded, but no transaction rows were detected. The authenticated DOM needs one selector update." }, 422);
      }

      const syncedAt = new Date().toISOString();
      for (const row of rows) {
        const id = await sha256(row.text);
        await this.env.DB.prepare(
          "INSERT OR REPLACE INTO koinly_transactions (id, timestamp, raw_json, synced_at) VALUES (?, ?, ?, ?)"
        ).bind(id, syncedAt, JSON.stringify(row), syncedAt).run();
      }

      const refreshedState = await page.context().storageState();
      await this.ctx.storage.put(SESSION_KEY, JSON.stringify(refreshedState));
      await browser.close();
      this.browser = undefined;
      return json({ status: "ok", count: rows.length, synced_at: syncedAt });
    } catch (error) {
      return json({ status: "browser_session_error", message: error instanceof Error ? error.message : String(error) }, 500);
    }
  }

  private async validToken(request: Request): Promise<boolean> {
    const expected = await this.ctx.storage.get<string>(LOGIN_TOKEN_KEY);
    return !!expected && request.headers.get("x-login-token") === expected;
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

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
