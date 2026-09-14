/**
 * Candle + breakout engine. Works in Cloudflare Workers and Node.
 * DexScreener is the quote tape. We own the candles.
 */
export const NTFY_DEFAULT = 'MyTradingMemeBreakout44';
export const NTFY_TOPICS_EXTRA = ['WildMemeMover'];
export const WATCHLIST_DEFAULT = 'https://sasikar.github.io/Trading/data/ca-recents.json';
export const WATCHLIST_FALLBACK =
  'https://raw.githubusercontent.com/Sasikar/Trading/master/data/ca-recents.json';

export const TF_SEC = {
  '1m': 60,
  '5m': 300,
  '10m': 600,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400
};
export const TAPE_TFS = Object.keys(TF_SEC);
export const DEX_TFS = ['1d', '1w'];
export const ALL_TFS = [...TAPE_TFS, ...DEX_TFS];
export const ALIGN_TFS = ['5m', '10m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'];
export const ALIGN_MIN = 2;

/** Closed bars required before NEW BREAKOUT is allowed. */
export const MIN_BARS = {
  '1m': 20,
  '5m': 16,
  '10m': 12,
  '15m': 12,
  '30m': 10,
  '1h': 8,
  '2h': 6,
  '4h': 6
};

export function chainIdOf(chain) {
  const c = String(chain || '').toLowerCase();
  if (c === 'sol' || c === 'solana') return 'solana';
  if (c === 'eth' || c === 'ethereum') return 'ethereum';
  if (c === 'robinhood' || c === 'hood' || c === 'rh') return 'robinhood';
  if (c === 'base') return 'base';
  if (c === 'bsc' || c === 'bnb') return 'bsc';
  return c || 'solana';
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function bucketMs(t, sec) {
  return Math.floor(t / (sec * 1000)) * sec * 1000;
}

export function median(nums) {
  const a = (nums || []).filter((n) => Number.isFinite(n)).slice().sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export async function fetchJSON(url, tries = 2) {
  let last;
  const host = (() => {
    try {
      return new URL(url).host;
    } catch (e) {
      return 'fetch';
    }
  })();
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'TradingOhlcv/1.0' },
        cache: 'no-store'
      });
      if (r.status === 429) {
        last = new Error('HTTP 429 ' + host);
        // Do not retry-storm 429s — that is how 18 coins turns into a ban.
        if (i + 1 < tries) await sleep(1600);
        continue;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + host);
      return await r.json();
    } catch (e) {
      last = e;
      if (i + 1 < tries) await sleep(280 * (i + 1));
    }
  }
  throw last || new Error('fetch failed ' + host);
}

export function pickBestPair(pairs, chain, ca) {
  const want = chainIdOf(chain);
  const caL = String(ca || '').toLowerCase();
  let list = (pairs || []).filter((p) => p && p.chainId === want);
  if (caL) {
    const exact = list.filter(
      (p) =>
        String((p.baseToken && p.baseToken.address) || '').toLowerCase() === caL ||
        String((p.quoteToken && p.quoteToken.address) || '').toLowerCase() === caL
    );
    if (exact.length) list = exact;
  }
  if (!list.length && caL) {
    list = (pairs || []).filter(
      (p) =>
        String((p.baseToken && p.baseToken.address) || '').toLowerCase() === caL ||
        String((p.quoteToken && p.quoteToken.address) || '').toLowerCase() === caL
    );
  }
  list.sort(
    (a, b) => +(((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0))
  );
  return list[0] || null;
}

export async function fetchWatchlist(url) {
  const urls = [url, WATCHLIST_DEFAULT, WATCHLIST_FALLBACK].filter((u) => u && /^https?:/i.test(u));
  let last;
  for (const u of [...new Set(urls)]) {
    try {
      const j = await fetchJSON(u, 2);
      const items = j.items || (Array.isArray(j) ? j : []);
      return items
        .map((e) => ({
          chain: chainIdOf(e.chain || e.poolNetwork),
          ca: String(e.ca || '').trim(),
          name: e.name || e.base || '',
          poolAddress: e.poolAddress || ''
        }))
        .filter((e) => e.ca);
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error('watchlist failed');
}

export async function fetchDexPair(ca) {
  const path = '/latest/dex/tokens/' + encodeURIComponent(ca);
  const j = await fetchJSON('https://api.dexscreener.com' + path, 1);
  return j.pairs || [];
}

/** One Dex HTTP call per chunk (not per coin). Proxy is skipped — it 429s. */
export async function fetchDexPairsForCas(cas, chunkSize = 12) {
  const uniq = [...new Set((cas || []).map((c) => String(c || '').trim()).filter(Boolean))];
  const byCa = new Map();
  let calls = 0;
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const path = '/latest/dex/tokens/' + chunk.map(encodeURIComponent).join(',');
    calls++;
    try {
      const j = await fetchJSON('https://api.dexscreener.com' + path, 1);
      const pairs = j.pairs || [];
      for (const ca of chunk) {
        const caL = ca.toLowerCase();
        const mine = pairs.filter((p) => {
          const b = String((p.baseToken && p.baseToken.address) || '').toLowerCase();
          const q = String((p.quoteToken && p.quoteToken.address) || '').toLowerCase();
          return b === caL || q === caL;
        });
        byCa.set(ca, mine);
      }
    } catch (e) {
      for (const ca of chunk) byCa.set(ca, e);
    }
    if (i + chunkSize < uniq.length) await sleep(450);
  }
  byCa.calls = calls;
  return byCa;
}

export function pairToTick(pair, row, now) {
  const pc = pair.priceChange || {};
  const vol = pair.volume || {};
  const tx = pair.txns || {};
  const t5 = tx.m5 || {};
  return {
    t: now,
    price: +pair.priceUsd || 0,
    vol5m: +vol.m5 || 0,
    vol1h: +vol.h1 || 0,
    vol24h: +vol.h24 || 0,
    buys5m: +t5.buys || 0,
    sells5m: +t5.sells || 0,
    liq: +((pair.liquidity && pair.liquidity.usd) || 0),
    m5: +pc.m5 || 0,
    h1: +pc.h1 || 0,
    h6: +pc.h6 || 0,
    h24: +pc.h24 || 0,
    pairAddress: pair.pairAddress || row.poolAddress || '',
    dexUrl: pair.url || '',
    chain: pair.chainId || row.chain,
    name: row.name || (pair.baseToken && pair.baseToken.symbol) || row.ca.slice(0, 8)
  };
}

export function hunterLinks(ca, chain) {
  const ch = chainIdOf(chain);
  const dexChain = ch === 'solana' ? 'solana' : ch === 'robinhood' ? 'robinhood' : 'ethereum';
  const bm = dexChain;
  const links = {
    bubblemaps: 'https://app.bubblemaps.io/' + bm + '/token/' + ca,
    scanner: 'https://sasikar.github.io/Trading/scanner.html',
    dex: 'https://dexscreener.com/' + dexChain + '/' + ca
  };
  if (ch === 'solana') {
    links.trench = 'https://trench.bot/clusters/' + encodeURIComponent(ca);
    links.rugcheck = 'https://rugcheck.xyz/tokens/' + encodeURIComponent(ca);
  } else if (ch === 'robinhood') {
    links.tokensniffer = 'https://tokensniffer.com/';
  } else {
    links.honeypot = 'https://honeypot.is/ethereum?address=' + encodeURIComponent(ca);
    links.goplus = 'https://gopluslabs.io/token-security/1/' + ca;
  }
  return links;
}

export function hunterBand(liq) {
  const x = +liq || 0;
  if (x >= 20000 && x < 100000) return 'micro';
  if (x >= 100000 && x < 1000000) return 'small';
  if (x >= 1000000 && x < 10000000) return 'mid';
  if (x >= 10000000 && x <= 100000000) return 'large';
  return '';
}

export function hunterPass(tick, pair, now) {
  const band = hunterBand(tick.liq);
  if (!band) return false;
  const created = pair && pair.pairCreatedAt ? +pair.pairCreatedAt : 0;
  if (created && now - created < 5 * 60e3) return false;
  const mom = momentumFromTick(tick);
  if (mom.stretched) return false;
  const m5 = tick.m5 || 0;
  const h1 = tick.h1 || 0;
  const vol = tick.vol5m || 0;
  if (band === 'micro') return m5 >= 1 && vol >= 50;
  if (band === 'small') return (m5 >= 0.4 || h1 >= 1) && vol >= 150;
  if (band === 'mid') return (m5 >= 0.2 || h1 >= 0.6) && vol >= 400;
  if (band === 'large') return (m5 >= 0.1 || h1 >= 0.4) && vol >= 800;
  return false;
}

export async function fetchHunterSeeds() {
  const seeds = [];
  const boosted = new Set();
  let calls = 0;
  const skipBase = new Set([
    'so11111111111111111111111111111111111111112',
    'epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v',
    'es9vmfrzacermjfrf4h2fyd4kconky11mcce8benwnyb',
    'usd1ttgy1n9kd0ha3m4vf4xtw6y9ydefb7niascszpc',
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    '0xdac17f958d2ee523a2206206994597c13d831ec7',
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'
  ]);
  const push = (ca, chain, src, isBoost, pair) => {
    const a = String(ca || '').trim();
    if (!a) return;
    if (skipBase.has(a.toLowerCase())) return;
    const ch = chainIdOf(chain);
    if (ch !== 'solana' && ch !== 'ethereum' && ch !== 'robinhood') return;
    if (isBoost) boosted.add(a.toLowerCase());
    seeds.push({ ca: a, chain: ch, boosted: !!isBoost, src, pair: pair || null });
  };
  const skipSym = new Set(['weth', 'usdg', 'usdc', 'usdt', 'sol', 'eth', 'wbtc']);
  for (const q of ['pump', 'SOL', 'pepe', 'ETH', 'robinhood']) {
    try {
      calls++;
      const s = await fetchJSON('https://api.dexscreener.com/latest/dex/search?q=' + encodeURIComponent(q), 1);
      for (const p of s.pairs || []) {
        if (!p) continue;
        const ch = chainIdOf(p.chainId);
        if (ch !== 'solana' && ch !== 'ethereum' && ch !== 'robinhood') continue;
        const sym = String((p.baseToken && p.baseToken.symbol) || '').toLowerCase();
        if (skipSym.has(sym)) continue;
        const ca = p.baseToken && p.baseToken.address;
        push(ca, ch, 'search', false, p);
      }
    } catch (e) {}
  }
  try {
    calls++;
    const prof = await fetchJSON('https://api.dexscreener.com/token-profiles/latest/v1', 1);
    for (const p of prof || []) {
      push(p.tokenAddress, p.chainId, 'profile', false, null);
    }
  } catch (e) {}
  try {
    calls++;
    const b = await fetchJSON('https://api.dexscreener.com/token-boosts/latest/v1', 1);
    for (const p of b || []) {
      push(p.tokenAddress, p.chainId, 'boost', true, null);
    }
  } catch (e) {}
  for (const s of seeds) if (boosted.has(s.ca.toLowerCase())) s.boosted = true;
  return { seeds, calls };
}

function volXOf(tick) {
  const vh1 = tick.vol1h || 0;
  const vm5 = tick.vol5m || 0;
  return vh1 / 12 > 0 ? vm5 / (vh1 / 12) : vm5 > 0 ? 2 : 0;
}

function buyROf(tick) {
  const n = (tick.buys5m || 0) + (tick.sells5m || 0);
  return n ? tick.buys5m / n : 0.5;
}

export function momentumFromTick(tick) {
  const m5 = tick.m5 || 0,
    h1 = tick.h1 || 0,
    h6 = tick.h6 || 0,
    h24 = tick.h24 || 0;
  const volX = volXOf(tick);
  const buyR = buyROf(tick);
  const liq = tick.liq || 0;
  const stretched = h6 >= 80 || h24 >= 150 || m5 >= 35;
  let score = 0;
  if (m5 >= 8) score += 25;
  else if (m5 >= 4) score += 18;
  else if (m5 >= 2) score += 10;
  if (volX >= 4) score += 25;
  else if (volX >= 2) score += 16;
  else if (volX >= 1.4) score += 8;
  if (h1 >= 5 && m5 > 0) score += 16;
  else if (h1 >= 0 && m5 >= 2) score += 10;
  if (buyR >= 0.65 && tick.buys5m + tick.sells5m >= 20) score += 15;
  else if (buyR >= 0.55 && tick.buys5m + tick.sells5m >= 10) score += 9;
  if (liq >= 200000) score += 10;
  else if (liq >= 50000) score += 7;
  else if (liq >= 15000) score += 4;
  if (m5 > 0 && h1 > 0) score += 5;
  if (stretched) score -= 18;
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    stretched,
    volX: +volX.toFixed(2),
    buyR: +buyR.toFixed(2)
  };
}

export function detectTapeBreakout(bars, tf, tick) {
  const need = MIN_BARS[tf] || 12;
  const mom = momentumFromTick(tick || {});
  const n = (bars || []).length;
  const level = rangeHighFromBars(bars);
  if (n < need) {
    return {
      state: 'WARMING',
      event: 'WARMING UP',
      fresh: false,
      held: false,
      age: 99,
      score: mom.score,
      bars: n,
      need,
      interesting: false,
      level
    };
  }
  const last = bars[bars.length - 1];
  const prior = bars.slice(Math.max(0, bars.length - 1 - 20), bars.length - 1);
  const rangeHigh = level || Math.max(...prior.map((b) => b.h));
  const medVol = median(prior.map((b) => b.vol));
  const ret = last.o > 0 ? ((last.c - last.o) / last.o) * 100 : 0;
  const runup = rangeHigh > 0 ? ((last.c - rangeHigh) / rangeHigh) * 100 : 0;
  const volOk = medVol > 0 ? last.vol >= 1.5 * medVol : last.vol > 0;
  const broke = last.c > rangeHigh && last.c >= last.o && volOk;

  let heldBars = 0;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].c >= rangeHigh * 0.998) heldBars++;
    else break;
  }

  let event = '—',
    state = 'WATCH',
    fresh = false,
    held = false,
    age = 99;
  if (broke && heldBars <= 2) {
    event = 'NEW BREAKOUT';
    fresh = true;
    held = true;
    age = 0;
    state = 'EARLY';
  } else if (last.c > rangeHigh * 0.995 && heldBars >= 1) {
    event = 'BREAKOUT HELD';
    held = true;
    age = Math.min(heldBars, 8);
    fresh = age <= 2;
    state = age <= 2 && mom.volX >= 1.3 && mom.buyR >= 0.52 ? 'STRONG CONFIRMED' : 'EARLY';
  }
  const sittingOnHigh = rangeHigh > 0 && last.c >= rangeHigh * 0.975;
  const pushing = last.c >= last.o || ret > 0;
  const volBuilding = medVol > 0 ? last.vol >= 1.1 * medVol : last.vol > 0 || mom.volX >= 1.15;
  let near = false;
  if (!broke && !held && sittingOnHigh && pushing && volBuilding && !mom.stretched) {
    event = 'CLOSE TO BREAK';
    near = true;
  }
  if (mom.stretched || runup >= 18 || ret >= 22) {
    if (held || broke) state = 'STRETCHED';
  }
  let score = mom.score;
  if (broke) score = Math.max(score, 58);
  if (state === 'STRETCHED') score = Math.max(0, score - 12);
  const interesting = state !== 'WATCH' || fresh || held || near || score >= 55;
  return {
    state,
    event,
    fresh,
    held,
    age,
    score: Math.max(0, Math.min(100, Math.round(score))),
    bars: n,
    need,
    interesting,
    near,
    level: rangeHigh,
    ret: +ret.toFixed(2),
    runup: +runup.toFixed(2)
  };
}

