/**
 * Candle + breakout engine. Works in Cloudflare Workers and Node.
 * DexScreener is the quote tape. We own the candles.
 */
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
  '4h': 14400,
  '1d': 86400,
  '1w': 604800,
  '1M': 2592000
};
export const TAPE_TFS = Object.keys(TF_SEC);
export const AUTO_TFS = TAPE_TFS.filter((tf) => tf !== '1m');
export const LONG_TFS = ['1d', '1w', '1M'];
export const ALL_TFS = [...TAPE_TFS];
/** Auto tape writes 5m+. 1m is on-demand only (open 1m / /run / /candles?tf=1m). */
export const AUTO_EVERY_MS = 5 * 60e3;
export const ALIGN_TFS = ['5m', '10m', '15m', '30m', '1h', '2h', '4h', '1d', '1w', '1M'];
export const ALIGN_MIN = 2;
export const KEEP_LONG_MS = 730 * 86400e3;
/** One Gecko 1D page per this interval. Auto Dex poll is 5m (1m on-demand). */
export const GECKO_EVERY_MS = 3600e3;
export const HOLDERS_EVERY_MS = 15 * 60e3;
/** Hunter Dex discover + score. Not the 60s saved-CA tape. */
export const HUNTER_EVERY_MS = 20 * 60e3;
/** On-demand sentiment (CoinGecko + Binance listings). Not the 60s tape. */
export const SENTIMENT_EVERY_MS = 20 * 60e3;
export const CEX_MARKET_IDS = {
  binance: 'Binance',
  'binance-us': 'Binance US',
  gdax: 'Coinbase',
  coinbase: 'Coinbase',
  coinbase_exchange: 'Coinbase',
  kraken: 'Kraken',
  okex: 'OKX',
  okx: 'OKX',
  bybit_spot: 'Bybit',
  bybit: 'Bybit',
  kucoin: 'KuCoin',
  gate: 'Gate.io',
  mexc: 'MEXC',
  bitget: 'Bitget',
  huobi: 'HTX',
  crypto_com: 'Crypto.com',
  upbit: 'Upbit',
  bithumb: 'Bithumb'
};

