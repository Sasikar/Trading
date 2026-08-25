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
      const { browser, page } = await this.getPage(KOINLY_LOGIN);
      const cdp = await page.createCDPSession();
      const { devtoolsFrontendUrl } = await cdp.send("Cloudflare.getLiveView", {
        mode: "tab",
        expiresInMs: 3600000,
      });

      await this.ctx.storage.put("last_live_view", devtoolsFrontendUrl);
      await browser.disconnect();

      return json({
        status: "login_required",
        message: "Open the Live View link, sign in to Koinly with Google, then return to Trading and tap Sync.",
        live_view_url: devtoolsFrontendUrl,
      });
    }

    if (path === "/session/sync") {
      try {
        const { browser, page } = await this.getPage(KOINLY_TRANSACTIONS);
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);

        if (page.url().includes("/login")) {
          const cdp = await page.createCDPSession();
          const { devtoolsFrontendUrl } = await cdp.send("Cloudflare.getLiveView", {
            mode: "tab",
            expiresInMs: 3600000,
          });
          await browser.disconnect();
          return json({
            status: "login_required",
            message: "Koinly session is not authenticated. Open the Live View, log in with Google, then tap Sync again.",
            live_view_url: devtoolsFrontendUrl,
          }, 401);
        }

        const rows = await page.locator("table tbody tr").evaluateAll((els: Element[]) =>
          els.map((el) => ({ text: (el.textContent || "").replace(/\s+/g, " ").trim() }))
        );

        if (!rows.length) {
          await browser.disconnect();
          return json({
            status: "needs_selector_check",
            message: "Koinly loaded, but no transaction table rows were detected. We need to inspect the authenticated Koinly DOM once.",
          }, 422);
        }

        const syncedAt = new Date().toISOString();
        for (const row of rows) {
          const id = await sha256(row.text);
          await this.env.DB.prepare(
            "INSERT OR REPLACE INTO koinly_transactions (id, timestamp, raw_json, synced_at) VALUES (?, ?, ?, ?)"
          ).bind(id, syncedAt, JSON.stringify(row), syncedAt).run();
        }

        await browser.disconnect();
        return json({ status: "ok", count: rows.length, synced_at: syncedAt });
      } catch (error) {
        return json({
          status: "browser_session_error",
          message: error instanceof Error ? error.message : String(error),
        }, 500);
      }
    }

    return new Response("Not found", { status: 404 });
  }

  private async getPage(url: string) {
    const savedSessionId = await this.ctx.storage.get<string>("session_id");

    if (savedSessionId) {
      try {
        this.browser = await connect(this.env.BROWSER, savedSessionId);
        const page = this.browser.contexts()[0]?.pages()[0] ?? await this.browser.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded" });
        return { browser: this.browser, page };
      } catch {
        await this.ctx.storage.delete("session_id");
      }
    }

    this.browser = await launch(this.env.BROWSER, { keep_alive: 600000 });
    await this.ctx.storage.put("session_id", this.browser.sessionId());
    const page = await this.browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
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

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
