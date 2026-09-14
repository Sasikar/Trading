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
      interesting: false
    };
  }
  const last = bars[bars.length - 1];
  const prior = bars.slice(Math.max(0, bars.length - 1 - 20), bars.length - 1);
  const rangeHigh = Math.max(...prior.map((b) => b.h));
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
  if (mom.stretched || runup >= 18 || ret >= 22) {
    if (held || broke) state = 'STRETCHED';
  }
  let score = mom.score;
  if (broke) score = Math.max(score, 58);
  if (state === 'STRETCHED') score = Math.max(0, score - 12);
  const interesting = state !== 'WATCH' || fresh || held || score >= 55;
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
  return {
    state,
    event,
    fresh,
    held,
    age,
    score: mom.score,
    bars: 0,
    need: 0,
    interesting: state !== 'WATCH' || fresh || held || mom.score >= 55
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
    interesting: state !== 'WATCH' || fresh || held || score >= 55,
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
    interesting: state !== 'WATCH' || fresh || held || score >= 55,
    live: true
  };
}

export function sizePctOf(state) {
  if (state === 'STRONG CONFIRMED') return 80;
  if (state === 'EARLY') return 35;
  return 0;
}

export function hitFrom(row, tick, det, tf, focus) {
  const mom = momentumFromTick(tick || {});
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
    live: !!det.live
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
    this.dexCallsMin = [];
    this.rateLimitedUntil = 0;
    try {
      const saved = JSON.parse(store.getMeta('dex_calls_min') || '[]');
      if (Array.isArray(saved)) this.dexCallsMin = saved.filter((t) => Number.isFinite(+t)).map(Number);
    } catch (e) {}
    this.rateLimitedUntil = +store.getMeta('rate_limited_until') || 0;
    this.lastErr = store.getMeta('last_err') || '';
    this.ntfyErr = store.getMeta('ntfy_err') || '';
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

  shouldNtfy(hit, tf, focus) {
    if (hit.state === 'WARMING' || hit.state === 'WATCH') return false;
    if (this.ntfyPaused()) return false;
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
    if (!this.shouldNtfy(hit, tf)) return false;
    const now = Date.now();
    const key = tf === '1m' ? hit.ca.toLowerCase() + '|1m' : hit.ca.toLowerCase() + '|coin';
    if (now - this.store.getAlert(key) < this.cooldownMs(tf === '1m' ? '1m' : '4h')) return false;
    const title = '🚀 ' + hit.name + ' · ' + String(tf).toUpperCase() + ' breakout';
    const msg = [
      hit.name + ' (' + (hit.chain === 'solana' ? 'SOL' : 'ETH') + ')',
      'Event: ' + hit.event + ' · ' + hit.state + ' · score ' + hit.score,
      'TF ' + tf,
      '5m ' + hit.m5 + '% · 1h ' + hit.h1 + '% · vol ' + hit.volX + 'x',
      'CA: ' + hit.ca,
      'https://sasikar.github.io/Trading/index.html?tab=breakouts'
    ].join('\n');
    try {
      await sendNtfy(this.topic(), title, msg);
      this.store.setAlert(key, now);
      this.ntfyErr = '';
      this.store.setMeta('ntfy_err', '');
      this.store.setMeta(
        'last_alert',
        JSON.stringify({
          name: hit.name,
          ca: hit.ca,
          tf,
          event: hit.event,
          state: hit.state,
          score: hit.score,
          at: new Date(now).toISOString()
        })
      );
      return true;
    } catch (e) {
      this.store.setAlert(key, now);
      this.markNtfyFail(e);
      return false;
    }
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
        det = Object.assign({}, live, { bars: det.bars, need: det.need });
      } else if (det.state === 'WARMING' && tf === '5m') {
        const live = detectLive5m(tick);
        det = Object.assign({}, live, { bars: det.bars, need: det.need });
      }
    } else {
      det = detectDexTf(tick, tf);
    }
    return hitFrom(row, tick, det, tf, focus);
  }

  snapshot(tf) {
    const focus = this.store.getMeta('focus_ca') || '';
    const tfn = String(tf || '4h').toLowerCase();
    const rows = this.store.getWatch();
    let hits = rows.map((r) => this.evaluateRow(r, tfn, focus));
    if (tfn === '1m') hits = hits.filter((h) => h.focus);
    hits.sort((a, b) => (b.score || 0) - (a.score || 0));
    return hits;
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
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 8)
      .map((h) => ({
        name: h.name,
        ca: h.ca,
        state: h.state,
        score: h.score,
        event: h.event,
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
      lastAlert,
      topScores: tops,
      watch: watch.map((w) => ({ ca: w.ca, name: w.name, chain: w.chain }))
    };
  }

  async refreshWatch() {
    const rows = await fetchWatchlist(this.watchUrl());
    this.store.setWatch(rows);
    return rows;
  }

  async tick(mode) {
    const now = Date.now();
    if (this.busy) return { skipped: true };
    if (now < this.rateLimitedUntil) {
      return { skipped: true, rateLimited: true };
    }
    this.busy = true;
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
    return json({
      tf,
      updated: new Date().toISOString(),
      status: st,
      hits,
      count: hits.length
    });
  }
  if ((path === '/focus' || path === '/api/focus') && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const out = engine.setFocus(body.ca || '', body.alerts1m);
    return json(out);
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