export function detectDexTf(tick, tf) {
  const mom = momentumFromTick(tick);
  const m5 = tick.m5 || 0,
    h1 = tick.h1 || 0,
    h6 = tick.h6 || 0,
    h24 = tick.h24 || 0;
  let event = '—',
    state = 'WATCH',
    fresh = false,
    held = false,
    age = 99;
  if (tf === '1d') {
    if (h6 >= 8 && h24 >= 5 && h24 < 40 && mom.volX >= 1.2 && !mom.stretched) {
      event = 'NEW BREAKOUT';
      fresh = true;
      held = true;
      age = 0;
      state = 'EARLY';
    } else if (h24 >= 10 && h6 > 0) {
      event = 'BREAKOUT HELD';
      held = true;
      age = 1;
      state = h24 >= 20 ? 'STRONG CONFIRMED' : 'EARLY';
    }
    if (h24 >= 80) state = 'STRETCHED';
  } else {
    if (h24 >= 15 && h6 > 0) {
      event = 'BREAKOUT HELD';
      held = true;
      age = 2;
      state = 'EARLY';
    }
    if (h24 >= 120) state = 'STRETCHED';
  }
  let near = false;
  if (event === '—' && !mom.stretched) {
    if (tf === '1d' && h6 >= 4 && h24 >= 2 && h24 < 8 && mom.volX >= 1.1) {
      event = 'CLOSE TO BREAK';
      near = true;
    } else if (tf === '1w' && h24 >= 8 && h24 < 15 && h6 > 0 && mom.volX >= 1.1) {
      event = 'CLOSE TO BREAK';
      near = true;
    }
  }
  return {
    state,
    event,
    fresh,
    held,
    age,
    score: mom.score,
    bars: 0,
    need: 0,
    near,
    interesting: state !== 'WATCH' || fresh || held || near || mom.score >= 55
  };
}

/** Immediate 4h/1h/2h label from Dex windows while our tape is still warming. */
export function detectLegacy4h(tick) {
  const mom = momentumFromTick(tick);
  const m5 = tick.m5 || 0,
    h1 = tick.h1 || 0,
    h6 = tick.h6 || 0;
  let event = '—',
    state = 'WATCH',
    fresh = false,
    held = false,
    age = 99;
  if (m5 >= 3 && h1 >= 2 && mom.volX >= 1.5 && !mom.stretched) {
    event = 'NEW BREAKOUT';
    fresh = true;
    held = true;
    age = 0;
    state = 'EARLY';
  } else if (h1 > 0 && h6 >= 8) {
    event = 'BREAKOUT HELD';
    held = true;
    age = h6 >= 25 ? 3 : 1;
    state = h1 >= 6 && mom.volX >= 1.3 && mom.buyR >= 0.52 ? 'STRONG CONFIRMED' : 'EARLY';
  }
  let near = false;
  if (event === '—' && m5 >= 1.2 && h1 >= 0 && mom.volX >= 1.15 && !mom.stretched) {
    event = 'CLOSE TO BREAK';
    near = true;
  }
  if (mom.stretched && (h1 > 5 || h6 > 40)) state = 'STRETCHED';
  let score = mom.score;
  if (state === 'STRETCHED') score = Math.max(0, score - 12);
  return {
    state,
    event,
    fresh,
    held,
    age,
    score: Math.max(0, Math.min(100, Math.round(score))),
    bars: 0,
    need: 0,
    interesting: state !== 'WATCH' || fresh || held || near || score >= 55,
    near,
    live: true
  };
}

