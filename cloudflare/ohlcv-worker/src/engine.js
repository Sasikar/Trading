/**
 * Candle + breakout engine. Works in Cloudflare Workers and Node.
 * DexScreener is the quote tape. We own the candles.
 */
export const NTFY_DEFAULT = 'MyTradingMemeBreakout44';
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

export async function fetchJSON(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'TradingOhlcv/1.0' },
        cache: 'no-store'
      });
      if (r.status === 429) {
        await sleep(900 * (i + 1));
        last = new Error('HTTP 429 DexScreener');
        continue;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      last = e;
      await sleep(280 * (i + 1));
    }
  }
  throw last || new Error('fetch failed');
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
  try {
    const j = await fetchJSON('https://api.dexscreener.com' + path, 2);
    return j.pairs || [];
  } catch (e) {
    const j = await fetchJSON(
      'https://trading-proxy.sasipudi.workers.dev/dex?path=' + encodeURIComponent(path),
      2
    );
    return j.pairs || [];
  }
}

export async function fetchDexPairsForCas(cas, conc = 3) {
  const uniq = [...new Set((cas || []).map((c) => String(c || '').trim()).filter(Boolean))];
  const byCa = new Map();
  for (let i = 0; i < uniq.length; i += conc) {
    const chunk = uniq.slice(i, i + conc);
    const parts = await Promise.all(
      chunk.map(async (ca) => {
        try {
          return [ca, await fetchDexPair(ca)];
        } catch (e) {
          return [ca, e];
        }
      })
    );
    for (const [ca, val] of parts) byCa.set(ca, val);
    if (i + conc < uniq.length) await sleep(220);
  }
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
    pairAddress: tick ? tick.pairAddress : row.poolAddress || ''
  };
}

export async function sendNtfy(topic, title, message) {
  const topics = [...new Set([topic, NTFY_DEFAULT].map((t) => String(t || '').trim()).filter(Boolean))];
  let lastErr = null;
  let ok = 0;
  for (const t of topics) {
    try {
      const r = await fetch('https://ntfy.sh/' + encodeURIComponent(t), {
        method: 'POST',
        headers: {
          Title: String(title || '').slice(0, 90),
          Priority: 'high',
          Tags: 'chart_with_upwards_trend,moneybag'
        },
        body: title + '\n' + message
      });
      if (!r.ok) throw new Error('ntfy HTTP ' + r.status);
      ok++;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!ok && lastErr) throw lastErr;
  return { ok };
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
    this.dexCallsMin = [];
    this.rateLimitedUntil = 0;
  }

  topic() {
    return this.env.NTFY_TOPIC || NTFY_DEFAULT;
  }
  watchUrl() {
    return this.env.WATCHLIST_URL || WATCHLIST_DEFAULT;
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
    if (tf === '1m') {
      if (!hit.focus) return false;
      if (this.store.getMeta('focus_1m_alerts') !== 'on') return false;
      return hit.fresh && hit.event === 'NEW BREAKOUT';
    }
    if (tf === '5m' || tf === '10m') {
      return hit.fresh && hit.event === 'NEW BREAKOUT' && hit.score >= 55;
    }
    return hit.fresh && hit.held && hit.age <= 2 && (hit.score >= 55 || hit.event === 'NEW BREAKOUT');
  }

  async maybeAlert(hit, tf) {
    if (!this.shouldNtfy(hit, tf)) return false;
    const key = hit.ca + '|' + tf + '|' + hit.event;
    const now = Date.now();
    if (now - this.store.getAlert(key) < this.cooldownMs(tf)) return false;
    const title = '🚀 ' + hit.name + ' · ' + String(tf).toUpperCase() + ' breakout';
    const msg = [
      hit.name + ' (' + (hit.chain === 'solana' ? 'SOL' : 'ETH') + ')',
      'Event: ' + hit.event + ' · ' + hit.state + ' · score ' + hit.score,
      'TF ' + tf + (hit.warming ? ' · warming' : ''),
      '5m ' + hit.m5 + '% · 1h ' + hit.h1 + '% · vol ' + hit.volX + 'x',
      'CA: ' + hit.ca,
      'https://sasikar.github.io/Trading/index.html?tab=breakouts'
    ].join('\n');
    try {
      await sendNtfy(this.topic(), title, msg);
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
          at: new Date(now).toISOString()
        })
      );
      return true;
    } catch (e) {
      this.lastErr = 'ntfy ' + (e.message || e);
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
    const health =
      this.rateLimitedUntil > now
        ? 'RATE_LIMITED'
        : lastPoll && now - lastPoll < 90000
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
      dexBudget: 120,
      error: this.lastErr || '',
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
      this.lastErr = 'DexScreener 429 backoff';
      return { skipped: true, rateLimited: true };
    }
    this.busy = true;
    let nAlert = 0;
    let scanned = 0;
    let errors = 0;
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
      for (let i = 0; i < targets.length; i++) this.dexCallsMin.push(now);

      for (const row of targets) {
        const got = byCa.get(row.ca);
        if (!got || got instanceof Error) {
          errors++;
          if (got instanceof Error && /429/.test(got.message || '') && scanned === 0) {
            this.rateLimitedUntil = now + 45000;
            this.lastErr = 'DexScreener 429';
          }
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
      this.store.setMeta('last_poll', String(now));
      if (doAll) this.store.setMeta('last_all', String(now));
      this.store.setMeta('last_n_alert', String(nAlert));
      this.store.setMeta('last_scanned', String(scanned));
      this.store.setMeta('last_errors', String(errors));
      if (now % 3600000 < 30000) this.store.prune(now);
      this.lastErr = errors && !scanned ? this.lastErr : errors ? errors + ' without pool' : '';
      return { scanned, errors, nAlert, doAll, targets: targets.length };
    } catch (e) {
      this.lastErr = String(e && e.message ? e.message : e);
      if (/429/.test(this.lastErr)) this.rateLimitedUntil = now + 60000;
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
    await sendNtfy(engine.topic(), 'Trading · ntfy test', 'Topic ' + engine.topic() + '\nOHLCV engine is live.');
    return json({ ok: true, topic: engine.topic() });
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
