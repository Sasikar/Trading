import { connect, launch, limits, sessions, type Browser } from "@cloudflare/playwright";
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
const LAST_SYNC_KEY = "koinly_last_sync_at";
const SYNC_COOLDOWN_MS = 15000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
      const url = new URL(request.url);
      if (url.pathname === "/health") return json({ ok: true, service: "trading-koinly-worker" });

      const session = env.BROWSER_SESSION.getByName("koinly-private-session");
      const token = request.headers.get("x-login-token") || "";
      if (url.pathname === "/browser-status") return browserStatus(env);
      if (url.pathname === "/login") return session.fetch(new Request(`${url.origin}/session/login`));
      if (url.pathname === "/complete-login") return session.fetch(new Request(`${url.origin}/session/complete-login`, { method: "POST", headers: { "x-login-token": token } }));
      if (url.pathname === "/sync") return session.fetch(new Request(`${url.origin}/session/sync`, { method: "POST", headers: { "x-login-token": token } }));
      if (url.pathname === "/transactions") return session.fetch(new Request(`${url.origin}/session/transactions`, { headers: { "x-login-token": token } }));
      return new Response("Not found", { status: 404, headers: cors() });
    } catch (error) {
      return json({ status: "worker_error", message: error instanceof Error ? error.message : String(error) }, 500);
    }
  }
} satisfies ExportedHandler<Env>;

export class BrowserSession extends DurableObject<Env> {
  private browser?: Browser;

  async fetch(request: Request): Promise<Response> {
    try {
      const path = new URL(request.url).pathname;
      if (path === "/session/login") return await this.startManualLogin();
      if (path === "/session/complete-login") return await this.completeManualLogin(request);
      if (path === "/session/sync") return await this.syncTransactions(request);
      if (path === "/session/transactions") return await this.getTransactions(request);
      return new Response("Not found", { status: 404, headers: cors() });
    } catch (error) {
      return json({ status: "browser_session_error", message: error instanceof Error ? error.message : String(error) }, 500);
    }
  }

  private async startManualLogin() {
    const sessionId = await this.ctx.storage.get<string>(BROWSER_KEY);
    const token = await this.ctx.storage.get<string>(LOGIN_TOKEN_KEY);

    // Reuse the existing Browser Run session when it is genuinely still open.
    if (sessionId && token) {
      try {
        const live = await sessions(this.env.BROWSER);
        if (live.some((s) => s.sessionId === sessionId)) return await this.liveViewExisting(sessionId, token);
      } catch {}
      await this.ctx.storage.delete(BROWSER_KEY);
    }

    // A saved authenticated session means there is nothing to log in again.
    if (await this.ctx.storage.get<string>(SESSION_KEY)) {
      return json({ status: "already_logged_in", login_token: token, message: "Koinly session is already saved. Tap Sync Latest." });
    }

    const loginToken = token || crypto.randomUUID();
    try {
      const browserLimits = await limits(this.env.BROWSER);
      if (browserLimits.allowedBrowserAcquisitions < 1) {
        return rateLimitedResponse(browserLimits.timeUntilNextAllowedBrowserAcquisition, "Cloudflare says a new browser cannot be acquired yet.");
      }

      const { browser, page } = await this.getFreshBrowser();
      await page.goto(KOINLY_LOGIN, { waitUntil: "domcontentloaded", timeout: 30000 });
      const cdp = await page.context().newCDPSession(page);
      const { devtoolsFrontendUrl } = await cdp.send("Cloudflare.getLiveView", { mode: "tab", expiresInMs: 3600000 });
      await this.ctx.storage.put(BROWSER_KEY, browser.sessionId());
      await this.ctx.storage.put(LOGIN_TOKEN_KEY, loginToken);
      await releaseBrowserConnection(browser);
      this.browser = undefined;
      return json({ status: "login_required", login_token: loginToken, message: "Sign in to Koinly in Live View, then tap Complete Login.", live_view_url: devtoolsFrontendUrl });
    } catch (error) {
      this.browser = undefined;
      return rateLimitOrError(error, "browser_launch_error");
    }
  }

  private async liveViewExisting(sessionId: string, token: string) {
    this.browser = await connect(this.env.BROWSER, sessionId);
    const page = this.browser.contexts()[0]?.pages()[0] ?? await this.browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    const { devtoolsFrontendUrl } = await cdp.send("Cloudflare.getLiveView", { mode: "tab", expiresInMs: 3600000 });
    await releaseBrowserConnection(this.browser);
    this.browser = undefined;
    return json({ status: "login_required", login_token: token, message: "Existing Koinly browser session found. Finish login, then tap Complete Login.", live_view_url: devtoolsFrontendUrl });
  }

