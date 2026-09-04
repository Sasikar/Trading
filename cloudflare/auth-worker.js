const COOKIE = 'trading_auth';
const TTL = 60 * 60 * 24 * 30;
const okxCache = new Map();

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
async function validCookie(cookieHeader, secret) {
  const m = cookieHeader && cookieHeader.match(/(?:^|;\s*)trading_auth=([^;]+)/);
  if (!m) return false;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return false;
  if (!timingSafeEqual(sig, await hmac(secret, payload))) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}
function loginPage(error = '', next = '/') {
  const err = error ? `<div class="err">${error.replace(/[<>&]/g, '')}</div>` : '';
  let dest = next || '/';
  if (!dest.startsWith('/') || dest.startsWith('//')) dest = '/';
  const action = '/__login?next=' + encodeURIComponent(dest);
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trading</title>
<style>body{margin:0;background:#070a0f;color:#f4f7fb;font-family:system-ui;min-height:100vh;display:grid;place-items:center}
.box{width:min(360px,calc(100% - 40px));padding:28px;border:1px solid #263341;border-radius:18px;background:#101821}
input,button{width:100%;box-sizing:border-box;padding:13px;border-radius:10px;font-size:16px;margin-top:10px}
input{border:1px solid #263341;background:#080d13;color:#fff}button{border:0;background:#62e3a0;color:#06120b;font-weight:900}
.err{color:#ff6f7c;font-size:12px}</style></head>
<body><form class="box" method="post" action="${action}"><h1>TRADING.</h1>${err}
<input type="password" name="password" required autofocus placeholder="Password">
<button type="submit">Enter</button></form></body></html>`,
    { status: 200, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store' } }
  );
}
function noStore(res) {
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  headers.delete('ETag');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
function cacheGet(key) {
  const hit = okxCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    okxCache.delete(key);
    return null;
  }
  return hit.data;
}
function cacheSet(key, data, ttlMs) {
  okxCache.set(key, { data, exp: Date.now() + ttlMs });
}

async function fetchOkx(path, params) {
  const allowed = path === 'ticker' || path === 'candles';
  if (!allowed) throw new Error('invalid okx endpoint');
  const upstream = new URL('https://www.okx.com/api/v5/market/' + path);
  for (const [key, value] of params) {
    if (key === 'instId' || key === 'bar' || key === 'limit') upstream.searchParams.set(key, value);
  }
  const cacheKey = 'okx:' + upstream.toString();
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400 * attempt));
    try {
      const res = await fetch(upstream.toString(), { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const j = await res.json();
        cacheSet(cacheKey, j, path === 'candles' ? 45000 : 5000);
        return j;
      }
      lastErr = new Error('okx ' + res.status);
      if (res.status !== 429 && res.status !== 503) break;
    } catch (e) {
      lastErr = e;
    }
  }

  // Gate.io candles fallback (OKX rate limits)
  if (path === 'candles') {
    const instId = params.get('instId') || 'BTC-USDT';
    const bar = (params.get('bar') || '1D').toUpperCase();
    const limit = Math.min(parseInt(params.get('limit') || '100', 10) || 100, 200);
    const pair = String(instId).replace('-', '_');
    const intervalMap = { '1M': '30d', '1W': '7d', '1D': '1d', '4H': '4h', '1H': '1h', '15M': '15m' };
    const interval = intervalMap[bar] || '1d';
    const url =
      'https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=' +
      encodeURIComponent(pair) +
      '&interval=' +
      encodeURIComponent(interval) +
      '&limit=' +
      encodeURIComponent(String(limit));
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw lastErr || new Error('gate ' + res.status);
    const rows = await res.json();
    // Gate: [t, vol, close, high, low, open, ...] as strings, oldest first
    // OKX style newest first: [ts_ms, o, h, l, c, vol]
    const data = (Array.isArray(rows) ? rows : [])
      .slice()
      .reverse()
      .map((r) => [
        String(Number(r[0]) * 1000),
        String(r[5]),
        String(r[3]),
        String(r[4]),
        String(r[2]),
        String(r[1]),
      ]);
    if (!data.length) throw lastErr || new Error('gate empty');
    const out = { code: '0', data, source: 'gate-fallback' };
    cacheSet(cacheKey, out, 45000);
    return out;
  }

  if (path === 'ticker') {
    const instId = params.get('instId') || 'BTC-USDT';
    const product = instId.startsWith('ETH') ? 'ETH-USD' : 'BTC-USD';
    const res = await fetch('https://api.exchange.coinbase.com/products/' + product + '/ticker', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw lastErr || new Error('coinbase ' + res.status);
    const j = await res.json();
    const stats = await fetch('https://api.exchange.coinbase.com/products/' + product + '/stats', {
      headers: { Accept: 'application/json' },
    }).then((r) => (r.ok ? r.json() : {}));
    const last = j.price;
    const open24h = stats.open || last;
    const out = {
      code: '0',
      data: [{ instId, last, open24h, askPx: j.ask, bidPx: j.bid }],
      source: 'coinbase-fallback',
    };
    cacheSet(cacheKey, out, 5000);
    return out;
  }

  throw lastErr || new Error('okx failed');
}

async function fetchFearGreed() {
  const cached = cacheGet('fng');
  if (cached) return cached;
  const res = await fetch('https://api.alternative.me/fng/?limit=1', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('fng ' + res.status);
  const j = await res.json();
  cacheSet('fng', j, 60000);
  return j;
}

async function fetchYf(symbol) {
  const cacheKey = 'yf:' + symbol;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const s = String(symbol || '').toUpperCase();
  const isNasdaq = s.includes('IXIC') || s.includes('NDX') || s.includes('NASDAQ') || s === 'COMP';

  // 1) Nasdaq.com public quote (simple, reliable for COMP)
  if (isNasdaq) {
    try {
      const res = await fetch('https://api.nasdaq.com/api/quote/COMP/info?assetclass=index', {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0',
          Origin: 'https://www.nasdaq.com',
          Referer: 'https://www.nasdaq.com/',
        },
      });
      if (res.ok) {
        const j = await res.json();
        const p = j && j.data && j.data.primaryData;
        if (p && p.lastSalePrice) {
          const price = parseFloat(String(p.lastSalePrice).replace(/,/g, ''));
          const chg = parseFloat(String(p.netChange || '0').replace(/,/g, '')) || 0;
          let pct = 0;
          const pctStr = String(p.percentageChange || '').replace('%', '').replace(/,/g, '');
          pct = parseFloat(pctStr) || 0;
          if (isFinite(price)) {
            const out = { price, chg, pct, symbol: '^IXIC', source: 'nasdaq.com', live: true };
            cacheSet(cacheKey, out, 30000);
            return out;
          }
        }
      }
    } catch (e) {}
  }

  // 2) Yahoo query1/query2
  const hosts = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
  let lastErr = null;
  for (const host of hosts) {
    try {
      const url = host + '/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=5d';
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 TradingApp/1.0', Accept: 'application/json,*/*' },
      });
      if (!res.ok) {
        lastErr = new Error('yf ' + res.status);
        continue;
      }
      const j = await res.json();
      const meta = j.chart.result[0].meta;
      const closes = (j.chart.result[0].indicators.quote[0].close || []).filter((x) => x != null);
      const price = meta.regularMarketPrice;
      let prev = meta.previousClose ?? meta.chartPreviousClose;
      if (closes.length >= 2) prev = closes[closes.length - 2];
      const chg = price - prev;
      const pct = prev ? (chg / prev) * 100 : 0;
      const out = { price, chg, pct, symbol, source: 'yahoo', live: true };
      cacheSet(cacheKey, out, 30000);
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('yf failed');
}

async function fetchOrderbook(instId, sz) {
  const url =
    'https://www.okx.com/api/v5/market/books?instId=' +
    encodeURIComponent(instId) +
    '&sz=' +
    encodeURIComponent(String(sz || 50));
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('books ' + res.status);
  const j = await res.json();
  const row = (j.data && j.data[0]) || {};
  // Always stamp server receive time so freshness is not skewed by exchange clock
  return {
    bids: row.bids || [],
    asks: row.asks || [],
    ts: Date.now(),
    exchangeTs: row.ts || null,
    source: 'OKX',
    instId,
  };
}

function json(data, status = 200, ttl = 'private, no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': ttl },
  });
}

async function handleApi(url) {
  try {
    if (url.pathname === '/api/okx/ticker' || url.pathname === '/api/okx/candles') {
      const path = url.pathname.endsWith('/ticker') ? 'ticker' : 'candles';
      return json(await fetchOkx(path, url.searchParams));
    }
    if (url.pathname === '/api/fng') return json(await fetchFearGreed());
    if (url.pathname === '/api/nasdaq') return json(await fetchYf('^IXIC'));
    if (url.pathname === '/api/yf') return json(await fetchYf(url.searchParams.get('symbol') || '^IXIC'));
    if (url.pathname === '/api/orderbook') {
      return json(
        await fetchOrderbook(url.searchParams.get('instId') || 'BTC-USDT', url.searchParams.get('sz') || '50')
      );
    }
    if (url.pathname === '/api/health') {
      return json({ ok: true, ts: Date.now() });
    }
  } catch (e) {
    return json({ error: String(e && e.message ? e.message : e) }, 502);
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const secret = env.TRADING_PASSWORD;

    // Public market APIs — always available (no cookie). Fixes OFFLINE when session missing.
    
    // Public static market snapshots (no cookie) — NASDAQ must not depend on login
    if (url.pathname === '/nasdaq.json' || url.pathname === '/etf-flows.json' || url.pathname === '/macro-strip.json') {
      if (!env.ASSETS) return new Response('missing assets', { status: 500 });
      return noStore(await env.ASSETS.fetch(request));
    }

    if (url.pathname.startsWith('/api/')) {
      const apiRes = await handleApi(url);
      if (apiRes) return apiRes;
      return json({ error: 'not found' }, 404);
    }

    // Login routes
    if (url.pathname === '/__login') {
      if (!secret) return new Response('Authentication is not configured.', { status: 503 });
      if (request.method === 'POST') {
        const nextParam = url.searchParams.get('next') || '/';
        let password = '';
        try {
          password = String((await request.formData()).get('password') || '');
        } catch {
          return loginPage('Incorrect password.', nextParam);
        }
        if (!timingSafeEqual(password, String(secret))) return loginPage('Incorrect password.', nextParam);
        const payload = b64url(new TextEncoder().encode(JSON.stringify({ exp: Date.now() + TTL * 1000 })));
        const sig = await hmac(String(secret), payload);
        let dest = nextParam;
        if (!dest.startsWith('/') || dest.startsWith('//')) dest = '/';
        return new Response(null, {
          status: 302,
          headers: {
            Location: dest,
            'Set-Cookie': `${COOKIE}=${payload}.${sig}; Max-Age=${TTL}; Path=/; Secure; HttpOnly; SameSite=Lax`,
            'Cache-Control': 'no-store',
          },
        });
      }
      return loginPage('', url.searchParams.get('next') || '/');
    }

    // Optional password gate for HTML pages only
    if (secret) {
      const ok = await validCookie(request.headers.get('Cookie') || '', String(secret));
      if (!ok) {
        const login = new URL('/__login', url.origin);
        login.searchParams.set('next', url.pathname + url.search);
        return new Response(null, {
          status: 302,
          headers: { Location: login.toString(), 'Cache-Control': 'no-store' },
        });
      }
    }

    if (!env.ASSETS) return new Response('Static asset binding missing.', { status: 500 });
    return noStore(await env.ASSETS.fetch(request));
  },
};
