const COOKIE = 'trading_auth';
const TTL = 60 * 60 * 24 * 30; // 30 days

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return b64url(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
    )
  );
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

async function validCookie(cookieHeader, secret) {
  const m = cookieHeader?.match(
    new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)')
  );
  if (!m) return false;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return false;
  const expected = await hmac(secret, payload);
  if (!timingSafeEqual(sig, expected)) return false;
  try {
    const data = JSON.parse(
      new TextDecoder().decode(fromB64url(payload))
    );
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

function loginPage(error = '', next = '/') {
  const err = error
    ? `<div class="err">${error.replace(/[<>&]/g, '')}</div>`
    : '';
  let dest = next || '/';
  if (!dest.startsWith('/') || dest.startsWith('//')) dest = '/';
  const action = '/__login?next=' + encodeURIComponent(dest);
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trading — Private</title>
<style>
body{margin:0;background:#070a0f;color:#f4f7fb;font-family:Inter,system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}
.box{width:min(360px,calc(100% - 40px));padding:28px;border:1px solid #263341;border-radius:18px;background:#101821;box-sizing:border-box}
h1{font-size:22px;margin:0 0 8px;letter-spacing:.12em}
p{color:#8491a1;font-size:13px;margin:0 0 22px}
input{width:100%;box-sizing:border-box;padding:13px;border:1px solid #263341;border-radius:10px;background:#080d13;color:#fff;font-size:16px;outline:none}
button{width:100%;margin-top:12px;padding:13px;border:0;border-radius:10px;background:#62e3a0;color:#06120b;font-weight:900;font-size:14px;cursor:pointer}
.err{color:#ff6f7c;font-size:12px;margin:0 0 12px}
</style>
</head>
<body>
<form class="box" method="post" action="${action}">
<h1>TRADING.</h1>
<p>Private access</p>
${err}
<input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus required>
<button type="submit">Enter Trading</button>
</form>
</body>
</html>`,
    {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    }
  );
}

function noStore(res) {
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.delete('ETag');
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

async function serveAssets(request, env) {
  if (!env.ASSETS) {
    return new Response('Static asset binding missing.', { status: 500 });
  }
  return noStore(await env.ASSETS.fetch(request));
}


async function fetchOrderbook(instId, sz) {
  const url = 'https://www.okx.com/api/v5/market/books?instId=' + encodeURIComponent(instId) + '&sz=' + encodeURIComponent(String(sz || 50));
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('books ' + res.status);
  const j = await res.json();
  const row = (j.data && j.data[0]) || {};
  return { bids: row.bids || [], asks: row.asks || [], ts: row.ts || Date.now(), source: 'OKX', instId };
}

export default {
  async fetch(request, env) {
    const secret = env.TRADING_PASSWORD;
    if (!secret) {
      return new Response('Authentication is not configured.', {
        status: 503,
        headers: { 'cache-control': 'no-store' },
      });
    }

    const url = new URL(request.url);

    if (url.pathname === '/__login') {
      if (request.method === 'POST') {
        let password = '';
        const nextParam = url.searchParams.get('next') || '/';
        try {
          const body = await request.formData();
          password = String(body.get('password') || '');
        } catch {
          return loginPage('Incorrect password.', nextParam);
        }
        if (!timingSafeEqual(password, String(secret))) {
          return loginPage('Incorrect password.', nextParam);
        }
        const payload = b64url(
          new TextEncoder().encode(
            JSON.stringify({ exp: Date.now() + TTL * 1000 })
          )
        );
        const sig = await hmac(String(secret), payload);
        let dest = url.searchParams.get('next') || '/';
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
      const nextGet = url.searchParams.get('next') || '/';
      return loginPage('', nextGet);
    }

    if (await validCookie(request.headers.get('Cookie') || '', String(secret))) {
      if (url.pathname === '/api/orderbook') {
      try {
        const instId = url.searchParams.get('instId') || 'BTC-USDT';
        const sz = url.searchParams.get('sz') || '50';
        return new Response(JSON.stringify(await fetchOrderbook(instId, sz)), { headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=2' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 502, headers: { 'content-type': 'application/json' } });
      }
    }
    if (url.pathname === '/api/yf' || url.pathname === '/api/funding') {
        try {
          if (url.pathname === '/api/yf') {
            const symbol = url.searchParams.get('symbol') || '^VIX';
            const upstream =
              'https://query1.finance.yahoo.com/v8/finance/chart/' +
              encodeURIComponent(symbol) +
              '?interval=1d&range=5d';
            const res = await fetch(upstream, {
              headers: { 'User-Agent': 'Mozilla/5.0 TradingPulse/1.0', Accept: '*/*' },
            });
            if (!res.ok) {
              return new Response(JSON.stringify({ error: 'upstream ' + res.status }), {
                status: 502,
                headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
              });
            }
            const j = await res.json();
            const meta = j.chart.result[0].meta;
            const closes = (j.chart.result[0].indicators.quote[0].close || []).filter((x) => x != null);
            const price = meta.regularMarketPrice;
            let prev = meta.previousClose ?? meta.chartPreviousClose;
            if (closes.length >= 2) prev = closes[closes.length - 2];
            const chg = price - prev;
            const pct = prev ? (chg / prev) * 100 : 0;
            return new Response(JSON.stringify({ price, chg, pct, symbol }), {
              headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
            });
          }
          if (url.pathname === '/api/funding') {
            const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
            const upstream =
              'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=' +
              encodeURIComponent(symbol);
            const res = await fetch(upstream, { headers: { Accept: 'application/json' } });
            if (!res.ok) {
              return new Response(JSON.stringify({ error: 'upstream ' + res.status }), {
                status: 502,
                headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
              });
            }
            const j = await res.json();
            return new Response(JSON.stringify(j), {
              headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
            });
          }
        } catch (e) {
          return new Response(JSON.stringify({ error: 'proxy failed' }), {
            status: 502,
            headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
          });
        }
      }
      return serveAssets(request, env);
    }

    const login = new URL('/__login', url.origin);
    login.searchParams.set('next', url.pathname + url.search);
    return new Response(null, {
      status: 302,
      headers: {
        Location: login.toString(),
        'Cache-Control': 'no-store',
      },
    });
  },
};
