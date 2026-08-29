const COOKIE = 'trading_auth';
const TTL = 60 * 60 * 24 * 30;

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

async function validCookie(cookie, secret) {
  const m = cookie?.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!m) return false;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return false;
  const expected = await hmac(secret, payload);
  if (!timingSafeEqual(sig, expected)) return false;
  try { return JSON.parse(new TextDecoder().decode(fromB64url(payload))).exp > Date.now(); } catch { return false; }
}

function loginPage(error = '') {
  return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trading — Private</title><style>body{margin:0;background:#070a0f;color:#f4f7fb;font-family:Inter,system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}.box{width:min(360px,calc(100% - 40px));padding:28px;border:1px solid #263341;border-radius:18px;background:#101821;box-sizing:border-box}h1{font-size:22px;margin:0 0 8px}p{color:#8491a1;font-size:13px;margin:0 0 22px}input{width:100%;box-sizing:border-box;padding:13px;border:1px solid #263341;border-radius:10px;background:#080d13;color:#fff;font-size:16px;outline:none}button{width:100%;margin-top:12px;padding:13px;border:0;border-radius:10px;background:#62e3a0;color:#06120b;font-weight:900;font-size:14px}.err{color:#ff6f7c;font-size:12px;margin:0 0 12px}</style></head><body><form class="box" method="post"><h1>TRADING.</h1><p>Private access</p>${error?`<div class="err">${error}</div>`:''}<input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus><button>Enter Trading</button></form></body></html>`, {headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}

export default {
  async fetch(request, env) {
    const secret = env.TRADING_PASSWORD;
    if (!secret) return new Response('Authentication is not configured.', {status:503});
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/__login') {
      const body = await request.formData();
      const password = body.get('password') || '';
      if (!timingSafeEqual(String(password), String(secret))) return loginPage('Incorrect password.');
      const payload = b64url(new TextEncoder().encode(JSON.stringify({exp: Date.now() + TTL * 1000})));
      const sig = await hmac(secret, payload);
      const dest = url.searchParams.get('next') || '/';
      return new Response(null, {status:302, headers:{Location:dest, 'Set-Cookie':`${COOKIE}=${payload}.${sig}; Max-Age=${TTL}; Path=/; Secure; HttpOnly; SameSite=Lax`, 'Cache-Control':'no-store'}});
    }

    if (url.pathname === '/__login') return loginPage();
    if (await validCookie(request.headers.get('Cookie') || '', secret)) return env.ASSETS ? env.ASSETS.fetch(request) : fetch(request);
    const login = new URL('/__login', url.origin);
    login.searchParams.set('next', url.pathname + url.search);
    return new Response(null, {status:302, headers:{Location:login.toString(), 'Cache-Control':'no-store'}});
  }
};
