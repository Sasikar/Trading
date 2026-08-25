import { connect, launch, type Browser } from "@cloudflare/playwright";
import { DurableObject } from "cloudflare:workers";

interface Env {
  BROWSER: Fetcher;
  DB: D1Database;
  KOINLY_LOGIN_KEY: string;
}

const KOINLY_LOGIN = "https://app.koinly.io/login";
const KOINLY_TRANSACTIONS = "https://app.koinly.io/transactions";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;

    if (url.pathname === "/health") {
      return json({ ok: true, service: "trading-koinly-worker" });
    }

    if (url.pathname === "/login") {
      return env.BROWSER_SESSION.fetch(new Request(`${origin}/session/login`, {
        headers: { "X-Koinly-Key": env.KOINLY_LOGIN_KEY },
      }));
    }

    if (url.pathname === "/sync") {
      return env.BROWSER_SESSION.fetch(new Request(`${origin}/session/sync`, {
        headers: { "X-Koinly-Key": env.KOINLY_LOGIN_KEY },
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
  private page?: any;

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("X-Koinly-Key") !== this.env.KOINLY_LOGIN_KEY) {
      return new Response("Unauthorized", { status: 401 });
    }

    const path = new URL(request.url).pathname;

    if (path === "/session/login") {
      const page = await this.getPage(KOINLY_LOGIN);
      const cdp = await page.createCDPSession();
      const { devtoolsFrontendUrl } = await cdp.send("Cloudflare.getLiveView", {
        mode: "tab",
        expiresInMs: 3600000,
      });

      return new Response(
        JSON.stringify({
          status: "login_required",
          message: "Open the Live View link on your phone, sign in to Koinly with Google, then tap Done/return to Trading and call Sync.",
          live_view_url: devtoolsFrontendUrl,
        }),
        { headers: { "content-type": "application/json" } },
      );
    }

    if (path === "/session/sync") {
      const page = await this.getPage(KOINLY_TRANSACTIONS);
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);

      // Koinly's DOM is intentionally treated as an adapter layer. Selectors
      // will be tightened after the first real authenticated session is tested.
      const rows = await page.locator("table tbody tr").evaluateAll((els: Element[]) =>
        els.map((el) => ({ text: (el.textContent || "").replace(/\\s+/g, " ").trim() }))
      );

      if (!rows.length) {
        return json({
          status: "needs_selector_check",
          message: "Koinly loaded, but no transaction table rows were detected yet.",
        }, 422);
      }

      const syncedAt = new Date().toISOString();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const id = await sha256(`${syncedAt}:${i}:${row.text}`);
        await this.env.DB.prepare(
          "INSERT OR REPLACE INTO koinly_transactions (id, timestamp, raw_json, synced_at) VALUES (?, ?, ?, ?)"
        ).bind(id, syncedAt, JSON.stringify(row), syncedAt).run();
      }

      return json({ status: "ok", count: rows.length, synced_at: syncedAt });
    }

    return new Response("Not found", { status: 404 });
  }

  private async getPage(url: string) {
    if (!this.browser) {
      this.browser = await launch(this.env.BROWSER, { keep_alive: 600000 });
    }

    if (!this.page || this.page.isClosed()) {
      this.page = await this.browser.newPage();
    }

    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    return this.page;
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