  private async completeManualLogin(request: Request) {
    if (!(await this.validToken(request))) return json({ status: "unauthorized" }, 401);
    const sessionId = await this.ctx.storage.get<string>(BROWSER_KEY);
    if (!sessionId) {
      if (await this.ctx.storage.get<string>(SESSION_KEY)) return json({ status: "logged_in", message: "Koinly session is already saved. Sync Latest is ready." });
      return json({ status: "no_login_session", message: "No pending browser login. Tap Connect Koinly once to start one." }, 409);
    }

    try {
      const live = await sessions(this.env.BROWSER);
      if (!live.some((s) => s.sessionId === sessionId)) {
        await this.ctx.storage.delete(BROWSER_KEY);
        return json({ status: "login_session_expired", message: "The previous browser session expired. Tap Connect Koinly once to create a fresh session." }, 409);
      }
      this.browser = await connect(this.env.BROWSER, sessionId);
      const page = this.browser.contexts()[0]?.pages()[0] ?? await this.browser.newPage();
      await page.goto(KOINLY_TRANSACTIONS, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (page.url().includes("/login")) {
        const cdp = await page.context().newCDPSession(page);
        const { devtoolsFrontendUrl } = await cdp.send("Cloudflare.getLiveView", { mode: "tab", expiresInMs: 3600000 });
        await releaseBrowserConnection(this.browser);
        this.browser = undefined;
        return json({ status: "login_required", login_token: await this.ctx.storage.get<string>(LOGIN_TOKEN_KEY), message: "Finish Google login in Live View, then tap Complete Login again.", live_view_url: devtoolsFrontendUrl }, 401);
      }
      await this.ctx.storage.put(SESSION_KEY, JSON.stringify(await page.context().storageState()));
      await this.ctx.storage.delete(BROWSER_KEY);
      await this.browser.close();
      this.browser = undefined;
      return json({ status: "logged_in", message: "Koinly session saved. Sync Latest is ready." });
    } catch (error) {
      try { await this.browser?.close(); } catch {}
      this.browser = undefined;
      return rateLimitOrError(error, "login_session_error");
    }
  }

  private async syncTransactions(request: Request) {
    if (!(await this.validToken(request))) return json({ status: "unauthorized" }, 401);

    const lastSync = await this.ctx.storage.get<number>(LAST_SYNC_KEY);
    const now = Date.now();
    if (lastSync && now - lastSync < SYNC_COOLDOWN_MS) {
      const retryAfter = Math.max(1, Math.ceil((SYNC_COOLDOWN_MS - (now - lastSync)) / 1000));
      return new Response(JSON.stringify({ status: "rate_limited", message: `Sync already ran recently. Try again in ${retryAfter}s.` }), { status: 429, headers: { ...cors(), "content-type": "application/json; charset=utf-8", "retry-after": String(retryAfter) } });
    }

    await this.ctx.storage.put(LAST_SYNC_KEY, now);
    try {
      const storageState = await this.ctx.storage.get<string>(SESSION_KEY);
      if (!storageState) return json({ status: "no_saved_session", message: "Complete Koinly Login first." }, 409);

      const { browser, page, persistent } = await this.getBrowserWithState(JSON.parse(storageState));
      await page.goto(KOINLY_TRANSACTIONS, { waitUntil: "domcontentloaded", timeout: 30000 });

      if (page.url().includes("/login")) {
        const cdp = await page.context().newCDPSession(page);
        const { devtoolsFrontendUrl } = await cdp.send("Cloudflare.getLiveView", { mode: "tab", expiresInMs: 3600000 });
        await this.ctx.storage.put(BROWSER_KEY, browser.sessionId());
        await releaseBrowserConnection(browser);
        this.browser = undefined;
        return json({ status: "login_required", message: "Koinly session expired. Log in again in Live View, then tap Complete Login.", live_view_url: devtoolsFrontendUrl }, 401);
      }

      const rows = await page.locator("table tbody tr").evaluateAll((els: Element[]) => els.map(el => ({ text: (el.textContent || "").replace(/\s+/g, " ").trim() })));
      if (!rows.length) {
        if (persistent) {
          await this.ctx.storage.put(BROWSER_KEY, browser.sessionId());
          await releaseBrowserConnection(browser);
          this.browser = undefined;
        } else {
          await browser.close();
          this.browser = undefined;
        }
        return json({ status: "needs_selector_check", message: "Koinly loaded, but no transaction rows were detected." }, 422);
      }

      const syncedAt = new Date().toISOString();
      for (const row of rows) {
        const id = await sha256(row.text);
        await this.env.DB.prepare("INSERT OR REPLACE INTO koinly_transactions (id,timestamp,raw_json,synced_at) VALUES (?,?,?,?)").bind(id, syncedAt, JSON.stringify(row), syncedAt).run();
      }

      await this.ctx.storage.put(SESSION_KEY, JSON.stringify(await page.context().storageState()));
      await this.ctx.storage.put(BROWSER_KEY, browser.sessionId());
      await releaseBrowserConnection(browser);
      this.browser = undefined;
      return json({ status: "ok", count: rows.length, synced_at: syncedAt });
    } catch (error) {
      try { await this.browser?.close(); } catch {}
      this.browser = undefined;
      return rateLimitOrError(error, "browser_session_error");
    }
  }

  private async getTransactions(request: Request) {
    if (!(await this.validToken(request))) return json({ status: "unauthorized" }, 401);
    const rows = await this.env.DB.prepare("SELECT id,timestamp,raw_json,synced_at FROM koinly_transactions ORDER BY timestamp DESC LIMIT 250").all();
    return json(rows.results ?? []);
  }

  private async validToken(request: Request) {
    const expected = await this.ctx.storage.get<string>(LOGIN_TOKEN_KEY);
    return !!expected && request.headers.get("x-login-token") === expected;
  }

  private async getFreshBrowser() {
    this.browser = await launch(this.env.BROWSER, { keep_alive: 600000 });
    return { browser: this.browser, page: await this.browser.newPage() };
  }

  private async getBrowserWithState(storageState: unknown) {
    const existingSessionId = await this.ctx.storage.get<string>(BROWSER_KEY);
    if (existingSessionId) {
      try {
        const live = await sessions(this.env.BROWSER);
        if (live.some((s) => s.sessionId === existingSessionId)) {
          this.browser = await connect(this.env.BROWSER, existingSessionId);
          const page = this.browser.contexts()[0]?.pages()[0] ?? await this.browser.newPage();
          return { browser: this.browser, page, persistent: true };
        }
      } catch {}
      await this.ctx.storage.delete(BROWSER_KEY);
      this.browser = undefined;
    }

    const browserLimits = await limits(this.env.BROWSER);
    if (browserLimits.allowedBrowserAcquisitions < 1) {
      throw new BrowserRateLimitError(browserLimits.timeUntilNextAllowedBrowserAcquisition);
    }

    this.browser = await launch(this.env.BROWSER, { keep_alive: 600000 });
    const context = await this.browser.newContext({ storageState });
    const page = await context.newPage();
    return { browser: this.browser, page, persistent: true };
  }
}

async function releaseBrowserConnection(browser: Browser) {
  // Cloudflare's Playwright runtime has shipped builds where disconnect() is
  // missing at runtime even though the type definitions expose it. Never call
  // a missing method: leaving the keep-alive session open is the safe fallback.
  const candidate = browser as Browser & { disconnect?: () => void | Promise<void> };
  if (typeof candidate.disconnect === "function") await candidate.disconnect();
}

class BrowserRateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Browser acquisition is rate limited. Retry in ${retryAfterSeconds}s.`);
    this.name = "BrowserRateLimitError";
  }
}

async function browserStatus(env: Env) {
  try {
    const [browserLimits, openSessions] = await Promise.all([limits(env.BROWSER), sessions(env.BROWSER)]);
    return json({ status: "ok", browser_limits: browserLimits, open_sessions: openSessions });
  } catch (error) {
    return json({ status: "error", message: error instanceof Error ? error.message : String(error) }, 500);
  }
}

function rateLimitedResponse(retryAfterSeconds: number, message: string) {
  const retry = Math.max(1, Math.ceil(retryAfterSeconds || 20));
  return new Response(JSON.stringify({ status: "rate_limited", message, retry_after_seconds: retry, reason: "browser_acquisition_rate_limit" }), { status: 429, headers: { ...cors(), "content-type": "application/json; charset=utf-8", "retry-after": String(retry) } });
}

function rateLimitOrError(error: unknown, fallback: string) {
  if (error instanceof BrowserRateLimitError) return rateLimitedResponse(error.retryAfterSeconds, "Cloudflare says a new browser cannot be acquired yet.");
  const message = error instanceof Error ? error.message : String(error);
  if (/429|too many requests|too many retries|rate.?limit|acquisition/i.test(message)) return rateLimitedResponse(60, "Cloudflare Browser Run is rate-limiting a browser acquisition. The worker now checks limits and reuses live sessions before launching a new browser.");
  return json({ status: fallback, message }, 500);
}

async function sha256(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function cors() {
  return { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-login-token", "access-control-allow-methods": "GET,POST,OPTIONS" };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", ...cors() } });
}