/** Immediate 5m label from Dex m5 while our 5m tape is still filling. */
export function detectLive5m(tick) {
  const mom = momentumFromTick(tick);
  const m5 = tick.m5 || 0,
    h1 = tick.h1 || 0;
  let event = '—',
    state = 'WATCH',
    fresh = false,
    held = false,
    age = 99;
  if (m5 >= 4 && mom.volX >= 1.5 && !mom.stretched) {
    event = 'NEW BREAKOUT';
    fresh = true;
    held = true;
    age = 0;
    state = 'EARLY';
  } else if (m5 >= 2 && h1 > 0) {
    event = 'BREAKOUT HELD';
    held = true;
    age = 1;
    state = mom.volX >= 1.3 && mom.buyR >= 0.52 ? 'STRONG CONFIRMED' : 'EARLY';
  }
  let near = false;
  if (event === '—' && m5 >= 1.8 && m5 < 4 && mom.volX >= 1.15 && !mom.stretched) {
    event = 'CLOSE TO BREAK';
    near = true;
  }
  if (mom.stretched && m5 >= 8) state = 'STRETCHED';
  let score = mom.score;
  if (state === 'STRETCHED') score = Math.max(0, score - 12);
  return {
    state,
    event,
    fresh,
    held,
    age,
    score: Math.max(0, Math.min(100, Math.round(score))),
    bars: 0,
    need: 0,
    interesting: state !== 'WATCH' || fresh || held || near || score >= 55,
    near,
    live: true
  };
}

export function sizePctOf(state) {
  if (state === 'STRONG CONFIRMED') return 80;
  if (state === 'EARLY') return 35;
  return 0;
}

function pctStr(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return (x >= 0 ? '+' : '') + x.toFixed(1) + '%';
}

export function fmtPx(p) {
  const x = Number(p);
  if (!Number.isFinite(x) || x <= 0) return '';
  if (x >= 1) return String(+x.toFixed(4));
  if (x >= 0.01) return String(+x.toFixed(6));
  if (x >= 1e-6) return String(+x.toFixed(8));
  return x.toExponential(3);
}

export function rangeHighFromBars(bars) {
  if (!bars || bars.length < 2) return 0;
  const prior = bars.slice(Math.max(0, bars.length - 1 - 20), bars.length - 1);
  if (!prior.length) return 0;
  return Math.max(...prior.map((b) => b.h));
}

/** Plain-language reasons. Pages only display this; they do not compute it. */
export function describeWhy(tf, det, tick) {
  const mom = momentumFromTick(tick || {});
  const m5 = tick ? tick.m5 : 0;
  const h1 = tick ? tick.h1 : 0;
  const h6 = tick ? tick.h6 : 0;
  const h24 = tick ? tick.h24 : 0;
  const reasons = [];
  const tfu = String(tf || '').toUpperCase();
  const lvl = fmtPx(det && det.level);
  const lvlTag = lvl ? ' (' + lvl + ')' : '';
  const spot = tick && tick.price ? fmtPx(tick.price) : '';
  let distTxt = '';
  if (det && det.level > 0 && tick && tick.price > 0) {
    distTxt = pctStr(((tick.price - det.level) / det.level) * 100) + ' vs level';
  }

  if (det.state === 'WARMING') {
    return {
      why: 'Not a breakout yet. Need more ' + tfu + ' candles first (' + (det.bars || 0) + '/' + (det.need || 0) + ').',
      reasons: ['We only call a ' + tfu + ' break after enough closed candles, so one noisy print does not count.']
    };
  }

  if (det.live) {
    reasons.push('Tape for ' + tfu + ' is still filling, so this label uses Dex’s last 5m / 1h / 6h windows');
    reasons.push('Dex 5m ' + pctStr(m5) + ' · 1h ' + pctStr(h1) + ' · 6h ' + pctStr(h6) + ' · vol ' + mom.volX + 'x');
    if (tf === '5m') {
      if (m5 >= 4 && mom.volX >= 1.5) reasons.push('Rule hit: Dex 5m ≥ +4% and volume ≥ 1.5x usual 5m');
      else if (m5 >= 2 && h1 > 0) reasons.push('Rule hit: Dex 5m still ≥ +2% and 1h is green — treated as held');
      else if (det.near) reasons.push('Rule: Dex 5m is lifting but still below +4% / 1.5x — close, not broken');
    } else if (m5 >= 3 && h1 >= 2 && mom.volX >= 1.5) {
      reasons.push('Rule hit: Dex 5m ≥ +3%, 1h ≥ +2%, volume ≥ 1.5x');
    } else if (h1 > 0 && h6 >= 8) {
      reasons.push('Rule hit: 1h still green and 6h ≥ +8% — move is holding, not brand new');
    } else if (det.near) {
      reasons.push('Rule: Dex 5m/1h lifting but not a full live break yet — close to break');
    }
  } else if (TF_SEC[tf]) {
    reasons.push('This is our ' + tfu + ' candle vs the recent high — not “Dex 5m is pumping”');
    if (det.ret != null) reasons.push('This ' + tfu + ' bar ' + pctStr(det.ret) + ' from open to close');
    if (det.runup != null) reasons.push('Vs recent ' + tfu + ' high: ' + pctStr(det.runup));
    if (lvl) reasons.push('Breakout level ' + lvl + (spot ? ' · spot ' + spot : '') + (distTxt ? ' · ' + distTxt : ''));
    reasons.push('Closed ' + tfu + ' bars ' + (det.bars || 0) + '/' + (det.need || 0) + ' needed');
    reasons.push('Dex snapshot: 5m ' + pctStr(m5) + ' · 1h ' + pctStr(h1) + ' · vol ' + mom.volX + 'x usual 5m');
    if ((m5 || 0) < 1 && det.event === 'NEW BREAKOUT') {
      reasons.push('Dex last 5m is weak (' + pctStr(m5) + ') — this fired on a range break, not a 5m pump. Treat as noisy');
    }
  } else {
    reasons.push('Daily/weekly read from Dex 6h/24h windows');
    reasons.push('Dex 6h ' + pctStr(h6) + ' · 24h ' + pctStr(h24) + ' · vol ' + mom.volX + 'x');
  }

  if (mom.stretched) reasons.push('Caution: already stretched (6h ' + pctStr(h6) + ' · 24h ' + pctStr(h24) + ') — often late');
  else reasons.push('Not stretched yet (6h ' + pctStr(h6) + ' · 24h ' + pctStr(h24) + ')');

  let why;
  if (det.near || det.event === 'CLOSE TO BREAK') {
    why =
      'Not broken yet. Sitting close to the recent ' +
      tfu +
      ' high' +
      lvlTag +
      '. Volume building — EARLY watch, not a live break.' +
      (lvl ? ' Breaks if ' + tfu + ' closes above ' + lvl + '.' : '');
  } else if (det.event === 'NEW BREAKOUT' && det.live) {
    why =
      'EARLY live read: Dex shows a fresh pop with volume on this timeframe. Not confirmed — first push only.' +
      (lvl
        ? ' Provisional ' + tfu + ' high ' + lvlTag + '. Exit if ' + tfu + ' closes back under ' + lvl + '.'
        : ' No ' + tfu + ' candle high stored yet — tape still filling.');
  } else if (det.event === 'NEW BREAKOUT') {
    why =
      'LIVE: the latest ' +
      tfu +
      ' candle closed above the recent high' +
      lvlTag +
      '. First push, not a guaranteed runner.' +
      (lvl ? ' Exit if ' + tfu + ' closes back under ' + lvl + '.' : '');
  } else if (det.event === 'BREAKOUT HELD') {
    why = lvl
      ? 'Still holding above the breakout level on ' +
        tfu +
        ' (' +
        lvl +
        ').' +
        (spot ? ' Spot now ' + spot + (distTxt ? ' (' + distTxt + ')' : '') + '.' : '') +
        ' Exit if a ' +
        tfu +
        ' candle closes back under (' +
        lvl +
        ').'
      : 'Still holding on Dex 1h/6h. No ' +
        tfu +
        ' candle high stored yet (tape filling) — use DexScreener ' +
        tfu +
        ' high as your exit until our tape prints a level.';
  } else if (det.state === 'STRETCHED') {
    why =
      'Already extended on higher Dex windows. High chance this is late, not an early break.' +
      (lvl ? ' Invalidation still ' + tfu + ' close back under (' + lvl + ').' : '');
  } else {
    why = 'No breakout. Price is still inside the recent ' + tfu + ' range' + (lvlTag || '') + '.';
    if (!reasons.length) reasons.push('Dex 5m ' + pctStr(m5) + ' · 1h ' + pctStr(h1) + ' · vol ' + mom.volX + 'x');
  }
  if (lvl) reasons.push('Exit: ' + tfu + ' close back under ' + lvl);
  return { why, reasons };
}

/** Display buckets. Quiet coins get ''. Pages only paint non-empty sections. */
export function classifySection(det) {
  if (!det || det.state === 'WARMING') return '';
  const event = det.event || '';
  const state = det.state || '';
  const age = det.age == null ? 99 : det.age;
  if (det.near || event === 'CLOSE TO BREAK') return 'early';
  if (state === 'STRETCHED') return 'matured';
  if (event === 'NEW BREAKOUT' && (det.fresh || age <= 1)) return 'live';
  if (event === 'BREAKOUT HELD' || state === 'STRONG CONFIRMED' || event === 'NEW BREAKOUT') return 'matured';
  return '';
}

export function maturedKey(h) {
  return (
    String(h.chain || 'solana').toLowerCase() +
    ':' +
    String(h.ca || '').toLowerCase() +
    ':' +
    String(h.tf || '').toLowerCase()
  );
}

export function maturedTtlMs(tf) {
  const t = String(tf || '').toLowerCase();
  if (t === '1m') return 6 * 3600e3;
  if (t === '5m' || t === '10m' || t === '15m') return 24 * 3600e3;
  if (t === '30m' || t === '1h' || t === '2h') return 2 * 86400e3;
  return 3 * 86400e3;
}

export function matureStatusFrom(hit, rec) {
  if (hit && hit.section === 'matured') return 'held';
  const level = (hit && hit.level) || (rec && rec.level) || 0;
  const spot = hit && hit.spot;
  if (level > 0 && spot > 0 && spot < level) return 'broke';
  return 'failed';
}

export const VERDICT_HZ = [
  { id: 'short', label: 'Short', sub: '5m · 15m · 1h', tfs: ['5m', '15m', '1h'] },
  { id: 'medium', label: 'Medium', sub: '4h · 1d', tfs: ['4h', '1d'] },
  { id: 'long', label: 'Long', sub: '1d · 1w', tfs: ['1d', '1w'] }
];