/** Closed bars required before NEW BREAKOUT is allowed. */
export const MIN_BARS = {
  '1m': 20,
  '5m': 16,
  '10m': 12,
  '15m': 12,
  '30m': 10,
  '1h': 8,
  '2h': 6,
  '4h': 6,
  '1d': 20,
  '1w': 8,
  '1M': 4
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

export function utcDay(t) {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function utcWeekMon(t) {
  const day0 = utcDay(t);
  const dow = new Date(day0).getUTCDay();
  return day0 - ((dow + 6) % 7) * 86400e3;
}

export function utcMonth(t) {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function bucketForTf(tf, t) {
  if (tf === '1w') return utcWeekMon(t);
  if (tf === '1M') return utcMonth(t);
  const sec = TF_SEC[tf];
  if (!sec) return utcDay(t);
  return bucketMs(t, sec);
}

export function geckoNetworkOf(chain) {
  const c = chainIdOf(chain);
  if (c === 'ethereum') return 'eth';
  if (c === 'solana') return 'solana';
  if (c === 'base') return 'base';
  if (c === 'bsc') return 'bsc';
  if (c === 'robinhood') return 'robinhood';
  return c;
}

export function resampleBars(bars, tf) {
  const map = {};
  for (const b of bars || []) {
    const t = bucketForTf(tf, b.t);
    if (!map[t]) {
      map[t] = {
        t,
        o: +b.o,
        h: +b.h,
        l: +b.l,
        c: +b.c,
        vol: +b.vol || 0,
        buys: b.buys || 0,
        sells: b.sells || 0,
        n: 1
      };
    } else {
      const x = map[t];
      x.h = Math.max(x.h, +b.h);
      x.l = Math.min(x.l, +b.l);
      x.c = +b.c;
      x.vol += +b.vol || 0;
      x.n += 1;
    }
  }
  return Object.keys(map)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => map[k]);
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
        if (FAIL_SINK) {
          FAIL_SINK(
            'http429',
            host + ' try ' + (i + 1) + '/' + tries + (i + 1 < tries ? ' · retry wait' : ' · give up'),
            { host, n: i + 1 }
          );
        }
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

let FAIL_SINK = null;
export function setFailSink(fn) {
  FAIL_SINK = typeof fn === 'function' ? fn : null;
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
    mcap: +(pair.marketCap || pair.fdv || 0) || 0,
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
    links.defade = 'https://defade.org/token/' + encodeURIComponent(ca);
    links.solsniffer = 'https://solsniffer.com/tokens/' + encodeURIComponent(ca);
  } else if (ch === 'robinhood') {
    links.tokensniffer = 'https://tokensniffer.com/';
  } else {
    links.honeypot = 'https://honeypot.is/ethereum?address=' + encodeURIComponent(ca);
    links.goplus = 'https://gopluslabs.io/token-security/1/' + ca;
  }
  return links;
}

export function hunterBand(mcap) {
  const x = +mcap || 0;
  if (x >= 20000 && x < 100000) return 'micro';
  if (x >= 100000 && x < 1000000) return 'small';
  if (x >= 1000000 && x < 10000000) return 'mid';
  if (x >= 10000000) return 'large';
  return '';
}

export function netHoldersFromPct(nowN, pct) {
  const n = +nowN;
  const p = +pct;
  if (!(n > 0) || !Number.isFinite(p)) return null;
  const r = p / 100;
  if (r <= -0.999) return null;
  return Math.round(n - n / (1 + r));
}

export function holderDeltaFromSnaps(snaps, now, windowMs, nowN) {
  const n = +nowN;
  if (!(n > 0) || !snaps || !snaps.length || !(windowMs > 0)) {
    return { net: null, pct: null, ready: false };
  }
  const want = now - windowMs;
  let best = null;
  for (let i = 0; i < snaps.length; i++) {
    const s = snaps[i];
    if (!s || !(+s.n > 0)) continue;
    if (+s.t <= want + 12 * 60e3) {
      if (!best || Math.abs(+s.t - want) < Math.abs(+best.t - want)) best = s;
    }
  }
  if (!best) return { net: null, pct: null, ready: false };
  if (now - +best.t < windowMs * 0.7) return { net: null, pct: null, ready: false };
  const net = Math.round(n - +best.n);
  const pct = +best.n > 0 ? (net / +best.n) * 100 : null;
  return { net, pct, ready: true, from: +best.t };
}


/** Keep 30m samples for 48h, 6h samples to 10d, daily to 35d. */
export function compactHolderSnaps(snaps, now) {
  const cut = now - 35 * 86400e3;
  const rows = (snaps || []).filter((s) => s && +s.t >= cut && +s.n > 0).sort((a, b) => +a.t - +b.t);
  const out = [];
  const seenDay = new Set();
  const seen6h = new Set();
  for (let i = rows.length - 1; i >= 0; i--) {
    const s = rows[i];
    const age = now - +s.t;
    if (age <= 48 * 3600e3) {
      out.push(s);
      continue;
    }
    if (age <= 10 * 86400e3) {
      const k = Math.floor(+s.t / (6 * 3600e3));
      if (seen6h.has(k)) continue;
      seen6h.add(k);
      out.push(s);
      continue;
    }
    const day = Math.floor(+s.t / 86400e3);
    if (seenDay.has(day)) continue;
    seenDay.add(day);
    out.push(s);
  }
  return out.sort((a, b) => +a.t - +b.t);
}

export function hunterPass(tick, pair, now) {
  const band = hunterBand(tick.mcap);
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

/** High 24h/1h volume in the same four market-cap bands. Not a momentum pass. */
export function hunterVolPass(tick, pair, now) {
  const band = hunterBand(tick.mcap);
  if (!band) return false;
  const created = pair && pair.pairCreatedAt ? +pair.pairCreatedAt : 0;
  if (created && now - created < 5 * 60e3) return false;
  const liq = +tick.liq || 0;
  const v24 = +tick.vol24h || 0;
  const v1 = +tick.vol1h || 0;
  if (!(liq > 0)) return false;
  let floor24 = 0, floor1 = 0;
  if (band === 'micro') { floor24 = 80000; floor1 = 15000; }
  else if (band === 'small') { floor24 = 250000; floor1 = 40000; }
  else if (band === 'mid') { floor24 = 800000; floor1 = 120000; }
  else if (band === 'large') { floor24 = 2000000; floor1 = 250000; }
  else return false;
  if (v24 < floor24 && v1 < floor1) return false;
  if (v24 < liq * 0.12 && v1 < liq * 0.03) return false;
  const mcap = +tick.mcap || 0;
  if (mcap >= 80e6 && v24 < mcap * 0.04 && v24 < liq * 8) return false;
  return true;
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
  for (const q of ['pumpswap', 'pump.fun', 'SOL', 'pepe', 'ETH', 'robinhood', 'raydium', 'meteora', 'uniswap']) {
    try {
      calls++;
      const s = await fetchJSON('https://api.dexscreener.com/latest/dex/search?q=' + encodeURIComponent(q), 1);
      const pairs = (s.pairs || []).slice().sort(function (a, b) {
        return +(((b.volume && b.volume.h24) || 0) - ((a.volume && a.volume.h24) || 0));
      });
      for (const p of pairs) {
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
  try {
    calls++;
    const top = await fetchJSON('https://api.dexscreener.com/token-boosts/top/v1', 1);
    for (const p of top || []) {
      push(p.tokenAddress, p.chainId, 'boost', true, null);
    }
  } catch (e) {}
  for (const net of ['solana', 'eth']) {
    try {
      calls++;
      const g = await fetchJSON(
        'https://api.geckoterminal.com/api/v2/networks/' + net + '/trending_pools?page=1',
        1
      );
      for (const d of g.data || []) {
        const rel = d.relationships && d.relationships.base_token && d.relationships.base_token.data;
        const id = rel && rel.id ? String(rel.id) : '';
        const ca = id.includes('_') ? id.slice(id.indexOf('_') + 1) : '';
        if (!ca) continue;
        push(ca, net === 'eth' ? 'ethereum' : 'solana', 'trend', false, null);
      }
    } catch (e) {}
  }
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

  reasons.push('This is our ' + tfu + ' candle vs the recent high — not a Dex 5m/24h %');
    if (det.ret != null) reasons.push('This ' + tfu + ' bar ' + pctStr(det.ret) + ' from open to close');
    if (det.runup != null) reasons.push('Vs recent ' + tfu + ' high: ' + pctStr(det.runup));
    if (lvl) reasons.push('Breakout level ' + lvl + (spot ? ' · spot ' + spot : '') + (distTxt ? ' · ' + distTxt : ''));
    reasons.push('Closed ' + tfu + ' bars ' + (det.bars || 0) + '/' + (det.need || 0) + ' needed');
    reasons.push('Dex snapshot: 5m ' + pctStr(m5) + ' · 1h ' + pctStr(h1) + ' · vol ' + mom.volX + 'x usual 5m');
    if ((m5 || 0) < 1 && det.event === 'NEW BREAKOUT') {
      reasons.push('Dex last 5m is weak (' + pctStr(m5) + ') — this fired on a range break, not a 5m pump. Treat as noisy');
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
      : 'No printed ' + tfu + ' level yet — not a hold.';
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

/** Entry vs printed breakout level. Tune in one place. */
export const ENTRY_EXT_PCT = 10;
export const ENTRY_THIN_1M = 8;

export function twoFiveMinClosesFailed(bars5m, level) {
  if (!(+level > 0) || !bars5m || bars5m.length < 2) return false;
  const a = bars5m[bars5m.length - 2];
  const b = bars5m[bars5m.length - 1];
  return +a.c < +level && +b.c < +level;
}

/**
 * Is this already-detected breakout enterable NOW?
 * Does not detect breakouts. Paint: WATCH | WINDOW | EXTENDED | FAILED (or '').
 */
export function entryQuality(args) {
  const tf = String((args && args.tf) || '').toLowerCase();
  const level = +((args && args.level) || 0);
  const tick = (args && args.tick) || {};
  const bars1m = (args && args.bars1m) || [];
  const bars5m = (args && args.bars5m) || [];
  const bars15m = (args && args.bars15m) || [];
  const open5m = (args && args.open5m) || null;
  const section = (args && args.section) || '';
  const event = (args && args.event) || '';
  const volX = +(args && args.volX);
  const buyR = +(args && args.buyR);
  const spot = +tick.price || 0;
  const tape = {
    pollSec: 60,
    bars1m: bars1m.length,
    bars5m: bars5m.length,
    bars15m: bars15m.length,
    thin: bars1m.length < ENTRY_THIN_1M
  };
  const broke =
    section === 'live' ||
    section === 'matured' ||
    event === 'NEW BREAKOUT' ||
    event === 'BREAKOUT HELD';
  if (!broke) return { state: '', paint: '', why: '', tape, internal: '' };

  if ((tf === '1d' || tf === '1w') && !(level > 0)) {
    return {
      state: 'n/a',
      paint: '',
      why: '1D/1W has no printed candle level — ENTRY not computed.',
      tape,
      internal: ''
    };
  }

  if (!(level > 0) || !(spot > 0)) {
    return {
      state: 'watch',
      paint: 'WATCH',
      why: 'WATCH: break exists but no printed level/spot yet. Not a sell.',
      tape,
      internal: ''
    };
  }

  if (twoFiveMinClosesFailed(bars5m, level)) {
    return {
      state: 'failed',
      paint: 'FAILED',
      why:
        'FAILED: two consecutive 5m closes under ' +
        fmtPx(level) +
        '. A 1m wick is not this.',
      tape,
      internal: ''
    };
  }

  if (spot >= level * (1 + ENTRY_EXT_PCT / 100)) {
    const dist = ((spot - level) / level) * 100;
    return {
      state: 'extended',
      paint: 'EXTENDED',
      why:
        'EXTENDED: spot ' +
        fmtPx(spot) +
        ' is +' +
        dist.toFixed(1) +
        '% vs level ' +
        fmtPx(level) +
        ' (≥' +
        ENTRY_EXT_PCT +
        '%). Break still valid — do not chase.',
      tape,
      internal: ''
    };
  }

  if (tape.thin) {
    return {
      state: 'watch',
      paint: 'WATCH',
      why:
        'WATCH: 1m tape thin (' +
        tape.bars1m +
        ' < ' +
        ENTRY_THIN_1M +
        ' bars at 60s poll). Not enough evidence for WINDOW.',
      tape,
      internal: ''
    };
  }

  const last6 = bars1m.slice(-6);
  const last3 = bars1m.slice(-3);
  const closesAbove = last6.filter((b) => +b.c >= level * 0.995).length;
  const green = last6.filter((b) => +b.c >= +b.o).length;
  const last = last6[last6.length - 1];
  const hold = !!(last && +last.c >= level * 0.995);
  const retesting = !!(open5m && +open5m.l < level && +open5m.c >= level);
  const formingOk = !open5m || +open5m.c >= level * 0.995 || retesting;
  const m5 = +tick.m5 || 0;
  const volAccept = volX >= 0.7 || buyR >= 1 || m5 >= 0.2;
  const continuation =
    last3.length >= 3 &&
    last3.every((b) => +b.c >= level * 0.995) &&
    last3.filter((b) => +b.c >= +b.o).length >= 2;
  const notSingle = green >= 2 || closesAbove >= 3;
  const accepting = hold && last6.length <= 3 && green <= 1;

  if (hold && formingOk && volAccept && notSingle && (continuation || closesAbove >= 3 || retesting)) {
    return {
      state: 'window',
      paint: 'WINDOW',
      why:
        'WINDOW: holding ' +
        fmtPx(level) +
        ' · 1m closes above ' +
        closesAbove +
        '/' +
        last6.length +
        ' · vol ' +
        (Number.isFinite(volX) ? volX : '—') +
        'x. Consider entry. Not a guarantee.',
      tape,
      internal: retesting ? 'retesting' : accepting ? 'accepting' : ''
    };
  }

  return {
    state: 'watch',
    paint: 'WATCH',
    why:
      'WATCH: near ' +
      fmtPx(level) +
      ' but not enough 1m/5m proof (closes above ' +
      closesAbove +
      '/' +
      last6.length +
      ', green ' +
      green +
      '). Not a sell.',
    tape,
    internal: accepting ? 'accepting' : retesting ? 'retesting' : ''
  };
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
  { id: 'medium', label: 'Medium', sub: '2h · 4h', tfs: ['2h', '4h'] },
  { id: 'long', label: 'Long', sub: '1d · 1w', tfs: ['1d', '1w'] }
];

export function verdictCall(hz, byTf, tick, hist) {
  const xs = (hz.tfs || []).map((tf) => byTf[tf]).filter(Boolean);
  const tags = xs.map((h) => {
    const rec = hist && hist[maturedKey(h)];
    const st = rec && rec.status && rec.status !== 'held' ? rec.status : h.section || h.state || 'WATCH';
    return String(h.tf).toUpperCase() + ' ' + String(st).toUpperCase();
  });
  const under = xs.find((h) => {
    if (!(h.level > 0 && h.spot > 0 && h.spot < h.level)) return false;
    const rec = hist && hist[maturedKey(h)];
    const hadBreak =
      h.section === 'live' ||
      h.section === 'matured' ||
      (rec && (rec.status === 'held' || rec.status === 'broke' || rec.status === 'failed'));
    return hadBreak;
  });
  if (under) {
    return {
      call: 'EXIT',
      why:
        'BROKE: spot back under the breakout level' +
        (under.levelTxt ? ' (' + under.levelTxt + ')' : '') +
        ' on ' +
        String(under.tf).toUpperCase() +
        '.',
      reasons: tags
    };
  }
  const failed = xs.filter((h) => {
    const rec = hist && hist[maturedKey(h)];
    return rec && (rec.status === 'failed' || rec.status === 'broke');
  });
  const live = xs.filter((h) => h.section === 'live');
  const held = xs.filter((h) => h.section === 'matured');
  const early = xs.filter((h) => h.section === 'early');
  const stretched = xs.some((h) => h.state === 'STRETCHED');
  if (failed.length && !live.length && !held.length) {
    return {
      call: 'EXIT',
      why:
        'FAILED: ' +
        failed.map((h) => String(h.tf).toUpperCase()).join(', ') +
        ' hold died. Not a hold.',
      reasons: tags
    };
  }
  if (live.length || held.length) {
    const rows = live.concat(held);
    const lines = rows
      .map((h) => {
        const tfu = String(h.tf).toUpperCase();
        const kind = h.section === 'live' ? 'LIVE' : 'HELD';
        if (!h.levelTxt) return null;
        const dist =
          h.distPct != null
            ? ' · spot ' + fmtPx(h.spot) + ' (' + pctStr(h.distPct) + ' vs level)'
            : h.spot
              ? ' · spot ' + fmtPx(h.spot)
              : '';
        return (
          tfu +
          ' ' +
          kind +
          ' above ' +
          h.levelTxt +
          dist +
          '. Exit: ' +
          tfu +
          ' close under ' +
          h.levelTxt +
          '.'
        );
      })
      .filter(Boolean);
    if (lines.length) {
      return {
        call: 'HOLD',
        why:
          (lines.length >= 2 ? lines.length + ' TFs agree. ' : '') +
          (stretched ? 'Stretched/late. ' : '') +
          lines.join(' '),
        reasons: tags
      };
    }
  }
  if (early.length) {
    return {
      call: 'EXIT',
      why:
        'Only EARLY on ' +
        early.map((h) => String(h.tf).toUpperCase()).join(', ') +
        ' — close to a break, not a hold. Do not treat this as an open trade.',
      reasons: tags
    };
  }
  return {
    call: 'EXIT',
    why:
      'No live/held break on ' +
      hz.label.toLowerCase() +
      ' (' +
      hz.sub +
      ').' +
      (tick && tick.price ? ' Spot ' + fmtPx(tick.price) + '.' : ''),
    reasons: tags
  };
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
  insertBar(ca, tf, bar) {
    const caL = ca.toLowerCase();
    if (this.ohlcv.some((b) => b.ca === caL && b.tf === tf && +b.t === +bar.t)) return false;
    this.ohlcv.push({
      ca: caL,
      tf,
      t: bar.t,
      o: bar.o,
      h: bar.h,
      l: bar.l,
      c: bar.c,
      vol: bar.vol || 0,
      buys: bar.buys || 0,
      sells: bar.sells || 0,
      n: bar.n || 1
    });
    return true;
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
    const keepLong = now - KEEP_LONG_MS;
    this.ohlcv = this.ohlcv.filter((b) => {
      if (b.tf === '1m') return b.t >= keep1m;
      if (b.tf === '5m' || b.tf === '10m' || b.tf === '15m' || b.tf === '30m') return b.t >= keep5;
      if (b.tf === '1d' || b.tf === '1w' || b.tf === '1M') return b.t >= keepLong;
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
    this.telegramErr = '';
    this.dexCallsMin = [];
    this.rateLimitedUntil = 0;
    this.geckoUntil = 0;
    this._failBuf = [];
    setFailSink((k, m, x) => this.logFail(k, m, x));
    try {
      const saved = JSON.parse(store.getMeta('dex_calls_min') || '[]');
      if (Array.isArray(saved)) this.dexCallsMin = saved.filter((t) => Number.isFinite(+t)).map(Number);
    } catch (e) {}
    try {
      this.rateLimitedUntil = +store.getMeta('rate_limited_until') || 0;
      this.lastErr = store.getMeta('last_err') || '';
      this.telegramErr = store.getMeta('telegram_err') || '';
    } catch (e) {}
    let lastPoll = 0;
    let lastScanned = 0;
    try {
      lastPoll = +store.getMeta('last_poll') || 0;
      lastScanned = +store.getMeta('last_scanned') || 0;
    } catch (e) {}
    if (lastScanned > 0 && Date.now() - lastPoll < 180000) this.rateLimitedUntil = 0;
    if (/ntfy/i.test(this.lastErr) || /NTFY_/.test(this.lastErr)) this.lastErr = '';
  }

  watchUrl() {
    return this.env.WATCHLIST_URL || WATCHLIST_DEFAULT;
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
    this.logFail('telegram', this.telegramErr);
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

  logFail(kind, msg, extra) {
    const row = {
      t: Date.now(),
      k: String(kind || 'err').slice(0, 24),
      m: String(msg || '').slice(0, 180)
    };
    if (extra && extra.host) row.host = String(extra.host).slice(0, 48);
    if (extra && extra.n != null) row.n = extra.n;
    if (extra && extra.gapMs) row.gapMs = extra.gapMs;
    this._failBuf = this._failBuf || [];
    this._failBuf.push(row);
  }
  failLog() {
    try {
      const a = JSON.parse(this.store.getMeta('fail_log') || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }
  flushFails(now) {
    now = now || Date.now();
    const buf = this._failBuf || [];
    this._failBuf = [];
    if (!buf.length) return 0;
    const cut = now - 24 * 3600e3;
    const log = this.failLog()
      .concat(buf)
      .filter((x) => x && +x.t >= cut)
      .slice(-240);
    this.store.setMeta('fail_log', JSON.stringify(log));
    return buf.length;
  }
  failuresSnapshot(now) {
    now = now || Date.now();
    const hourCut = now - 3600e3;
    const all = this.failLog();
    const hour = all.filter((x) => +x.t >= hourCut && x.k !== 'ntfy');
    const older = all.filter((x) => +x.t < hourCut && x.k !== 'ntfy');
    const countsHour = {};
    for (const x of hour) countsHour[x.k] = (countsHour[x.k] || 0) + 1;
    const st = this.status();
    return {
      now,
      live: {
        health: st.health,
        lastPoll: st.lastPoll,
        pollMs: st.pollMs,
        error: st.error || '',
        telegramError: st.telegramError || '',
        dexCallsLastMin: st.dexCallsLastMin,
        rateLimitedUntil: this.rateLimitedUntil || 0,
        hunterErr: this.store.getMeta('hunter_err') || '',
        holdersErr: this.store.getMeta('holders_err') || '',
        backfillLast: st.backfillLast || null
      },
      hour,
      older,
      countsHour,
      nHour: hour.length,
      nOlder: older.length,
      note: 'Only real failures. Empty last hour means none were logged.'
    };
  }

  applyTick(ca, tick, tfs) {
    const prev = this.store.getTick(ca);
    const volPiece = prev && tick.vol24h >= 0 ? Math.max(0, tick.vol24h - (prev.vol24h || 0)) : 0;
    this.store.setTick(ca, tick);
    const closed = [];
    const list = tfs && tfs.length ? tfs : AUTO_TFS;
    for (const tf of list) {
      const bucket = bucketForTf(tf, tick.t);
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

  alertMode() {
    const m = String(this.store.getMeta('alert_mode') || 'all').toLowerCase();
    if (m === 'off' || m === 'picked') return m;
    return 'all';
  }
  alertCas() {
    try {
      const a = JSON.parse(this.store.getMeta('alert_cas') || '[]');
      return Array.isArray(a) ? a.map((x) => String(x).toLowerCase()).filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }
  alertsAllowed(ca) {
    const mode = this.alertMode();
    if (mode === 'off') return false;
    if (mode === 'picked') {
      const k = String(ca || '').toLowerCase();
      return !!k && this.alertCas().indexOf(k) >= 0;
    }
    return true;
  }
  setAlertPrefs(body) {
    body = body || {};
    if (body.mode) {
      const m = String(body.mode).toLowerCase();
      if (m === 'all' || m === 'off' || m === 'picked') this.store.setMeta('alert_mode', m);
    }
    const watch = new Set((this.store.getWatch() || []).map((w) => String(w.ca).toLowerCase()));
    if (Array.isArray(body.cas)) {
      const cas = body.cas.map((x) => String(x).toLowerCase()).filter((x) => watch.has(x));
      this.store.setMeta('alert_cas', JSON.stringify(cas));
    }
    if (body.ca) {
      const k = String(body.ca).toLowerCase();
      if (!watch.has(k)) throw new Error('CA is not on the saved list');
      const set = new Set(this.alertCas());
      if (body.on === false) set.delete(k);
      else set.add(k);
      this.store.setMeta('alert_cas', JSON.stringify(Array.from(set)));
    }
    return {
      alertMode: this.alertMode(),
      alertCas: this.alertCas()
    };
  }
  shouldAlert(hit, tf) {
    if (!this.alertsAllowed(hit && hit.ca)) return false;
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

  async maybeEntryAlert(hit) {
    const e = hit && hit.entry;
    if (!this.alertsAllowed(hit && hit.ca)) return false;
    if (!e || (e.paint !== 'WINDOW' && e.paint !== 'EXTENDED' && e.paint !== 'FAILED')) return false;
    const tf = hit.tf;
    const key = String(hit.ca || '').toLowerCase() + '|' + String(tf || '').toLowerCase() + '|entry|' + e.state;
    if (this.store.getAlert(key)) return false;
    const now = Date.now();
    const icon = e.paint === 'WINDOW' ? '🟢' : e.paint === 'EXTENDED' ? '🟡' : '🔴';
    const tfu = String(tf).toUpperCase();
    const title = icon + ' ENTRY ' + e.paint + ' · ' + hit.name + ' (' + tfu + ')';
    const msg = [
      hit.name + ' · BREAKOUT: ' + tfu + ' ' + (hit.section || hit.state || ''),
      'ENTRY: ' + e.paint,
      '',
      e.why || '',
      e.internal ? 'Note: ' + e.internal : '',
      '',
      hit.levelTxt
        ? 'Level (' + tfu + '): ' + hit.levelTxt + (hit.spot ? ' · spot ' + fmtPx(hit.spot) : '')
        : 'Level: not stored',
      e.tape && e.tape.thin ? '1m tape thin (' + e.tape.bars1m + ' bars @ 60s)' : '',
      'CA: ' + hit.ca,
      'https://sasikar.github.io/Trading/index.html?tab=breakouts'
    ]
      .filter(Boolean)
      .join('\n');
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
      } catch (err) {
        this.markTelegramFail(err);
        const m = String(err && err.message ? err.message : err);
        if (/tap Start|not stored|no telegram token/i.test(m)) return false;
      }
    }
    if (!via) return false;
    this.store.setAlert(key, now);
    this.store.setMeta(
      'last_entry_alert',
      JSON.stringify({
        name: hit.name,
        ca: hit.ca,
        tf,
        entry: e.paint,
        why: e.why || '',
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
    const det = detectTapeBreakout(this.store.bars(row.ca, tf, 40), tf, tick);
    const hit = hitFrom(row, tick, det, tf, focus);
    hit.entry = entryQuality({
      tf,
      level: hit.level,
      event: hit.event,
      section: hit.section,
      tick,
      bars1m: this.store.bars(row.ca, '1m', 12),
      bars5m: this.store.bars(row.ca, '5m', 8),
      bars15m: this.store.bars(row.ca, '15m', 6),
      open1m: this.store.openBar(row.ca, '1m'),
      open5m: this.store.openBar(row.ca, '5m'),
      volX: hit.volX,
      buyR: hit.buyR
    });
    this.persistEntry(hit);
    return hit;
  }

  async maybeHolders(now, force) {
    now = now || Date.now();
    const last = +this.store.getMeta('holders_at') || 0;
    if (!force && last && now - last < HOLDERS_EVERY_MS) return { skipped: 'wait', waitMs: HOLDERS_EVERY_MS - (now - last) };
    const rows = (this.store.getWatch() || []).filter((r) => chainIdOf(r.chain) === 'solana');
    let map = {};
    try {
      map = JSON.parse(this.store.getMeta('holders') || '{}') || {};
    } catch (e) {
      map = {};
    }
    for (const row of rows) {
      const ca = String(row.ca || '').toLowerCase();
      if (!ca) continue;
      try {
        const j = await fetchJSON(
          'https://lite-api.jup.ag/tokens/v2/search?query=' + encodeURIComponent(row.ca),
          1
        );
        const list = Array.isArray(j) ? j : [];
        const tok = list.find((x) => String(x.id || '').toLowerCase() === ca) || list[0];
        if (!tok || !(+tok.holderCount > 0)) {
          map[ca] = Object.assign({}, map[ca] || {}, {
            ca,
            name: row.name,
            error: 'no holderCount',
            at: now
          });
          continue;
        }
        const n = +tok.holderCount;
        const pct1h = (tok.stats1h || {}).holderChange;
        const pct6h = (tok.stats6h || {}).holderChange;
        const pct24h = (tok.stats24h || {}).holderChange;
        const prev = map[ca] || {};
        let snaps = Array.isArray(prev.snaps) ? prev.snaps.slice() : [];
        const lastSnap = snaps[snaps.length - 1];
        if (!lastSnap || now - +lastSnap.t >= 30 * 60e3) {
          snaps.push({ t: now, n });
        }
        snaps = compactHolderSnaps(snaps, now);
        const d4 = holderDeltaFromSnaps(snaps, now, 4 * 3600e3, n);
        const d7 = holderDeltaFromSnaps(snaps, now, 7 * 86400e3, n);
        const d30 = holderDeltaFromSnaps(snaps, now, 30 * 86400e3, n);
        map[ca] = {
          ca,
          name: tok.symbol || row.name,
          n,
          at: now,
          pct1h,
          net1h: netHoldersFromPct(n, pct1h),
          pct6h,
          net6h: netHoldersFromPct(n, pct6h),
          pct24h,
          net24h: netHoldersFromPct(n, pct24h),
          pct4h: d4.pct,
          net4h: d4.net,
          ready4h: !!d4.ready,
          pct1w: d7.pct,
          net1w: d7.net,
          ready1w: !!d7.ready,
          pct1M: d30.pct,
          net1M: d30.net,
          ready1M: !!d30.ready,
          topHoldPct: tok.audit && tok.audit.topHoldersPercentage,
          mcap: tok.mcap,
          solscan: 'https://solscan.io/token/' + row.ca + '#holders',
          solscanAnalytics: 'https://solscan.io/token/' + row.ca + '#analytics',
          snaps,
          error: ''
        };
      } catch (e) {
        map[ca] = Object.assign({}, map[ca] || {}, {
          ca,
          name: row.name,
          error: String(e && e.message ? e.message : e).slice(0, 80),
          at: now
        });
      }
    }
    this.store.setMeta('holders', JSON.stringify(map));
    this.store.setMeta('holders_at', String(now));
    return { ok: true, n: rows.length };
  }

  holdersSnapshot() {
    let map = {};
    try {
      map = JSON.parse(this.store.getMeta('holders') || '{}') || {};
    } catch (e) {
      map = {};
    }
    const watch = this.store.getWatch() || [];
    const cards = watch
      .filter((r) => chainIdOf(r.chain) === 'solana')
      .map((r) => {
        const ca = String(r.ca || '').toLowerCase();
        const h = map[ca] || {};
        return {
          ca: r.ca,
          name: h.name || r.name,
          n: h.n || 0,
          at: h.at || 0,
          pct1h: h.pct1h,
          net1h: h.net1h,
          pct6h: h.pct6h,
          net6h: h.net6h,
          pct24h: h.pct24h,
          net24h: h.net24h,
          pct4h: h.pct4h,
          net4h: h.net4h,
          ready4h: !!h.ready4h,
          pct1w: h.pct1w,
          net1w: h.net1w,
          ready1w: !!h.ready1w,
          pct1M: h.pct1M,
          net1M: h.net1M,
          ready1M: !!h.ready1M,
          topHoldPct: h.topHoldPct,
          mcap: h.mcap,
          solscan: h.solscan || 'https://solscan.io/token/' + r.ca + '#holders',
          solscanAnalytics: h.solscanAnalytics || 'https://solscan.io/token/' + r.ca + '#analytics',
          error: h.error || ''
        };
      })
      .sort((a, b) => (+b.net1h || -1e12) - (+a.net1h || -1e12));
    const ethN = watch.filter((r) => chainIdOf(r.chain) !== 'solana').length;
    return {
      cards,
      scannedAt: +this.store.getMeta('holders_at') || 0,
      ethSkipped: ethN,
      source: 'Jupiter 1h/6h/24h. 4h / 1w / 1M from our snaps. Whale mix is on Solscan Analytics. We do not compute it.'
    };
  }

  async holdersCardFromJup(row) {
    const ca = String(row.ca || '');
    const solscan = 'https://solscan.io/token/' + ca + '#holders';
    const solscanAnalytics = 'https://solscan.io/token/' + ca + '#analytics';
    try {
      const j = await fetchJSON(
        'https://lite-api.jup.ag/tokens/v2/search?query=' + encodeURIComponent(ca),
        1
      );
      const list = Array.isArray(j) ? j : [];
      const tok =
        list.find((x) => String(x.id || '').toLowerCase() === ca.toLowerCase()) || list[0];
      if (!tok || !(+tok.holderCount > 0)) {
        return { ca, name: row.name, n: 0, error: 'no holderCount', solscan, solscanAnalytics };
      }
      const n = +tok.holderCount;
      const pct1h = (tok.stats1h || {}).holderChange;
      const pct6h = (tok.stats6h || {}).holderChange;
      const pct24h = (tok.stats24h || {}).holderChange;
      return {
        ca,
        name: tok.symbol || row.name,
        n,
        at: Date.now(),
        pct1h,
        net1h: netHoldersFromPct(n, pct1h),
        pct6h,
        net6h: netHoldersFromPct(n, pct6h),
        pct24h,
        net24h: netHoldersFromPct(n, pct24h),
        pct4h: null,
        net4h: null,
        ready4h: false,
        pct1w: null,
        net1w: null,
        ready1w: false,
        pct1M: null,
        net1M: null,
        ready1M: false,
        topHoldPct: tok.audit && tok.audit.topHoldersPercentage,
        mcap: tok.mcap,
        solscan,
        solscanAnalytics,
        error: ''
      };
    } catch (e) {
      return {
        ca,
        name: row.name,
        n: 0,
        error: String(e && e.message ? e.message : e).slice(0, 80),
        solscan,
        solscanAnalytics
      };
    }
  }

  async holdersLive() {
    if (this._holdersLive && Date.now() - this._holdersLive.at < 45e3) return this._holdersLive.snap;
    const rec = await fetchJSON(this.watchUrl(), 1);
    const items = Array.isArray(rec) ? rec : (rec && rec.items) || [];
    const rows = items.filter((r) => r && r.ca);
    const sol = rows.filter((r) => chainIdOf(r.chain) === 'solana');
    const ethN = rows.length - sol.length;
    const cards = [];
    for (let i = 0; i < sol.length; i += 4) {
      const batch = sol.slice(i, i + 4);
      const part = await Promise.all(batch.map((row) => this.holdersCardFromJup(row)));
      cards.push.apply(cards, part);
    }
    cards.sort((a, b) => (+b.net1h || -1e12) - (+a.net1h || -1e12));
    const snap = {
      cards,
      scannedAt: Date.now(),
      ethSkipped: ethN,
      live: true,
      source: 'Jupiter live. Storage quota paused 4h/1w/1M snaps. Whale mix is on Solscan.'
    };
    this._holdersLive = { at: Date.now(), snap };
    return snap;
  }

  async maybeBackfill(now) {
    now = now || Date.now();
    const lastAt = +this.store.getMeta('bf_gecko_at') || 0;
    if (lastAt && now - lastAt < GECKO_EVERY_MS) {
      return { skipped: 'hourly', waitMs: GECKO_EVERY_MS - (now - lastAt) };
    }
    if (this.geckoUntil && now < this.geckoUntil) return { skipped: 'gecko-wait' };
    const rows = this.store.getWatch();
    let map = {};
    try {
      map = JSON.parse(this.store.getMeta('bf_long') || '{}') || {};
    } catch (e) {
      map = {};
    }
    const caOf = (r) => String(r.ca || '').toLowerCase();
    const needFirst = (r) => {
      const st = map[caOf(r)];
      if (!st) return true;
      if (st.status === 'err') {
        if (/429/.test(st.why || '')) return true;
        return now - (st.at || 0) >= 6 * 3600e3;
      }
      return false;
    };
    const needOlder = (r) => {
      const st = map[caOf(r)];
      if (!st) return false;
      if (st.pagedEnd) return false;
      if (st.status === 'partial') return true;
      const n = st.days || st.n1d || 0;
      return st.status === 'done' && n >= 170;
    };
    const row = (rows || []).find(needFirst) || (rows || []).find(needOlder);
    if (!row) return { skipped: 'all_done' };

    const ca = caOf(row);
    const tick = this.store.getTick(ca) || {};
    const pool = row.poolAddress || tick.pairAddress || '';
    if (!pool) {
      this.store.setMeta('bf_gecko_at', String(now));
      map[ca] = { status: 'err', why: 'no pool', at: now };
      this.store.setMeta('bf_long', JSON.stringify(map));
      this.logFail('gecko_nopool', (row.name || ca) + ' no pool');
      return { ca, error: 'no pool' };
    }
    const net = geckoNetworkOf(row.chain || tick.chain);
    const hist = this.store.bars(ca, '1d', 800);
    const oldest = hist.length ? +hist[0].t : 0;
    const paging = needOlder(row) && oldest > 0;
    let url =
      'https://api.geckoterminal.com/api/v2/networks/' +
      encodeURIComponent(net) +
      '/pools/' +
      encodeURIComponent(pool) +
      '/ohlcv/day?aggregate=1&limit=180&currency=usd&token=base';
    if (paging) url += '&before_timestamp=' + Math.floor(oldest / 1000);

    this.store.setMeta('bf_gecko_at', String(now));
    let j;
    try {
      j = await fetchJSON(url, 1);
    } catch (e) {
      const m = String(e && e.message ? e.message : e);
      if (/429/.test(m)) {
        this.geckoUntil = now + GECKO_EVERY_MS;
        this.store.setMeta(
          'bf_last',
          JSON.stringify({ ca, name: row.name, at: now, error: '429', waitMs: GECKO_EVERY_MS })
        );
        this.logFail('gecko429', (row.name || ca) + ' Gecko 429');
        return { ca, skipped: '429' };
      }
      map[ca] = { status: 'err', why: m.slice(0, 100), at: now };
      this.store.setMeta('bf_long', JSON.stringify(map));
      this.logFail('gecko_err', (row.name || ca) + ' ' + m.slice(0, 100));
      return { ca, error: m };
    }
    if (j && j.status && (j.status.error_code === 429 || /rate limit/i.test(String(j.status.error_message || '')))) {
      this.geckoUntil = now + GECKO_EVERY_MS;
      this.store.setMeta(
        'bf_last',
        JSON.stringify({ ca, name: row.name, at: now, error: '429-json', waitMs: GECKO_EVERY_MS })
      );
      this.logFail('gecko429', (row.name || ca) + ' Gecko 429-json');
      return { ca, skipped: '429' };
    }
    const list = (((j || {}).data || {}).attributes || {}).ohlcv_list || [];
    const cutoff = now - KEEP_LONG_MS;
    const today = utcDay(now);
    const days = list
      .map((x) => ({
        t: +x[0] * 1000,
        o: +x[1],
        h: +x[2],
        l: +x[3],
        c: +x[4],
        vol: +x[5] || 0,
        buys: 0,
        sells: 0,
        n: 1
      }))
      .filter((b) => b.t >= cutoff && b.t < today && b.c > 0)
      .sort((a, b) => a.t - b.t);
    if (!this.store.insertBar) {
      map[ca] = { status: 'err', why: 'no insertBar', at: now };
      this.store.setMeta('bf_long', JSON.stringify(map));
      return { ca, error: 'no insertBar' };
    }
    let n1d = 0;
    for (const b of days) if (this.store.insertBar(ca, '1d', b)) n1d++;
    let n1w = 0;
    for (const b of resampleBars(days, '1w')) {
      if (b.t < utcWeekMon(now) && this.store.insertBar(ca, '1w', b)) n1w++;
    }
    let n1M = 0;
    for (const b of resampleBars(days, '1M')) {
      if (b.t < utcMonth(now) && this.store.insertBar(ca, '1M', b)) n1M++;
    }
    const prev = map[ca] || {};
    const pages = (prev.pages || 0) + 1;
    const fullPage = days.length >= 170;
    const noMore = paging && n1d === 0;
    map[ca] = {
      status: noMore ? 'done' : fullPage ? 'partial' : 'done',
      n1d: (prev.n1d || 0) + n1d,
      n1w: (prev.n1w || 0) + n1w,
      n1M: (prev.n1M || 0) + n1M,
      days: days.length,
      pages,
      pagedEnd: !!noMore,
      at: now,
      pool
    };
    if (!days.length && !paging) map[ca].why = 'empty gecko 1d';
    this.store.setMeta('bf_long', JSON.stringify(map));
    this.store.setMeta(
      'bf_last',
      JSON.stringify({
        ca,
        name: row.name,
        n1d,
        n1w,
        n1M,
        days: days.length,
        pages,
        paging: !!paging,
        at: now
      })
    );
    return { ca, name: row.name, n1d, n1w, n1M, days: days.length, pages, paging: !!paging };
  }

  importGeckoDays(ca, list, now, name) {
    now = now || Date.now();
    ca = String(ca || '').toLowerCase();
    const watch = (this.store.getWatch() || []).some((r) => String(r.ca).toLowerCase() === ca);
    if (!watch) return { error: 'not on watch' };
    const cutoff = now - KEEP_LONG_MS;
    const today = utcDay(now);
    const days = (list || [])
      .map((x) => ({
        t: +x[0] * (x[0] > 1e12 ? 1 : 1000),
        o: +x[1],
        h: +x[2],
        l: +x[3],
        c: +x[4],
        vol: +x[5] || 0,
        buys: 0,
        sells: 0,
        n: 1
      }))
      .filter((b) => b.t >= cutoff && b.t < today && b.c > 0)
      .sort((a, b) => a.t - b.t);
    if (!this.store.insertBar) return { error: 'no insertBar' };
    let n1d = 0;
    for (const b of days) if (this.store.insertBar(ca, '1d', b)) n1d++;
    let n1w = 0;
    for (const b of resampleBars(days, '1w')) {
      if (b.t < utcWeekMon(now) && this.store.insertBar(ca, '1w', b)) n1w++;
    }
    let n1M = 0;
    for (const b of resampleBars(days, '1M')) {
      if (b.t < utcMonth(now) && this.store.insertBar(ca, '1M', b)) n1M++;
    }
    let map = {};
    try {
      map = JSON.parse(this.store.getMeta('bf_long') || '{}') || {};
    } catch (e) {
      map = {};
    }
    map[ca] = {
      status: days.length >= 170 ? 'partial' : days.length ? 'done' : 'err',
      n1d,
      n1w,
      n1M,
      at: now,
      days: days.length,
      via: 'import'
    };
    if (!days.length) map[ca].why = 'empty 1d';
    this.store.setMeta('bf_long', JSON.stringify(map));
    this.store.setMeta('bf_last', JSON.stringify({ ca, name, n1d, n1w, n1M, days: days.length, at: now, via: 'import' }));
    return { ok: true, ca, name, n1d, n1w, n1M, days: days.length };
  }

  persistEntry(hit) {
    const e = hit && hit.entry;
    if (!e || !e.state || e.state === 'n/a') return;
    const k = String(hit.ca || '').toLowerCase() + '|' + String(hit.tf || '').toLowerCase();
    let map = {};
    try {
      map = JSON.parse(this.store.getMeta('entry_state') || '{}') || {};
    } catch (err) {
      map = {};
    }
    const prev = map[k];
    const lvl = +hit.level || 0;
    const newEpisode =
      !!prev &&
      ((prev.level > 0 && lvl > 0 && Math.abs(lvl - prev.level) / prev.level > 0.01) ||
        (hit.fresh && hit.event === 'NEW BREAKOUT' && prev.state === 'failed'));
    if (newEpisode) {
      for (const s of ['window', 'extended', 'failed']) {
        this.store.setAlert(k + '|entry|' + s, 0);
      }
    }
    if (prev && prev.state === e.state && !newEpisode) return;
    map[k] = { state: e.state, at: Date.now(), level: lvl };
    this.store.setMeta('entry_state', JSON.stringify(map));
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
    for (const tf of ['5m', '15m', '1h', '2h', '4h', '1d', '1w']) {
      byTf[tf] = this.evaluateRow(row, tf, focus);
    }
    let hist = {};
    try {
      hist = JSON.parse(this.store.getMeta('matured_hist') || '{}');
    } catch (e) {
      hist = {};
    }
    const tick = this.store.getTick(row.ca);
    const horizons = VERDICT_HZ.map((hz) => {
      const v = verdictCall(hz, byTf, tick, hist);
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
    let bf = {};
    try {
      bf = JSON.parse(this.store.getMeta('bf_long') || '{}') || {};
    } catch (e) {
      bf = {};
    }
    const bfVals = Object.values(bf);
    return {
      health,
      engine: 'cloudflare-ohlcv',
      source: 'DexScreener tape → our candles (1D/1W/1M from Gecko backfill + UTC close)',
      focus: this.store.getMeta('focus_ca') || '',
      focusName: this.store.getMeta('focus_name') || '',
      focus1mAlerts: this.store.getMeta('focus_1m_alerts') === 'on',
      alertMode: this.alertMode(),
      alertCas: this.alertCas(),
      alertWatch: (watch || []).map((r) => ({
        ca: r.ca,
        name: r.name || (r.ca || '').slice(0, 8)
      })),
      lastPoll: lastPoll ? new Date(lastPoll).toISOString() : null,
      lastAll: lastAll ? new Date(lastAll).toISOString() : null,
      pollMs: now - lastPoll,
      candidates: watch.length,
      backfillDone: bfVals.filter((x) => x && (x.status === 'done' || x.status === 'partial')).length,
      backfillPartial: bfVals.filter((x) => x && x.status === 'partial').length,
      backfillErr: bfVals.filter((x) => x && x.status === 'err').length,
      geckoEveryMs: GECKO_EVERY_MS,
      backfillNextAt: (() => {
        const t = +this.store.getMeta('bf_gecko_at') || 0;
        return t ? new Date(t + GECKO_EVERY_MS).toISOString() : null;
      })(),
      backfillLast: (() => {
        try {
          return JSON.parse(this.store.getMeta('bf_last') || 'null');
        } catch (e) {
          return null;
        }
      })(),
      dexCallsLastMin: this.dexCallsLastMin(now),
      dexBudget: 30,
      error: this.lastErr || '',
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
    this.migrateHunterWatch();
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
  hunterWatch() {
    try {
      return JSON.parse(this.store.getMeta('hunter_watch') || '[]');
    } catch (e) {
      return [];
    }
  }
  migrateHunterWatch() {
    let extra = [];
    try {
      extra = JSON.parse(this.store.getMeta('watch_extra') || '[]');
    } catch (e) {
      extra = [];
    }
    if (!extra.length) return this.hunterWatch();
    const hw = this.hunterWatch();
    const seen = new Set(hw.map((x) => String(x.ca || '').toLowerCase()));
    for (const e of extra) {
      const k = String(e && e.ca ? e.ca : '').toLowerCase();
      if (!k || seen.has(k)) continue;
      hw.push({
        ca: e.ca,
        chain: e.chain || 'solana',
        name: e.name || '',
        pairAddress: e.poolAddress || e.pairAddress || '',
        at: Date.now(),
        src: 'migrated'
      });
      seen.add(k);
    }
    this.store.setMeta('hunter_watch', JSON.stringify(hw));
    this.store.setMeta('watch_extra', '[]');
    return hw;
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
    if (!/^(bubblemaps|trench|rugcheck|defade|solsniffer|honeypot|goplus|tokensniffer|dex)$/.test(t)) throw new Error('bad tool');
    const m = this.hunterVerifiedMap();
    const k = String(ca || '').toLowerCase();
    if (!k) throw new Error('no ca');
    m[k] = m[k] || {};
    m[k][t] = Date.now();
    this.store.setMeta('hunter_verified', JSON.stringify(m));
    return { ca: k, verified: m[k] };
  }
  saveHunterCa(ca) {
    const k = String(ca || '').toLowerCase();
    if (!k) throw new Error('no ca');
    const hits = this.hunterHits();
    let hw = this.migrateHunterWatch();
    const idx = hw.findIndex((x) => String(x.ca).toLowerCase() === k);
    if (idx >= 0) {
      hw.splice(idx, 1);
      this.store.setMeta('hunter_watch', JSON.stringify(hw));
      return { ok: true, ca: k, saved: false, n: hw.length };
    }
    const h = hits.find((x) => String(x.ca).toLowerCase() === k);
    if (!h) throw new Error('not on hunter list');
    hw.push({
      ca: h.ca,
      chain: h.chain || 'solana',
      name: h.name || h.ca.slice(0, 8),
      pairAddress: h.pairAddress || '',
      dexUrl: h.dexUrl || '',
      liq: h.liq,
      mcap: h.mcap,
      m5: h.m5,
      h1: h.h1,
      band: h.band,
      at: Date.now()
    });
    this.store.setMeta('hunter_watch', JSON.stringify(hw));
    return { ok: true, ca: h.ca, name: h.name, saved: true, n: hw.length };
  }
  decorateHunter(hits) {
    const vmap = this.hunterVerifiedMap();
    const watching = new Set(this.migrateHunterWatch().map((w) => String(w.ca).toLowerCase()));
    const breakout = new Set((this.store.getWatch() || []).map((w) => String(w.ca).toLowerCase()));
    return (hits || []).map((h) => {
      const v = vmap[String(h.ca).toLowerCase()] || {};
      const links = hunterLinks(h.ca, h.chain);
      if (h.dexUrl) links.dex = h.dexUrl;
      return Object.assign({}, h, {
        verified: {
          bubblemaps: !!v.bubblemaps,
          trench: !!v.trench,
          rugcheck: !!v.rugcheck,
          defade: !!v.defade,
          solsniffer: !!v.solsniffer,
          honeypot: !!v.honeypot,
          goplus: !!v.goplus,
          tokensniffer: !!v.tokensniffer,
          dex: !!v.dex
        },
        saved: watching.has(String(h.ca).toLowerCase()),
        onBreakout: breakout.has(String(h.ca).toLowerCase()),
        links
      });
    });
  }

  geckoPlatformOf(chain) {
    const c = chainIdOf(chain);
    if (c === 'solana') return 'solana';
    if (c === 'ethereum') return 'ethereum';
    if (c === 'base') return 'base';
    if (c === 'bsc') return 'binance-smart-chain';
    if (c === 'robinhood') return 'robinhood';
    return '';
  }

  sentimentLists() {
    const slim = (r) => ({
      ca: r.ca,
      name: r.name || r.base || (r.ca || '').slice(0, 6),
      chain: r.chain || 'solana'
    });
    const saved = (this.store.getWatch() || []).map(slim);
    const seen = new Set(saved.map((x) => String(x.ca).toLowerCase()));
    const hunter = [];
    for (const r of [...this.hunterWatch(), ...this.hunterHits()]) {
      const k = String(r.ca || '').toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      hunter.push(slim(r));
    }
    return { saved, hunter };
  }

  async fetchBinanceListings(now) {
    now = now || Date.now();
    try {
      const cached = JSON.parse(this.store.getMeta('sent_binance') || 'null');
      if (cached && cached.at && now - cached.at < 3600e3 && Array.isArray(cached.articles)) return cached.articles;
    } catch (e) {}
    const url =
      'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=48&pageNo=1&pageSize=20';
    const j = await fetchJSON(url, 1);
    const arts = ((((j || {}).data || {}).catalogs || [])[0] || {}).articles || [];
    const articles = arts.map((a) => ({
      title: a.title || '',
      code: a.code || '',
      id: a.id,
      t: a.releaseDate || a.publishDate || 0,
      url: a.code ? 'https://www.binance.com/en/support/announcement/' + a.code : 'https://www.binance.com/en/support/announcement'
    }));
    this.store.setMeta('sent_binance', JSON.stringify({ at: now, articles }));
    return articles;
  }

  matchListingArticles(articles, name, symbol) {
    const n = String(name || '').trim().toLowerCase();
    const s = String(symbol || '').trim().toLowerCase();
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (articles || []).filter((a) => {
      const t = String(a.title || '').toLowerCase();
      if (s && s.length >= 2 && new RegExp('\\b' + esc(s) + '\\b', 'i').test(t)) return true;
      if (n && n.length >= 3 && t.includes(n)) return true;
      return false;
    });
  }

  buildSentimentReport(row, listings, now) {
    const name = row.name || '';
    const symbol = String(name || '').replace(/^\$/, '');
    const q = ('$' + symbol + ' OR ' + symbol + ' solana').trim();
    const xUrl = 'https://x.com/search?q=' + encodeURIComponent(q) + '&src=typed_query&f=live';
    const upcoming = this.matchListingArticles(listings, name, symbol);
    const findings = [];
    if (upcoming.length) {
      findings.push(
        'Binance new-listing desk matched ' +
          upcoming.length +
          ' announcement(s). “Will List / Will Add” is upcoming; “Added” may already be live.'
      );
    } else {
      findings.push('No match in the latest 20 Binance New Cryptocurrency Listing posts for this name/ticker.');
    }
    const tick = this.store.getTick(String(row.ca || '').toLowerCase()) || {};
    if (tick.m5 != null || tick.h1 != null) {
      findings.push(
        'Dex tape (not social): 5m ' +
          (tick.m5 >= 0 ? '+' : '') +
          (tick.m5 != null ? Number(tick.m5).toFixed(1) : '—') +
          '% · 1h ' +
          (tick.h1 >= 0 ? '+' : '') +
          (tick.h1 != null ? Number(tick.h1).toFixed(1) : '—') +
          '%.'
      );
    }
    return {
      ca: row.ca,
      name,
      chain: row.chain || 'solana',
      symbol,
      xQuery: q,
      xUrl,
      upcoming,
      findings,
      at: now,
      source: 'X posts from your phone. Binance listing desk. No CoinGecko.'
    };
  }

  async sentimentFor(ca, force) {
    const now = Date.now();
    const k = String(ca || '').toLowerCase();
    if (!k) throw new Error('no ca');
    const lists = this.sentimentLists();
    const row =
      lists.saved.find((x) => x.ca.toLowerCase() === k) || lists.hunter.find((x) => x.ca.toLowerCase() === k);
    if (!row) throw new Error('CA is not on saved or hunter lists');
    let cache = {};
    try {
      cache = JSON.parse(this.store.getMeta('sent_cache') || '{}') || {};
    } catch (e) {
      cache = {};
    }
    const hit = cache[k];
    if (!force && hit && now - (hit.at || 0) < SENTIMENT_EVERY_MS && hit.xUrl) {
      return Object.assign({ cached: true }, hit);
    }
    let listings = [];
    let listErr = '';
    try {
      listings = await this.fetchBinanceListings(now);
    } catch (e) {
      listErr = 'Binance listings ' + String(e && e.message ? e.message : e);
    }
    const report = this.buildSentimentReport(row, listings, now);
    if (listErr) report.fetchError = listErr;
    cache[k] = report;
    const cut = now - 6 * 3600e3;
    for (const id of Object.keys(cache)) {
      if (!cache[id] || cache[id].at < cut) delete cache[id];
    }
    this.store.setMeta('sent_cache', JSON.stringify(cache));
    return Object.assign({ cached: false }, report);
  }

  async refreshHunter(now, force) {
    now = now || Date.now();
    if (!force && now < this.rateLimitedUntil) {
      this.logFail('hunter_skip', 'rateLimited');
      this.flushFails(now);
      return { skipped: true, rateLimited: true };
    }
    if (!force && this.dexCallsLastMin(now) >= 22) {
      this.logFail('hunter_skip', 'dex budget ' + this.dexCallsLastMin(now));
      this.flushFails(now);
      return { skipped: true, budget: true };
    }
    const lastDisc = +this.store.getMeta('hunter_discover') || 0;
    const lastScore = +this.store.getMeta('hunter_at') || 0;
    const doDiscover = force || now - lastDisc >= HUNTER_EVERY_MS;
    const doScore = force || now - lastScore >= HUNTER_EVERY_MS;
    if (!doScore) return { skipped: true };
    let seeds = [];
    let calls = 0;
    const prevHits = this.hunterHits().map((h) => ({
      ca: h.ca,
      chain: h.chain,
      boosted: h.boosted,
      src: h.src || 'prev'
    }));
    if (doDiscover) {
      try {
        const got = await fetchHunterSeeds();
        seeds = (got.seeds || []).concat(prevHits);
        calls += got.calls || 0;
        this.store.setMeta('hunter_discover', String(now));
      } catch (e) {
        this.store.setMeta('hunter_err', String(e && e.message ? e.message : e));
        seeds = prevHits;
      }
    } else {
      seeds = prevHits;
    }
    if (!seeds.length) {
      this.store.setMeta('hunter_at', String(now));
      return { hits: 0, calls };
    }
    const watch = new Set(this.store.getWatch().map((w) => w.ca.toLowerCase()));
    let heatPrev = [];
    try {
      heatPrev = JSON.parse(this.store.getMeta('hunter_heat') || '[]') || [];
    } catch (e) {
      heatPrev = [];
    }
    for (const h of heatPrev) {
      if (h && h.ca && now - (+h.t || 0) < 3 * 3600e3)
        seeds.push({ ca: h.ca, chain: h.chain || 'solana', boosted: false, src: 'heat' });
    }
    const volOf = (s) => +((s && s.pair && s.pair.volume && s.pair.volume.h24) || 0);
    const uniqMap = new Map();
    for (const s of seeds) {
      const k = String(s.ca || '').toLowerCase();
      if (!k) continue;
      const prev = uniqMap.get(k);
      if (!prev || volOf(s) > volOf(prev) || (!prev.pair && s.pair)) uniqMap.set(k, s);
    }
    const uniq = Array.from(uniqMap.values());
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
      const isMom = hunterPass(tick, pair, now);
      const isVol = hunterVolPass(tick, pair, now);
      if (!isMom && !isVol) continue;
      const mom = momentumFromTick(tick);
      const created = pair.pairCreatedAt ? +pair.pairCreatedAt : 0;
      const band = hunterBand(tick.mcap);
      hits.push({
        name: tick.name,
        ca: s.ca,
        chain: tick.chain || 'solana',
        band,
        score: mom.score,
        m5: tick.m5,
        h1: tick.h1,
        h6: tick.h6,
        h24: tick.h24,
        volX: mom.volX,
        buyR: mom.buyR,
        vol24h: tick.vol24h,
        vol1h: tick.vol1h,
        liq: tick.liq,
        mcap: +(pair.marketCap || pair.fdv || 0) || null,
        spot: tick.price,
        ageMin: created ? Math.max(0, Math.round((now - created) / 60000)) : null,
        boosted: !!s.boosted,
        src: s.src || '',
        dexUrl: tick.dexUrl,
        pairAddress: tick.pairAddress,
        mom: !!isMom,
        highVol: !!isVol
      });
    }
    const perMom = { micro: 3, small: 3, mid: 3, large: 3 };
    const perVol = { micro: 4, small: 4, mid: 5, large: 5 };
    const buckets = { micro: [], small: [], mid: [], large: [] };
    for (const h of hits) {
      if (buckets[h.band]) buckets[h.band].push(h);
    }
    const top = [];
    for (const k of ['micro', 'small', 'mid', 'large']) {
      const rows = buckets[k];
      const volRows = rows
        .filter((h) => h.highVol)
        .sort((a, b) => (b.vol24h || 0) - (a.vol24h || 0) || (b.vol1h || 0) - (a.vol1h || 0))
        .slice(0, perVol[k]);
      const seen = new Set(volRows.map((h) => String(h.ca).toLowerCase()));
      const momRows = rows
        .filter((h) => h.mom && !seen.has(String(h.ca).toLowerCase()))
        .sort((a, b) => (b.m5 || 0) - (a.m5 || 0) || (b.score || 0) - (a.score || 0))
        .slice(0, perMom[k]);
      top.push.apply(top, volRows.concat(momRows));
    }
    const have = new Set(top.map((h) => String(h.ca).toLowerCase()));
    const heatHits = hits
      .filter((h) => (+h.vol24h || 0) >= 5e6)
      .sort((a, b) => (+b.vol24h || 0) - (+a.vol24h || 0));
    for (const h of heatHits) {
      const k = String(h.ca).toLowerCase();
      if (have.has(k)) continue;
      top.push(h);
      have.add(k);
    }
    this.store.setMeta(
      'hunter_heat',
      JSON.stringify(
        heatHits.slice(0, 24).map((h) => ({ ca: h.ca, chain: h.chain, t: now }))
      )
    );
    this.store.setMeta('hunter_hits', JSON.stringify(top));
    this.store.setMeta('hunter_at', String(now));
    this.store.setMeta('hunter_err', '');
    this.dexCallsLastMin(now);
    this.store.setMeta('dex_calls_min', JSON.stringify(this.dexCallsMin));
    this.flushFails(now);
    return { hits: top.length, calls, discover: doDiscover, seeded: uniq.length, matched: hits.length, miss };
  }

  async tick(mode) {
    const now = Date.now();
    if (this.busy) return { skipped: true };
    const lastPoll0 = +this.store.getMeta('last_poll') || 0;
    if (lastPoll0 && now - lastPoll0 > 12 * 60e3) {
      this.logFail('stale', 'worker silent ' + Math.round((now - lastPoll0) / 60000) + 'm', {
        gapMs: now - lastPoll0
      });
    }
    if (now < this.rateLimitedUntil) {
      this.logFail(
        'paused',
        'tick skipped Dex pause ' + Math.round((this.rateLimitedUntil - now) / 1000) + 's'
      );
      this.flushFails(now);
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
      if (!rows.length || now - lastWatch > 300000) {
        try {
          rows = await this.refreshWatch();
          this.store.setMeta('last_watch', String(now));
        } catch (e) {
          if (!rows.length) throw e;
        }
      }
      const focus = (this.store.getMeta('focus_ca') || '').toLowerCase();
      const lastAll = +this.store.getMeta('last_all') || 0;
      const want1m = mode === '1m' || mode === 'all';
      const doAll = mode === 'all' || mode === 'auto' || (!want1m && now - lastAll >= AUTO_EVERY_MS);
      let targets = doAll ? rows : rows.filter((r) => r.ca.toLowerCase() === focus);
      if (mode === '1m') {
        if (!focus) {
          this.busy = false;
          return { scanned: 0, error: 'Pick a 1m focus coin first' };
        }
        targets = rows.filter((r) => r.ca.toLowerCase() === focus);
      }
      if (!targets.length) {
        this.store.setMeta('last_poll', String(now));
        this.busy = false;
        return { scanned: 0, error: mode === '1m' ? 'Focus coin is not on the saved list' : '' };
      }
      const tfs = want1m ? TAPE_TFS : AUTO_TFS;
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
        const closed = this.applyTick(row.ca, tick, tfs);
        const tfsToCheck = new Set(closed.map((c) => c.tf));
        if (doAll && !want1m) {
          for (const tf of AUTO_TFS) tfsToCheck.add(tf);
        } else if (want1m) {
          tfsToCheck.add('1m');
        }
        for (const tf of tfsToCheck) {
          const hit = this.evaluateRow(row, tf, focus);
          const long = tf === '1d' || tf === '1w' || tf === '1M';
          const justClosed = closed.some((c) => c.tf === tf);
          if (long && !justClosed) continue;
          if (await this.maybeAlert(hit, tf)) nAlert++;
          if (await this.maybeEntryAlert(hit)) nAlert++;
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
      if (n429) this.logFail('dex429', 'DexScreener 429 on ' + n429 + '/' + targets.length, { n: n429 });
      if (errors) this.logFail('nopool', errors + ' without pool', { n: errors });
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
        if (this.store.flushOpens) this.store.flushOpens(now);
      } catch (e) {}
      try {
        await this.maybeBackfill(now);
      } catch (e) {
        const m = String(e && e.message ? e.message : e).slice(0, 120);
        this.store.setMeta('bf_err', m);
        this.logFail('gecko_err', m);
      }
      try {
        await this.refreshHunter(now);
      } catch (e) {
        const m = String(e && e.message ? e.message : e);
        this.store.setMeta('hunter_err', m);
        this.logFail('hunter_err', m.slice(0, 180));
      }
      try {
        await this.maybeHolders(now);
      } catch (e) {
        const m = String(e && e.message ? e.message : e).slice(0, 120);
        this.store.setMeta('holders_err', m);
        this.logFail('holders_err', m);
      }
      if (now % 3600000 < 30000) this.store.prune(now);
      return { scanned, errors, n429, nAlert, doAll, targets: targets.length };
    } catch (e) {
      this.lastErr = String(e && e.message ? e.message : e);
      const dex429 = /429/.test(this.lastErr);
      if (dex429) this.rateLimitedUntil = now + 20000;
      this.store.setMeta('rate_limited_until', String(this.rateLimitedUntil || 0));
      this.store.setMeta('last_err', this.lastErr || '');
      this.logFail(dex429 ? 'dex429' : 'tick_err', this.lastErr);
      return { error: this.lastErr };
    } finally {
      try {
        this.flushFails(now);
      } catch (e) {}
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
  if (path === '/sentiment' || path === '/api/sentiment') {
    const ca = url.searchParams.get('ca') || '';
    const lists = engine.sentimentLists();
    if (!ca) return json({ saved: lists.saved, hunter: lists.hunter, report: null });
    try {
      const report = await engine.sentimentFor(ca, method === 'POST' || url.searchParams.get('force') === '1');
      engine.flushFails(Date.now());
      return json({ saved: lists.saved, hunter: lists.hunter, report });
    } catch (e) {
      engine.flushFails(Date.now());
      return json(
        {
          saved: lists.saved,
          hunter: lists.hunter,
          error: String(e && e.message ? e.message : e)
        },
        /429/.test(String(e && e.message ? e.message : e)) ? 429 : 400
      );
    }
  }
  if (path === '/failures' || path === '/api/failures') {
    return json(engine.failuresSnapshot());
  }
  if (path === '/holders' || path === '/api/holders') {
    if (method === 'POST') {
      try {
        await engine.maybeHolders(Date.now(), true);
      } catch (e) {}
    }
    try {
      const snap = engine.holdersSnapshot();
      if (snap && Array.isArray(snap.cards) && snap.cards.length) return json(snap);
    } catch (e) {}
    try {
      return json(await engine.holdersLive());
    } catch (e) {
      return json({ ok: false, error: String(e && e.message ? e.message : e), cards: [] });
    }
  }
  if (path === '/hunter' || path === '/api/hunter') {
    if (method === 'POST') {
      try {
        const out = await engine.refreshHunter(Date.now(), true);
        engine.flushFails(Date.now());
        return json({
          ok: true,
          ...out,
          hits: engine.decorateHunter(engine.hunterHits()),
          watch: engine.decorateHunter(engine.hunterWatch()),
          scannedAt: engine.store.getMeta('hunter_at') || null,
          error: engine.store.getMeta('hunter_err') || ''
        });
      } catch (e) {
        return json({ ok: false, error: String(e && e.message ? e.message : e) }, 400);
      }
    }
    return json({
      hits: engine.decorateHunter(engine.hunterHits()),
      watch: engine.decorateHunter(engine.hunterWatch()),
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
  if ((path === '/alerts' || path === '/api/alerts') && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    try {
      const out = engine.setAlertPrefs(body);
      return json({ ok: true, ...out, alertWatch: engine.status().alertWatch });
    } catch (e) {
      return json({ ok: false, error: String(e && e.message ? e.message : e) }, 400);
    }
  }
  if ((path === '/focus' || path === '/api/focus') && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const out = engine.setFocus(body.ca || '', body.alerts1m);
    if (body.ca) {
      try {
        await engine.tick('1m');
      } catch (e) {}
    }
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
  if ((path === '/run' || path === '/api/run') && (method === 'POST' || method === 'GET')) {
    const tf = (url.searchParams.get('tf') || '').toLowerCase();
    const mode = tf === '1m' ? '1m' : 'auto';
    const out = await engine.tick(mode);
    return json({ ok: true, mode, ...out, status: engine.status() });
  }
  if ((path === '/backfill' || path === '/api/backfill') && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'bad json' }, 400);
    }
    const ca = body.ca || body.token || '';
    const list = body.ohlcv_list || body.days || body.bars || [];
    if (!ca || !Array.isArray(list) || !list.length) return json({ error: 'ca + ohlcv_list required' }, 400);
    try {
      return json(engine.importGeckoDays(ca, list, Date.now(), body.name || ''));
    } catch (e) {
      return json({ error: String(e && e.message ? e.message : e) }, 500);
    }
  }
  if (path === '/orderbook' || path === '/api/orderbook') {
    try {
      const r = await fetch('https://www.okx.com/api/v5/market/books?instId=BTC-USDT-SWAP&sz=400', {
        headers: { accept: 'application/json' }
      });
      const j = await r.json();
      const d = (j && j.data && j.data[0]) || {};
      const bids = (d.bids || []).map((x) => [+x[0], +x[1]]).filter((x) => x[0] > 0 && x[1] > 0);
      const asks = (d.asks || []).map((x) => [+x[0], +x[1]]).filter((x) => x[0] > 0 && x[1] > 0);
      if (!bids.length || !asks.length) return json({ ok: false, error: 'empty book' }, 502);
      return json({
        ok: true,
        source: 'OKX BTC-USDT-SWAP',
        ts: +(d.ts || Date.now()),
        bids,
        asks
      });
    } catch (err) {
      return json({ ok: false, error: String(err && err.message ? err.message : err) }, 502);
    }
  }
  if (path === '/candles' || path === '/api/candles') {
    const ca = url.searchParams.get('ca') || '';
    const tf = (url.searchParams.get('tf') || '15m').toLowerCase();
    const n = Math.min(800, Math.max(5, +(url.searchParams.get('n') || 50)));
    if (tf === '1m' && ca) {
      try {
        engine.setFocus(ca);
        await engine.tick('1m');
      } catch (e) {}
    }
    return json({ ca, tf, bars: engine.store.bars(ca, tf, n) });
  }
  return json({ error: 'not found', path }, 404);
}
