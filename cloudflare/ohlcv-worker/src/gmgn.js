/** GMGN OpenAPI — trending + hot searches. Weight 3 each. Poll slowly. */
export const GMGN_EVERY_MS = 20 * 60e3;
export const GMGN_MIN_GAP_MS = 5 * 60e3;
export const GMGN_OPENAPI = 'https://openapi.gmgn.ai';
/** Documented read-only demo key. Override with env.GMGN_API_KEY. */
export const GMGN_PUBLIC_KEY = 'gmgn_solbscbaseethmonadtron';
const SKIP = new Set(['sol', 'wsol', 'usdc', 'usdt', 'usd1', 'usdg', 'weth', 'eth', 'btc', 'wbtc', 'usdc.e', 'dai']);

export function gmgnTokenHref(chain, ca) {
  const c = String(chain || 'sol').toLowerCase();
  const ch = c === 'sol' || c === 'solana' ? 'sol' : c === 'ethereum' || c === 'eth' ? 'eth' : c;
  return 'https://gmgn.ai/' + ch + '/token/' + String(ca || '');
}

export function gmgnDexHref(chain, ca) {
  const c = String(chain || 'sol').toLowerCase();
  const ch = c === 'sol' || c === 'solana' ? 'solana' : c === 'eth' ? 'ethereum' : c;
  return 'https://dexscreener.com/' + ch + '/' + String(ca || '');
}

export function gmgnQualityPass(t, opts) {
  const minLiq = (opts && opts.minLiq) || 40000;
  const minVol = (opts && opts.minVol) || 80000;
  const minMc = (opts && opts.minMc) || 80000;
  const minHold = (opts && opts.minHold) || 150;
  const maxTop10 = (opts && opts.maxTop10) || 0.55;
  const sym = String((t && (t.symbol || t.name)) || '').toLowerCase();
  if (SKIP.has(sym)) return false;
  if (!(+((t && t.liquidity) || 0) >= minLiq)) return false;
  if (!(+((t && t.volume) || 0) >= minVol)) return false;
  const mc = +((t && t.market_cap) || 0);
  if (mc > 0 && mc < minMc) return false;
  const holders = +((t && t.holder_count) || 0);
  if (holders > 0 && holders < minHold) return false;
  const top10 = +((t && t.top_10_holder_rate) || 0);
  if (top10 > maxTop10) return false;
  return true;
}

export function slimGmgnToken(t, rank) {
  const chain = String((t && t.chain) || 'sol');
  const ca = (t && t.address) || '';
  return {
    rank: rank || 0,
    ca,
    chain: chain === 'sol' ? 'solana' : chain,
    name: (t && (t.symbol || t.name)) || ca.slice(0, 8),
    fullName: (t && t.name) || '',
    logo: (t && t.logo) || '',
    price: +(t && t.price) || 0,
    mcap: +(t && t.market_cap) || 0,
    liq: +(t && t.liquidity) || 0,
    volume: +(t && t.volume) || 0,
    swaps: +(t && t.swaps) || 0,
    holders: +(t && t.holder_count) || 0,
    visiting: +(t && t.visiting_count) || 0,
    m5: +(t && t.price_change_percent5m) || 0,
    h1: +(t && (t.price_change_percent1h || t.price_change_percent)) || 0,
    launchpad: (t && t.launchpad) || '',
    gmgnUrl: gmgnTokenHref(chain, ca),
    dexUrl: gmgnDexHref(chain, ca)
  };
}

export function pickGmgnList(raw, by, n) {
  const list = Array.isArray(raw) ? raw : [];
  let pool = list.filter((t) => gmgnQualityPass(t));
  if (pool.length < 8) {
    pool = list.filter((t) => gmgnQualityPass(t, { minLiq: 20000, minVol: 40000, minMc: 40000, minHold: 80, maxTop10: 0.7 }));
  }
  const key = by === 'visiting' ? (t) => +(t.visiting_count || 0) : (t) => +(t.volume || 0);
  pool.sort((a, b) => key(b) - key(a));
  return pool.slice(0, n || 20).map((t, i) => slimGmgnToken(t, i + 1));
}

export function unwrapGmgnRank(j) {
  let d = j && j.data;
  if (d && d.data && Array.isArray(d.data.rank)) return d.data.rank;
  if (d && Array.isArray(d.rank)) return d.rank;
  if (Array.isArray(d)) return d;
  return [];
}

export function unwrapGmgnHot(j) {
  const d = j && j.data;
  const out = [];
  if (Array.isArray(d)) {
    for (let i = 0; i < d.length; i++) {
      const toks = d[i] && d[i].tokens;
      if (Array.isArray(toks)) for (let k = 0; k < toks.length; k++) out.push(toks[k]);
    }
    return out;
  }
  if (d && Array.isArray(d.tokens)) return d.tokens;
  if (d && d.data && Array.isArray(d.data.tokens)) return d.data.tokens;
  return [];
}

function headers(env) {
  const key = String((env && env.GMGN_API_KEY) || GMGN_PUBLIC_KEY);
  return { accept: 'application/json', 'content-type': 'application/json', 'x-apikey': key };
}

function authQs() {
  const ts = Math.floor(Date.now() / 1000);
  const cid =
    (globalThis.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  return 'timestamp=' + ts + '&client_id=' + cid;
}

async function gmgnGet(env, path) {
  const r = await fetch(GMGN_OPENAPI + path + (path.indexOf('?') >= 0 ? '&' : '?') + authQs(), {
    headers: headers(env)
  });
  const text = await r.text();
  let j = null;
  try {
    j = JSON.parse(text);
  } catch (e) {
    throw new Error('gmgn bad json ' + r.status);
  }
  if (r.status === 429 || (j && j.code === 429)) {
    const err = new Error('gmgn 429');
    err.status = 429;
    throw err;
  }
  if (!r.ok || (j && j.code && j.code !== 0)) {
    throw new Error('gmgn ' + r.status + ' ' + String((j && (j.message || j.error || j.msg)) || '').slice(0, 80));
  }
  return j;
}

async function gmgnPost(env, path, body) {
  const r = await fetch(GMGN_OPENAPI + path + '?' + authQs(), {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify(body)
  });
  const text = await r.text();
  let j = null;
  try {
    j = JSON.parse(text);
  } catch (e) {
    throw new Error('gmgn bad json ' + r.status);
  }
  if (r.status === 429 || (j && j.code === 429)) {
    const err = new Error('gmgn 429');
    err.status = 429;
    throw err;
  }
  if (!r.ok || (j && j.code && j.code !== 0)) {
    throw new Error('gmgn ' + r.status + ' ' + String((j && (j.message || j.error || j.msg)) || '').slice(0, 80));
  }
  return j;
}

export async function fetchGmgnTrending(env, interval) {
  const iv = interval || '1h';
  const j = await gmgnGet(
    env,
    '/v1/market/rank?chain=sol&interval=' +
      encodeURIComponent(iv) +
      '&limit=50&order_by=volume&direction=desc&filters=not_honeypot'
  );
  return pickGmgnList(unwrapGmgnRank(j), 'volume', 20);
}

export async function fetchGmgnHot(env, interval) {
  const iv = interval || '1h';
  const j = await gmgnPost(env, '/v1/market/hot_searches', { chain: ['sol'], interval: iv, limit: 40 });
  return pickGmgnList(unwrapGmgnHot(j), 'visiting', 20);
}