export function verdictCall(hz, byTf, tick) {
  const xs = (hz.tfs || []).map((tf) => byTf[tf]).filter(Boolean);
  const tags = xs.map((h) => String(h.tf).toUpperCase() + ' ' + (h.section || h.state || 'WATCH'));
  const stretched = xs.some((h) => h.state === 'STRETCHED');
  const under = xs.some((h) => h.level > 0 && h.spot > 0 && h.spot < h.level);
  const live = xs.filter((h) => h.section === 'live');
  const held = xs.filter((h) => h.section === 'matured');
  const early = xs.filter((h) => h.section === 'early');
  if (under) {
    const h = xs.find((x) => x.level > 0 && x.spot > 0 && x.spot < x.level);
    return {
      call: 'EXIT',
      why:
        'Spot is back under the breakout level' +
        (h && h.levelTxt ? ' (' + h.levelTxt + ')' : '') +
        '. That is the exit.',
      reasons: tags
    };
  }
  if (stretched) {
    return {
      call: 'EXIT',
      why: 'Already stretched on ' + hz.label.toLowerCase() + ' — late, not a hold.',
      reasons: tags
    };
  }
  if (live.length) {
    return {
      call: 'HOLD',
      why:
        'Live break on ' +
        live.map((h) => String(h.tf).toUpperCase()).join(', ') +
        '. Stay until a candle closes back under the level.',
      reasons: tags
    };
  }
  if (held.length) {
    const h = held.find((x) => x.levelTxt) || held[0];
    return {
      call: 'HOLD',
      why:
        'Still holding' +
        (h.levelTxt ? ' above (' + h.levelTxt + ')' : '') +
        ' on ' +
        held.map((x) => String(x.tf).toUpperCase()).join(', ') +
        '.',
      reasons: tags
    };
  }
  if (early.length) {
    return {
      call: 'HOLD',
      why:
        'Close to break on ' +
        early.map((h) => String(h.tf).toUpperCase()).join(', ') +
        ' — setup is alive, not an exit.',
      reasons: tags
    };
  }
  const m5 = (tick && tick.m5) || 0;
  const h1 = (tick && tick.h1) || 0;
  const h6 = (tick && tick.h6) || 0;
  const h24 = (tick && tick.h24) || 0;
  if (hz.id === 'short') {
    if (h1 > 0 && m5 >= -0.5) {
      return {
        call: 'HOLD',
        why: 'Short tape still green (1h ' + pctStr(h1) + ', 5m ' + pctStr(m5) + ').',
        reasons: tags
      };
    }
    return {
      call: 'EXIT',
      why: 'No short break and 1h is not green (1h ' + pctStr(h1) + ', 5m ' + pctStr(m5) + ').',
      reasons: tags
    };
  }
  if (hz.id === 'medium') {
    if (h1 > 0 && h6 >= 8) {
      return {
        call: 'HOLD',
        why: 'Medium still holding on Dex 1h/6h (1h ' + pctStr(h1) + ', 6h ' + pctStr(h6) + ').',
        reasons: tags
      };
    }
    return {
      call: 'EXIT',
      why: 'Medium hold is dead (1h ' + pctStr(h1) + ', 6h ' + pctStr(h6) + ').',
      reasons: tags
    };
  }
  if (h24 >= 8) {
    return { call: 'HOLD', why: 'Long tape 24h still up (' + pctStr(h24) + ').', reasons: tags };
  }
  if (h24 < 0) {
    return { call: 'EXIT', why: 'Long tape 24h is red (' + pctStr(h24) + ').', reasons: tags };
  }
  return { call: 'EXIT', why: 'No 1d/1w breakout and 24h is flat (' + pctStr(h24) + ').', reasons: tags };
}

export function hitFrom(row, tick, det, tf, focus) {
  const mom = momentumFromTick(tick || {});
  const expl = describeWhy(tf, det, tick);
  return {
    name: (tick && tick.name) || row.name || row.ca.slice(0, 8),
    chain: (tick && tick.chain) || row.chain,
    ca: row.ca,
    tf,
    focus: !!(focus && focus.toLowerCase() === String(row.ca).toLowerCase()),
    state: det.state,
    event: det.event,
    fresh: det.fresh,
    held: det.held,
    age: det.age,
    score: det.score,
    confirms: Math.min(8, Math.round((det.score || 0) / 12.5)),
    sizePct: sizePctOf(det.state),
    interesting: det.interesting,
    warming: det.state === 'WARMING',
    bars: det.bars || 0,
    need: det.need || 0,
    tapeMin: det.bars ? Math.round(((det.bars || 0) * (TF_SEC[tf] || 0)) / 60) : 0,
    spot: tick ? tick.price : 0,
    liq: tick ? tick.liq : 0,
    m5: tick ? tick.m5 : 0,
    h1: tick ? tick.h1 : 0,
    h6: tick ? tick.h6 : 0,
    h24: tick ? tick.h24 : 0,
    volX: mom.volX,
    buyR: mom.buyR,
    dexUrl: tick ? tick.dexUrl : '',
    pairAddress: tick ? tick.pairAddress : row.poolAddress || '',
    live: !!det.live,
    near: !!det.near,
    section: classifySection(det),
    level: det.level || 0,
    levelTxt: fmtPx(det.level),
    distPct:
      det.level > 0 && tick && tick.price > 0
        ? +(((tick.price - det.level) / det.level) * 100).toFixed(2)
        : null,
    why: expl.why,
    reasons: expl.reasons
  };
}

export function nextUtcMidnight(now) {
  const d = new Date(now || Date.now());
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

export async function sendNtfy(topic, title, message) {
  const t = String(topic || NTFY_DEFAULT).trim() || NTFY_DEFAULT;
  const r = await fetch('https://ntfy.sh/' + encodeURIComponent(t), {
    method: 'POST',
    headers: {
      Title: String(title || '').slice(0, 90),
      Priority: 'high',
      Tags: 'chart_with_upwards_trend,moneybag'
    },
    body: title + '\n' + message
  });
  if (r.status === 429) {
    let extra = '';
    try {
      extra = await r.text();
    } catch (e) {}
    if (/daily|quota/i.test(extra)) throw new Error('NTFY_DAILY_QUOTA');
    throw new Error('HTTP 429 ntfy.sh');
  }
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ntfy.sh');
  return { ok: 1 };
}

export async function sendTelegram(token, chatId, text) {
  const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text || '').slice(0, 3900),
      disable_web_page_preview: true
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.description || 'telegram HTTP ' + r.status);
  return j;
}

export async function telegramGetMe(token) {
  const r = await fetch('https://api.telegram.org/bot' + token + '/getMe');
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.description || 'bad telegram token');
  return j.result;
}

export async function telegramGetUpdates(token) {
  await fetch('https://api.telegram.org/bot' + token + '/deleteWebhook').catch(() => {});
  const r = await fetch('https://api.telegram.org/bot' + token + '/getUpdates?limit=20');
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.description || 'telegram getUpdates failed');
  return j.result || [];
}

export function firstPrivateChatId(updates) {
  for (const u of updates || []) {
    const chat = (u.message || u.edited_message || u.my_chat_member || {}).chat;
    if (chat && chat.type === 'private' && chat.id) return String(chat.id);
  }
  return '';
}

/* ---------- stores ---------- */

export class MemoryStore {
  constructor() {
    this.meta = new Map();
    this.ticks = new Map();
    this.open = new Map();
    this.ohlcv = [];
    this.alerts = new Map();
    this.watch = [];
  }
  getMeta(k) {
    return this.meta.get(k);
  }
  setMeta(k, v) {
    this.meta.set(k, v);
  }
  getTick(ca) {
    return this.ticks.get(ca.toLowerCase());
  }
  setTick(ca, tick) {
    this.ticks.set(ca.toLowerCase(), tick);
  }
  allTicks() {
    return [...this.ticks.values()];
  }
  setWatch(rows) {
    this.watch = rows || [];
  }
  getWatch() {
    return this.watch;
  }
  openBar(ca, tf) {
    return this.open.get(ca.toLowerCase() + '|' + tf);
  }
  setOpenBar(ca, tf, bar) {
    this.open.set(ca.toLowerCase() + '|' + tf, bar);
  }
  closeBar(ca, tf, bar) {
    const caL = ca.toLowerCase();
    this.ohlcv.push({ ca: caL, tf, ...bar });
    this.open.delete(caL + '|' + tf);
  }
  bars(ca, tf, limit) {
    const caL = ca.toLowerCase();
    return this.ohlcv
      .filter((b) => b.ca === caL && b.tf === tf)
      .sort((a, b) => a.t - b.t)
      .slice(-(limit || 40));
  }
  prune(now) {
    const keep1m = now - 7 * 86400e3;
    const keep5 = now - 30 * 86400e3;
    this.ohlcv = this.ohlcv.filter((b) => {
      if (b.tf === '1m') return b.t >= keep1m;
      if (b.tf === '5m' || b.tf === '10m' || b.tf === '15m' || b.tf === '30m') return b.t >= keep5;
      return true;
    });
  }
  getAlert(key) {
    return this.alerts.get(key) || 0;
  }
  setAlert(key, t) {
    this.alerts.set(key, t);
  }
  dump() {
    return {
      meta: Object.fromEntries(this.meta),
      ticks: Object.fromEntries(this.ticks),
      open: Object.fromEntries(this.open),
      ohlcv: this.ohlcv.slice(-8000),
      alerts: Object.fromEntries(this.alerts),
      watch: this.watch
    };
  }
  load(d) {
    if (!d) return;
    this.meta = new Map(Object.entries(d.meta || {}));
    this.ticks = new Map(Object.entries(d.ticks || {}));
    this.open = new Map(Object.entries(d.open || {}));
    this.ohlcv = d.ohlcv || [];
    this.alerts = new Map(Object.entries(d.alerts || {}));
    this.watch = d.watch || [];
  }
}

export class Engine {
  constructor(store, env) {
    this.store = store;
    this.env = env || {};
    this.busy = false;
    this.lastErr = '';
    this.ntfyErr = '';
    this.telegramErr = '';
    this.dexCallsMin = [];
    this.rateLimitedUntil = 0;
    try {
      const saved = JSON.parse(store.getMeta('dex_calls_min') || '[]');
      if (Array.isArray(saved)) this.dexCallsMin = saved.filter((t) => Number.isFinite(+t)).map(Number);
    } catch (e) {}
    this.rateLimitedUntil = +store.getMeta('rate_limited_until') || 0;
    this.lastErr = store.getMeta('last_err') || '';
    this.ntfyErr = store.getMeta('ntfy_err') || '';
    this.telegramErr = store.getMeta('telegram_err') || '';
    const lastPoll = +store.getMeta('last_poll') || 0;
    const lastScanned = +store.getMeta('last_scanned') || 0;
    // Fresh ticks in the DB means a previous poll worked — don't keep a
    // leftover 429 pause from ntfy or a single Dex blip.
    if (lastScanned > 0 && Date.now() - lastPoll < 180000) this.rateLimitedUntil = 0;
    if (/ntfy/i.test(this.lastErr) || /NTFY_/.test(this.lastErr)) {
      this.ntfyErr = this.ntfyErr || this.lastErr;
      this.lastErr = '';
    }
    if ((/ntfy/i.test(this.ntfyErr) || /429/.test(this.ntfyErr) || /quota|daily/i.test(this.ntfyErr)) && !this.ntfyPausedUntil()) {
      this.store.setMeta('ntfy_paused_until', String(nextUtcMidnight()));
      this.ntfyErr =
        'Phone alerts paused until midnight UTC — ntfy.sh free daily limit is used up. Dashboard stays live.';
      this.store.setMeta('ntfy_err', this.ntfyErr);
    }
  }

  topic() {
    return this.env.NTFY_TOPIC || NTFY_DEFAULT;
  }
  watchUrl() {
    return this.env.WATCHLIST_URL || WATCHLIST_DEFAULT;
  }
  ntfyPausedUntil() {
    return +this.store.getMeta('ntfy_paused_until') || 0;
  }
  ntfyPaused(now) {
    now = now || Date.now();
    return now < this.ntfyPausedUntil();
  }
  markNtfyFail(err) {
    const msg = String(err && err.message ? err.message : err);
    if (msg === 'NTFY_DAILY_QUOTA' || /daily|quota/i.test(msg)) {
      const until = nextUtcMidnight();
      this.store.setMeta('ntfy_paused_until', String(until));
      this.ntfyErr = 'Phone alerts paused until midnight UTC — ntfy.sh free daily limit is used up. Dashboard stays live.';
    } else {
      this.ntfyErr = msg;
    }
    this.store.setMeta('ntfy_err', this.ntfyErr);
  }

  telegramWantedUsername() {
    return String(this.env.TELEGRAM_BOT_USERNAME || 'MyTradingBreakoutBot').replace(/^@/, '');
  }
  telegramToken() {
    return String(this.env.TELEGRAM_BOT_TOKEN || this.store.getMeta('telegram_bot_token') || '').trim();
  }
  telegramChatId() {
    return String(this.env.TELEGRAM_CHAT_ID || this.store.getMeta('telegram_chat_id') || '').trim();
  }
  markTelegramFail(err) {
    this.telegramErr = String(err && err.message ? err.message : err);
    this.store.setMeta('telegram_err', this.telegramErr);
  }
  async resolveTelegramChat() {
    const saved = this.telegramChatId();
    if (saved) return saved;
    const token = this.telegramToken();
    if (!token) return '';
    const updates = await telegramGetUpdates(token);
    const id = firstPrivateChatId(updates);
    if (id) this.store.setMeta('telegram_chat_id', id);
    return id;
  }
  async bindTelegram(tokenIn) {
    const incoming = String(tokenIn || '').trim();
    const token = incoming || this.telegramToken();
    if (!token) throw new Error('no telegram token');
    const me = await telegramGetMe(token);
    const want = this.telegramWantedUsername();
    if (String(me.username || '') !== want) throw new Error('bot username mismatch');
    this.store.setMeta('telegram_bot_token', token);
    this.store.setMeta('telegram_bot_username', me.username || want);
    const chat = await this.resolveTelegramChat();
    this.telegramErr = chat ? '' : 'Open t.me/' + want + ' and tap Start, then send hi';
    this.store.setMeta('telegram_err', this.telegramErr);
    if (chat && this.store.getMeta('telegram_welcome_sent') !== '1') {
      try {
        await sendTelegram(
          token,
          chat,
          'Trading Breakouts linked.\nYou will get NEW BREAKOUT alerts here as a private DM.\nMute other Telegram groups — this chat is the only one that needs sound.'
        );
        this.store.setMeta('telegram_welcome_sent', '1');
      } catch (e) {
        this.markTelegramFail(e);
      }
    }
    return {
      ok: true,
      username: me.username || want,
      chatBound: !!chat,
      needStart: !chat
    };
  }
  async pingTelegram() {
    if (!this.telegramToken()) throw new Error('telegram token not stored yet');
    const chat = await this.resolveTelegramChat();
    if (!chat) {
      const want = this.telegramWantedUsername();
      throw new Error('Open t.me/' + want + ' and tap Start, then send hi');
    }
    await sendTelegram(this.telegramToken(), chat, 'Test ping from your trading worker. Alerts will arrive in this chat.');
    this.telegramErr = '';
    this.store.setMeta('telegram_err', '');
    return { ok: true, chatBound: true, username: this.telegramWantedUsername() };
  }

  dexCallsLastMin(now) {
    const cut = now - 60000;
    this.dexCallsMin = this.dexCallsMin.filter((t) => t >= cut);
    return this.dexCallsMin.length;
  }

  applyTick(ca, tick) {
    const prev = this.store.getTick(ca);
    const volPiece = prev && tick.vol24h >= 0 ? Math.max(0, tick.vol24h - (prev.vol24h || 0)) : 0;
    this.store.setTick(ca, tick);
    const closed = [];
    for (const tf of TAPE_TFS) {
      const sec = TF_SEC[tf];
      const bucket = bucketMs(tick.t, sec);
      let open = this.store.openBar(ca, tf);
      if (open && open.t !== bucket) {
        this.store.closeBar(ca, tf, open);
        closed.push({ tf, bar: open });
        open = null;
      }
      if (!open) {
        open = {
          t: bucket,
          o: tick.price,
          h: tick.price,
          l: tick.price,
          c: tick.price,
          vol: volPiece,
          buys: tick.buys5m,
          sells: tick.sells5m,
          n: 1
        };
      } else {
        open.h = Math.max(open.h, tick.price);
        open.l = Math.min(open.l, tick.price);
        open.c = tick.price;
        open.vol += volPiece;
        open.buys = tick.buys5m;
        open.sells = tick.sells5m;
        open.n += 1;
      }
      this.store.setOpenBar(ca, tf, open);
    }
    return closed;
  }

  cooldownMs(tf) {
    if (tf === '1m') return 20 * 60e3;
    if (tf === '5m' || tf === '10m') return 20 * 60e3;
    return 30 * 60e3;
  }

  shouldAlert(hit, tf) {
    if (hit.state === 'WARMING' || hit.state === 'WATCH' || hit.section === 'early') return false;
    if (tf === '1m') {
      if (!hit.focus) return false;
      if (this.store.getMeta('focus_1m_alerts') !== 'on') return false;
      return hit.fresh && hit.event === 'NEW BREAKOUT';
    }
    // One phone ping per coin — live 4h only. 5m/1h/2h show on the cards.
    if (hit.live && tf !== '4h') return false;
    if (tf === '5m' || tf === '10m') {
      return hit.fresh && hit.event === 'NEW BREAKOUT' && hit.score >= 55;
    }
    return hit.fresh && hit.held && hit.age <= 2 && (hit.score >= 55 || hit.event === 'NEW BREAKOUT');
  }

  shouldNtfy(hit, tf, focus) {
    if (this.ntfyPaused()) return false;
    return this.shouldAlert(hit, tf, focus);
  }

  async maybeAlert(hit, tf) {
    if (!this.shouldAlert(hit, tf)) return false;
    const now = Date.now();
    const key = tf === '1m' ? hit.ca.toLowerCase() + '|1m' : hit.ca.toLowerCase() + '|coin';
    if (now - this.store.getAlert(key) < this.cooldownMs(tf === '1m' ? '1m' : '4h')) return false;
    const tfu = String(tf).toUpperCase() + (hit.live ? ' live' : '');
    const title = '🚀 ' + hit.name + ' · ' + hit.event + ' (' + tfu + ')';
    const msg = [
      hit.name + ' (' + (hit.chain === 'solana' ? 'SOL' : 'ETH') + ')',
      hit.state + ' · score ' + hit.score + '/100 · TF (' + tfu + ')',
      '',
      'Why it fired',
      hit.why || 'Range break on ' + tf,
      '',
      ...(hit.reasons && hit.reasons.length ? hit.reasons.map((r) => '• ' + r) : []),
      '',
      'Dex 5m ' + pctStr(hit.m5) + ' · 1h ' + pctStr(hit.h1) + ' · vol ' + hit.volX + 'x',
      hit.levelTxt
        ? 'Level (' + String(tf).toUpperCase() + '): ' + hit.levelTxt +
          (hit.spot ? ' · spot ' + fmtPx(hit.spot) : '') +
          (hit.distPct != null ? ' · ' + pctStr(hit.distPct) + ' vs level' : '')
        : 'Level: not stored yet (tape filling)',
      hit.levelTxt ? 'Exit: ' + String(tf).toUpperCase() + ' close back under ' + hit.levelTxt : '',
      'CA: ' + hit.ca,
      'https://sasikar.github.io/Trading/index.html?tab=breakouts'
    ].join('\n');
    let via = '';
    const token = this.telegramToken();
    if (token) {
      try {
        let chat = this.telegramChatId();
        if (!chat) chat = await this.resolveTelegramChat();
        if (!chat) throw new Error('Open t.me/' + this.telegramWantedUsername() + ' and tap Start, then send hi');
        await sendTelegram(token, chat, title + '\n' + msg);
        this.telegramErr = '';
        this.store.setMeta('telegram_err', '');
        via = 'telegram';
      } catch (e) {
        this.markTelegramFail(e);
        const m = String(e && e.message ? e.message : e);
        if (/tap Start|not stored|no telegram token/i.test(m)) return false;
      }
    }
    if (!via && !this.ntfyPaused()) {
      try {
        await sendNtfy(this.topic(), title, msg);
        this.ntfyErr = '';
        this.store.setMeta('ntfy_err', '');
        via = 'ntfy';
      } catch (e) {
        this.markNtfyFail(e);
      }
    }
    if (!via) return false;
    this.store.setAlert(key, now);
    this.store.setMeta(
      'last_alert',
      JSON.stringify({
        name: hit.name,
        ca: hit.ca,
        tf,
        event: hit.event,
        state: hit.state,
        score: hit.score,
        why: hit.why || '',
        reasons: hit.reasons || [],
        via,
        at: new Date(now).toISOString()
      })
    );
    return true;
  }

  evaluateRow(row, tf, focus) {
    const tick = this.store.getTick(row.ca);
    if (!tick) {
      return hitFrom(row, null, {
        state: 'WARMING',
        event: 'NO TICK',
        fresh: false,
        held: false,
        age: 99,
        score: 0,
        bars: 0,
        need: MIN_BARS[tf] || 0,
        interesting: false
      }, tf, focus);
    }
    let det;
    if (TF_SEC[tf]) {
      const closed = this.store.bars(row.ca, tf, 40);
      det = detectTapeBreakout(closed, tf, tick);
      if (det.state === 'WARMING' && (tf === '4h' || tf === '2h' || tf === '1h')) {
        const live = detectLegacy4h(tick);
        det = Object.assign({}, live, { bars: det.bars, need: det.need, level: det.level || 0 });
      } else if (det.state === 'WARMING' && tf === '5m') {
        const live = detectLive5m(tick);
        det = Object.assign({}, live, { bars: det.bars, need: det.need, level: det.level || 0 });
      }
    } else {
      det = detectDexTf(tick, tf);
    }
    return hitFrom(row, tick, det, tf, focus);
  }

  snapshot(tf) {
    const now = Date.now();
    const focus = this.store.getMeta('focus_ca') || '';
    const tfn = String(tf || '4h').toLowerCase();
    let all = this.store.getWatch().map((r) => this.evaluateRow(r, tfn, focus));
    if (tfn === '1m') all = all.filter((h) => h.focus);
    const extra = this.syncMatured(tfn, all, now);
    const live = all.filter((h) => h.section);
    const held = new Set(live.filter((h) => h.section === 'matured').map((h) => String(h.ca).toLowerCase()));
    const hits = live.concat(extra.filter((h) => !held.has(String(h.ca).toLowerCase())));
    const rank = { early: 0, live: 1, matured: 2 };
    const stRank = { held: 0, failed: 1, broke: 2 };
    hits.sort(
      (a, b) =>
        (rank[a.section] ?? 9) - (rank[b.section] ?? 9) ||
        (stRank[a.matureStatus] ?? 9) - (stRank[b.matureStatus] ?? 9) ||
        (b.maturedAt || 0) - (a.maturedAt || 0) ||
        (b.score || 0) - (a.score || 0)
    );
    const am = this.alignMap(focus);
    for (const h of hits) {
      const a = am[String(h.ca || '').toLowerCase()];
      if (!a) continue;
      h.align = a.n;
      h.alignTfs = a.tfs;
      h.alignParts = a.parts;
    }
    return hits;
  }

  alignMap(focus) {
    const map = {};
    const rows = this.store.getWatch();
    for (const row of rows) {
      const tfs = [];
      const parts = [];
      let best = null;
      for (const tf of ALIGN_TFS) {
        const h = this.evaluateRow(row, tf, focus);
        if (h.section !== 'early' && h.section !== 'live' && h.section !== 'matured') continue;
        tfs.push(tf);
        parts.push({ tf, section: h.section, state: h.state, event: h.event, score: h.score });
        if (
          !best ||
          (h.section === 'live' && best.section !== 'live') ||
          (h.section === 'early' && best.section === 'matured') ||
          (h.score || 0) > (best.score || 0)
        )
          best = h;
      }
      map[String(row.ca).toLowerCase()] = { n: tfs.length, tfs, parts, hit: best, name: row.name, ca: row.ca };
    }
    return map;
  }

  snapshotAlign() {
    const focus = this.store.getMeta('focus_ca') || '';
    const m = this.alignMap(focus);
    return Object.keys(m)
      .map((k) => m[k])
      .filter((x) => x.n >= ALIGN_MIN && x.hit)
      .map((x) =>
        Object.assign({}, x.hit, {
          section: 'align',
          align: x.n,
          alignTfs: x.tfs,
          alignParts: x.parts
        })
      )
      .sort((a, b) => (b.align || 0) - (a.align || 0) || (b.score || 0) - (a.score || 0));
  }

  verdictFor(ca) {
    const want = String(ca || '').toLowerCase();
    const watch = this.store.getWatch();
    const coins = watch.map((w) => ({ ca: w.ca, name: w.name, chain: w.chain }));
    if (!want) return { coins, verdict: null };
    const row = watch.find((w) => String(w.ca).toLowerCase() === want);
    if (!row) return { coins, verdict: null, error: 'not a saved coin' };
    const focus = this.store.getMeta('focus_ca') || '';
    const byTf = {};
    for (const tf of ['5m', '15m', '1h', '4h', '1d', '1w']) {
      byTf[tf] = this.evaluateRow(row, tf, focus);
    }
    const tick = this.store.getTick(row.ca);
    const horizons = VERDICT_HZ.map((hz) => {
      const v = verdictCall(hz, byTf, tick);
      return {
        id: hz.id,
        label: hz.label,
        sub: hz.sub,
        call: v.call,
        why: v.why,
        reasons: v.reasons,
        tfs: hz.tfs.map((tf) => {
          const h = byTf[tf] || {};
          return {
            tf,
            section: h.section || '',
            state: h.state,
            event: h.event,
            levelTxt: h.levelTxt || '',
            distPct: h.distPct
          };
        })
      };
    });
    return {
      coins,
      verdict: {
        name: (tick && tick.name) || row.name,
        ca: row.ca,
        chain: row.chain,
        spot: tick && tick.price,
        liq: tick && tick.liq,
        m5: tick && tick.m5,
        h1: tick && tick.h1,
        h6: tick && tick.h6,
        h24: tick && tick.h24,
        dexUrl: tick && tick.dexUrl,
        horizons
      }
    };
  }

  syncMatured(tf, all, now) {
    let map = {};
    try {
      map = JSON.parse(this.store.getMeta('matured_hist') || '{}');
    } catch (e) {
      map = {};
    }
    const ttl = maturedTtlMs(tf);
    for (const h of all) {
      if (h.section !== 'matured') continue;
      const k = maturedKey(h);
      const prev = map[k];
      const newCycle = prev && prev.status && prev.status !== 'held';
      const maturedAt = !prev || newCycle ? now : prev.maturedAt || now;
      map[k] = {
        ca: h.ca,
        chain: h.chain,
        name: h.name,
        tf,
        maturedAt,
        lastHeldAt: now,
        failedAt: null,
        level: h.level || (prev && prev.level) || 0,
        status: 'held',
        dexUrl: h.dexUrl || (prev && prev.dexUrl) || '',
        pairAddress: h.pairAddress || ''
      };
      h.matureStatus = 'held';
      h.maturedAt = maturedAt;
      h.history = false;
    }
    const extra = [];
    for (const k of Object.keys(map)) {
      const rec = map[k];
      if (String(rec.tf || '').toLowerCase() !== tf) continue;
      if (now - (rec.maturedAt || 0) > ttl) {
        delete map[k];
        continue;
      }
      const live = all.find((h) => String(h.ca).toLowerCase() === String(rec.ca || '').toLowerCase());
      if (live && live.section === 'matured') continue;
      const status = matureStatusFrom(live, rec);
      rec.status = status;
      rec.failedAt = rec.failedAt || now;
      rec.level = (live && live.level) || rec.level || 0;
      const tfu = String(tf).toUpperCase();
      const lvl = rec.level ? fmtPx(rec.level) : '';
      const why =
        status === 'broke'
          ? 'BROKE: spot back under the breakout level' +
            (lvl ? ' (' + lvl + ')' : '') +
            '. Old matured cycle kept as history.'
          : 'FAILED: no longer a hold on ' +
            tfu +
            '. Old matured cycle kept as history' +
            (lvl ? ' — last level (' + lvl + ')' : '') +
            '.';
      const base = live
        ? Object.assign({}, live)
        : {
            name: rec.name,
            ca: rec.ca,
            chain: rec.chain,
            tf,
            state: 'WATCH',
            event: '—',
            score: 0,
            spot: 0,
            level: rec.level || 0,
            levelTxt: lvl,
            dexUrl: rec.dexUrl || '',
            m5: 0,
            h1: 0,
            h6: 0,
            reasons: [],
            liq: 0
          };
      extra.push(
        Object.assign({}, base, {
          section: 'matured',
          history: true,
          matureStatus: status,
          maturedAt: rec.maturedAt,
          failedAt: rec.failedAt,
          event: status === 'broke' ? 'BROKE' : 'FAILED',
          state: status === 'broke' ? 'BROKE' : 'FAILED',
          why,
          reasons: [
            'First matured then — still showing as history',
            status === 'broke' ? 'Price lost the printed level' : 'Hold rule died (1h/6h or back in range)'
          ]
        })
      );
    }
    this.store.setMeta('matured_hist', JSON.stringify(map));
    extra.sort((a, b) => (b.maturedAt || 0) - (a.maturedAt || 0));
    return extra;
  }

  status(now) {
    now = now || Date.now();
    let lastAlert = null;
    try {
      lastAlert = JSON.parse(this.store.getMeta('last_alert') || 'null');
    } catch (e) {}
    const lastPoll = +this.store.getMeta('last_poll') || 0;
    const lastAll = +this.store.getMeta('last_all') || 0;
    const fresh = lastPoll && now - lastPoll < 120000;
    const health =
      !fresh && this.rateLimitedUntil > now
        ? 'RATE_LIMITED'
        : fresh
          ? 'LIVE'
          : lastPoll
            ? 'STALE'
            : 'STARTING';
    const watch = this.store.getWatch();
    const tops = watch
      .map((r) => this.evaluateRow(r, '4h', this.store.getMeta('focus_ca') || ''))
      .filter((h) => h.section)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 8)
      .map((h) => ({
        name: h.name,
        ca: h.ca,
        state: h.state,
        score: h.score,
        event: h.event,
        section: h.section,
        ret1: h.m5
      }));
    return {
      health,
      engine: 'cloudflare-ohlcv',
      source: 'DexScreener tape → our candles',
      topic: this.topic(),
      focus: this.store.getMeta('focus_ca') || '',
      focusName: this.store.getMeta('focus_name') || '',
      focus1mAlerts: this.store.getMeta('focus_1m_alerts') === 'on',
      lastPoll: lastPoll ? new Date(lastPoll).toISOString() : null,
      lastAll: lastAll ? new Date(lastAll).toISOString() : null,
      pollMs: now - lastPoll,
      candidates: watch.length,
      dexCallsLastMin: this.dexCallsLastMin(now),
      dexBudget: 30,
      error: this.lastErr || '',
      ntfyError: this.ntfyPaused(now)
        ? this.ntfyErr || 'Phone alerts paused until midnight UTC (ntfy free daily limit)'
        : this.ntfyErr || '',
      ntfyPaused: this.ntfyPaused(now),
      telegramBot: this.telegramWantedUsername(),
      telegramBound: !!this.telegramChatId(),
      telegramError: this.telegramErr || '',
      telegramReady: !!(this.telegramToken() && this.telegramChatId()),
      lastAlert,
      topScores: tops,
      watch: watch.map((w) => ({ ca: w.ca, name: w.name, chain: w.chain }))
    };
  }

  async refreshWatch() {
    const rows = await fetchWatchlist(this.watchUrl());
    let extra = [];
    try {
      extra = JSON.parse(this.store.getMeta('watch_extra') || '[]');
    } catch (e) {}
    const seen = new Set(rows.map((r) => r.ca.toLowerCase()));
    for (const e of extra) {
      if (!e || !e.ca || seen.has(String(e.ca).toLowerCase())) continue;
      rows.push({
        chain: e.chain || 'solana',
        ca: e.ca,
        name: e.name || '',
        poolAddress: e.poolAddress || ''
      });
      seen.add(String(e.ca).toLowerCase());
    }
    this.store.setWatch(rows);
    return rows;
  }

  hunterHits() {
    try {
      return JSON.parse(this.store.getMeta('hunter_hits') || '[]');
    } catch (e) {
      return [];
    }
  }
  hunterVerifiedMap() {
    try {
      return JSON.parse(this.store.getMeta('hunter_verified') || '{}');
    } catch (e) {
      return {};
    }
  }
  markHunterVerified(ca, tool) {
    const t = String(tool || '').toLowerCase();
    if (!/^(bubblemaps|trench|rugcheck|honeypot|goplus|tokensniffer|dex)$/.test(t)) throw new Error('bad tool');
    const m = this.hunterVerifiedMap();
    const k = String(ca || '').toLowerCase();
    if (!k) throw new Error('no ca');
    m[k] = m[k] || {};
    m[k][t] = Date.now();
    this.store.setMeta('hunter_verified', JSON.stringify(m));
    return { ca: k, verified: m[k] };
  }
  saveHunterCa(ca) {
    const hits = this.hunterHits();
    const h = hits.find((x) => String(x.ca).toLowerCase() === String(ca || '').toLowerCase());
    if (!h) throw new Error('not on hunter list');
    let extra = [];
    try {
      extra = JSON.parse(this.store.getMeta('watch_extra') || '[]');
    } catch (e) {}
    if (!extra.some((e) => String(e.ca).toLowerCase() === h.ca.toLowerCase())) {
      extra.push({ ca: h.ca, chain: h.chain || 'solana', name: h.name, poolAddress: h.pairAddress || '' });
      this.store.setMeta('watch_extra', JSON.stringify(extra));
    }
    const rows = this.store.getWatch();
    if (!rows.some((r) => r.ca.toLowerCase() === h.ca.toLowerCase())) {
      rows.push({
        ca: h.ca,
        chain: h.chain || 'solana',
        name: h.name || h.ca.slice(0, 8),
        poolAddress: h.pairAddress || ''
      });
      this.store.setWatch(rows);
    }
    return { ok: true, ca: h.ca, name: h.name };
  }
  decorateHunter(hits) {
    const vmap = this.hunterVerifiedMap();
    const watch = new Set(this.store.getWatch().map((w) => w.ca.toLowerCase()));
    return (hits || []).map((h) => {
      const v = vmap[String(h.ca).toLowerCase()] || {};
      const links = hunterLinks(h.ca, h.chain);
      if (h.dexUrl) links.dex = h.dexUrl;
      return Object.assign({}, h, {
        verified: {
          bubblemaps: !!v.bubblemaps,
          trench: !!v.trench,
          rugcheck: !!v.rugcheck,
          honeypot: !!v.honeypot,
          goplus: !!v.goplus,
          tokensniffer: !!v.tokensniffer,
          dex: !!v.dex
        },
        saved: watch.has(String(h.ca).toLowerCase()),
        links
      });
    });
  }
  async refreshHunter(now, force) {
    now = now || Date.now();
    if (!force && now < this.rateLimitedUntil) return { skipped: true, rateLimited: true };
    if (!force && this.dexCallsLastMin(now) >= 22) return { skipped: true, budget: true };
    const lastDisc = +this.store.getMeta('hunter_discover') || 0;
    const lastScore = +this.store.getMeta('hunter_at') || 0;
    const doDiscover = force || now - lastDisc >= 5 * 60e3;
    const doScore = doDiscover || now - lastScore >= 90e3;
    if (!doScore) return { skipped: true };
    let seeds = [];
    let calls = 0;
    if (doDiscover) {
      try {
        const got = await fetchHunterSeeds();
        seeds = got.seeds || [];
        calls += got.calls || 0;
        this.store.setMeta('hunter_discover', String(now));
      } catch (e) {
        this.store.setMeta('hunter_err', String(e && e.message ? e.message : e));
        seeds = this.hunterHits().map((h) => ({ ca: h.ca, chain: h.chain, boosted: h.boosted }));
      }
    } else {
      seeds = this.hunterHits().map((h) => ({ ca: h.ca, chain: h.chain, boosted: h.boosted, src: h.src }));
    }
    if (!seeds.length) {
      this.store.setMeta('hunter_at', String(now));
      return { hits: 0, calls };
    }
    const watch = new Set(this.store.getWatch().map((w) => w.ca.toLowerCase()));
    const uniq = [];
    const seen = new Set();
    for (const s of seeds) {
      const k = String(s.ca || '').toLowerCase();
      if (!k || seen.has(k) || watch.has(k)) continue;
      seen.add(k);
      uniq.push(s);
    }
    const needFetch = uniq.filter((s) => !s.pair);
    const byCa = await fetchDexPairsForCas(
      needFetch.map((s) => s.ca),
      12
    );
    calls += byCa.calls || 0;
    for (let i = 0; i < (byCa.calls || 0); i++) this.dexCallsMin.push(now);
    const hits = [];
    let miss = 0;
    for (const s of uniq) {
      let pair = s.pair;
      if (!pair) {
        const got = byCa.get(s.ca);
        if (!got || got instanceof Error) {
          miss++;
          continue;
        }
        pair = pickBestPair(got, s.chain || 'solana', s.ca);
      }
      if (!pair) {
        miss++;
        continue;
      }
      const row = { ca: s.ca, chain: pair.chainId || 'solana', name: (pair.baseToken && pair.baseToken.symbol) || s.ca.slice(0, 6), poolAddress: pair.pairAddress || '' };
      const tick = pairToTick(pair, row, now);
      if (!hunterPass(tick, pair, now)) continue;
      const mom = momentumFromTick(tick);
      const created = pair.pairCreatedAt ? +pair.pairCreatedAt : 0;
      const band = hunterBand(tick.liq);
      hits.push({
        name: tick.name,
        ca: s.ca,
        chain: tick.chain || 'solana',
        band,
        score: mom.score,
        m5: tick.m5,
        h1: tick.h1,
        h6: tick.h6,
        volX: mom.volX,
        buyR: mom.buyR,
        liq: tick.liq,
        mcap: +(pair.marketCap || pair.fdv || 0) || null,
        spot: tick.price,
        ageMin: created ? Math.max(0, Math.round((now - created) / 60000)) : null,
        boosted: !!s.boosted,
        src: s.src || '',
        dexUrl: tick.dexUrl,
        pairAddress: tick.pairAddress
      });
    }
    const per = { micro: 3, small: 3, mid: 3, large: 3 };
    const buckets = { micro: [], small: [], mid: [], large: [] };
    for (const h of hits) {
      if (buckets[h.band]) buckets[h.band].push(h);
    }
    const top = [];
    for (const k of ['micro', 'small', 'mid', 'large']) {
      buckets[k].sort((a, b) => (b.m5 || 0) - (a.m5 || 0) || (b.score || 0) - (a.score || 0));
      top.push.apply(top, buckets[k].slice(0, per[k]));
    }
    this.store.setMeta('hunter_hits', JSON.stringify(top));
    this.store.setMeta('hunter_at', String(now));
    this.store.setMeta('hunter_err', '');
    this.dexCallsLastMin(now);
    this.store.setMeta('dex_calls_min', JSON.stringify(this.dexCallsMin));
    return { hits: top.length, calls, discover: doDiscover, seeded: uniq.length, matched: hits.length, miss };
  }

  async tick(mode) {
    const now = Date.now();
    if (this.busy) return { skipped: true };
    if (now < this.rateLimitedUntil) {
      return { skipped: true, rateLimited: true };
    }
    this.busy = true;
    try {
      if (this.telegramToken() && !this.telegramChatId()) {
        await this.resolveTelegramChat().catch(() => {});
      }
    } catch (e) {}
    let nAlert = 0;
    let scanned = 0;
    let errors = 0;
    let n429 = 0;
    try {
      let rows = this.store.getWatch();
      const lastWatch = +this.store.getMeta('last_watch') || 0;
      if (!rows.length || now - lastWatch > 60000) {
        try {
          rows = await this.refreshWatch();
          this.store.setMeta('last_watch', String(now));
        } catch (e) {
          if (!rows.length) throw e;
        }
      }
      const focus = (this.store.getMeta('focus_ca') || '').toLowerCase();
      const lastAll = +this.store.getMeta('last_all') || 0;
      const doAll = mode === 'all' || now - lastAll >= 55000;
      const targets = doAll ? rows : rows.filter((r) => r.ca.toLowerCase() === focus);
      if (!targets.length) {
        this.store.setMeta('last_poll', String(now));
        return { scanned: 0 };
      }
      const byCa = await fetchDexPairsForCas(targets.map((r) => r.ca));
      const nCalls = byCa.calls || 1;
      for (let i = 0; i < nCalls; i++) this.dexCallsMin.push(now);

      for (const row of targets) {
        const got = byCa.get(row.ca);
        if (!got || got instanceof Error) {
          errors++;
          if (got instanceof Error && /429/.test(got.message || '')) n429++;
          continue;
        }
        const pair = pickBestPair(got, row.chain, row.ca);
        if (!pair || !(+pair.priceUsd > 0)) {
          errors++;
          continue;
        }
        scanned++;
        const tick = pairToTick(pair, row, now);
        const closed = this.applyTick(row.ca, tick);
        const tfsToCheck = new Set(closed.map((c) => c.tf));
        if (doAll) {
          for (const tf of ALL_TFS) tfsToCheck.add(tf);
        } else {
          tfsToCheck.add('1m');
        }
        for (const tf of tfsToCheck) {
          const hit = this.evaluateRow(row, tf, focus);
          if (await this.maybeAlert(hit, tf)) nAlert++;
        }
      }
      if (scanned > 0) {
        this.rateLimitedUntil = 0;
        this.lastErr = errors ? errors + ' without pool' : '';
      } else if (n429 && n429 >= Math.max(1, Math.ceil(targets.length / 2))) {
        this.rateLimitedUntil = now + 20000;
        this.lastErr = 'DexScreener 429 on ' + n429 + '/' + targets.length + ' (paused 20s)';
      } else {
        this.lastErr = errors ? errors + ' without pool' : this.lastErr;
      }
      this.store.setMeta('last_poll', String(now));
      if (doAll) this.store.setMeta('last_all', String(now));
      this.store.setMeta('last_n_alert', String(nAlert));
      this.store.setMeta('last_scanned', String(scanned));
      this.store.setMeta('last_errors', String(errors));
      this.dexCallsLastMin(now);
      this.store.setMeta('dex_calls_min', JSON.stringify(this.dexCallsMin));
      this.store.setMeta('rate_limited_until', String(this.rateLimitedUntil || 0));
      this.store.setMeta('last_err', this.lastErr || '');
      try {
        await this.refreshHunter(now);
      } catch (e) {
        this.store.setMeta('hunter_err', String(e && e.message ? e.message : e));
      }
      if (now % 3600000 < 30000) this.store.prune(now);
      return { scanned, errors, n429, nAlert, doAll, targets: targets.length };
    } catch (e) {
      this.lastErr = String(e && e.message ? e.message : e);
      const dex429 = /429/.test(this.lastErr) && !/ntfy/i.test(this.lastErr);
      if (dex429) this.rateLimitedUntil = now + 20000;
      this.store.setMeta('rate_limited_until', String(this.rateLimitedUntil || 0));
      this.store.setMeta('last_err', this.lastErr || '');
      return { error: this.lastErr };
    } finally {
      this.busy = false;
    }
  }

  setFocus(ca, alertsOn) {
    const rows = this.store.getWatch();
    const row = rows.find((r) => r.ca.toLowerCase() === String(ca || '').toLowerCase());
    if (!ca) {
      this.store.setMeta('focus_ca', '');
      this.store.setMeta('focus_name', '');
      return { focus: '', name: '' };
    }
    if (!row) throw new Error('CA is not on the saved list');
    this.store.setMeta('focus_ca', row.ca);
    this.store.setMeta('focus_name', row.name || row.ca.slice(0, 8));
    if (alertsOn === true) this.store.setMeta('focus_1m_alerts', 'on');
    if (alertsOn === false) this.store.setMeta('focus_1m_alerts', 'off');
    return { focus: row.ca, name: row.name, focus1mAlerts: this.store.getMeta('focus_1m_alerts') === 'on' };
  }
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

export function json(data, status = 200) {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
    body: JSON.stringify(data)
  };
}

export async function handleApi(engine, request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method || 'GET';
  if (method === 'OPTIONS') return { status: 204, headers: CORS, body: '' };

  if (path === '/health' || path === '/api/health') {
    return json({ ok: true, engine: 'ohlcv', ts: new Date().toISOString() });
  }
  if (path === '/status' || path === '/api/status') {
    return json(engine.status());
  }
  if (path === '/breakouts' || path === '/api/breakouts') {
    const tf = (url.searchParams.get('tf') || '4h').toLowerCase();
    const hits = engine.snapshot(tf);
    const st = engine.status();
    const sections = {
      early: hits.filter((h) => h.section === 'early'),
      live: hits.filter((h) => h.section === 'live'),
      matured: hits.filter((h) => h.section === 'matured')
    };
    const align = engine.snapshotAlign();
    return json({
      tf,
      updated: new Date().toISOString(),
      status: st,
      hits,
      sections,
      align,
      count: hits.length
    });
  }
  if (path === '/verdict' || path === '/api/verdict') {
    const ca = url.searchParams.get('ca') || '';
    return json(engine.verdictFor(ca));
  }
  if (path === '/hunter' || path === '/api/hunter') {
    if (method === 'POST') {
      try {
        const out = await engine.refreshHunter(Date.now(), true);
        return json({
          ok: true,
          ...out,
          hits: engine.decorateHunter(engine.hunterHits()),
          scannedAt: engine.store.getMeta('hunter_at') || null,
          error: engine.store.getMeta('hunter_err') || ''
        });
      } catch (e) {
        return json({ ok: false, error: String(e && e.message ? e.message : e) }, 400);
      }
    }
    return json({
      hits: engine.decorateHunter(engine.hunterHits()),
      scannedAt: engine.store.getMeta('hunter_at') || null,
      discoveredAt: engine.store.getMeta('hunter_discover') || null,
      error: engine.store.getMeta('hunter_err') || '',
      status: engine.status()
    });
  }
  if ((path === '/hunter/verify' || path === '/api/hunter/verify') && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    try {
      const out = engine.markHunterVerified(body.ca || '', body.tool || '');
      return json({ ok: true, ...out });
    } catch (e) {
      return json({ ok: false, error: String(e && e.message ? e.message : e) }, 400);
    }
  }
  if ((path === '/hunter/save' || path === '/api/hunter/save') && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    try {
      const out = engine.saveHunterCa(body.ca || '');
      return json(out);
    } catch (e) {
      return json({ ok: false, error: String(e && e.message ? e.message : e) }, 400);
    }
  }
  if ((path === '/focus' || path === '/api/focus') && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const out = engine.setFocus(body.ca || '', body.alerts1m);
    return json(out);
  }
  if ((path === '/ping-telegram' || path === '/api/ping-telegram') && method === 'POST') {
    try {
      const out = await engine.pingTelegram();
      return json(out);
    } catch (e) {
      engine.markTelegramFail(e);
      return json({
        ok: false,
        needStart: /tap Start/i.test(String(e && e.message ? e.message : e)),
        error: String(e && e.message ? e.message : e)
      });
    }
  }
  if ((path === '/bind-telegram' || path === '/api/bind-telegram') && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    try {
      const out = await engine.bindTelegram(body.token || '');
      return json(out);
    } catch (e) {
      return json({ ok: false, error: String(e && e.message ? e.message : e) }, 400);
    }
  }
  if ((path === '/ping-ntfy' || path === '/api/ping-ntfy') && method === 'POST') {
    if (engine.ntfyPaused()) {
      return json({
        ok: false,
        paused: true,
        topic: engine.topic(),
        error: engine.ntfyErr || 'ntfy daily limit — try after midnight UTC'
      });
    }
    try {
      await sendNtfy(engine.topic(), 'Trading · ntfy test', 'Topic ' + engine.topic() + '\nOHLCV engine is live.');
      return json({ ok: true, topic: engine.topic() });
    } catch (e) {
      engine.markNtfyFail(e);
      return json({
        ok: false,
        topic: engine.topic(),
        error: engine.ntfyErr || String(e && e.message ? e.message : e)
      });
    }
  }
  if ((path === '/run' || path === '/api/run') && (method === 'POST' || method === 'GET')) {
    const out = await engine.tick('all');
    return json({ ok: true, ...out, status: engine.status() });
  }
  if (path === '/candles' || path === '/api/candles') {
    const ca = url.searchParams.get('ca') || '';
    const tf = (url.searchParams.get('tf') || '15m').toLowerCase();
    const n = Math.min(200, Math.max(5, +(url.searchParams.get('n') || 50)));
    return json({ ca, tf, bars: engine.store.bars(ca, tf, n) });
  }
  return json({ error: 'not found', path }, 404);
}
