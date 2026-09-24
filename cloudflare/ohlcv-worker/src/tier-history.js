import { scanTiers } from './tiers.js';

const WATCH = 'tier_watch';
const GAP = 60 * 60 * 1000;
const MAX_COINS = 15;
const MAX_POINTS = 24 * 14;
const LABELS = ['Whale', 'Shark', 'Dolphin', 'Fish', 'Crab', 'Shrimp'];

function readJson(store, key, fallback) {
  try {
    const v = store.getMeta(key);
    if (!v) return fallback;
    const parsed = JSON.parse(v);
    return parsed == null ? fallback : parsed;
  } catch (e) {
    return fallback;
  }
}

function histKey(mint) {
  return 'tier_hist:' + mint;
}

export function normalizeBands(raw) {
  const list = raw || [];
  const sum = list.reduce((s, b) => s + (Number(b && b.value) || 0), 0);
  return LABELS.map((label, i) => {
    const b = list[i] || {};
    const value = Number(b.value) || 0;
    return {
      label,
      value: Math.round(value),
      tokens: Math.round(Number(b.tokens) || 0),
      pct: sum ? (value / sum) * 100 : 0
    };
  });
}

export function diffBands(prev, next) {
  const pricePct = prev.price > 0 ? ((next.price - prev.price) / prev.price) * 100 : null;
  const bands = LABELS.map((label, i) => {
    const a = (prev.bands || [])[i] || {};
    const b = (next.bands || [])[i] || {};
    return {
      label,
      prev: Number(a.value) || 0,
      value: Number(b.value) || 0,
      dValue: (Number(b.value) || 0) - (Number(a.value) || 0),
      share: Number(b.pct) || 0,
      dShare: (Number(b.pct) || 0) - (Number(a.pct) || 0)
    };
  });
  let lead = null;
  if (pricePct != null && pricePct > 1) {
    lead = bands.filter((b) => b.dShare > 0.3).sort((a, b) => b.dShare - a.dShare)[0] || null;
  } else if (pricePct != null && pricePct < -1) {
    lead = bands.filter((b) => b.dShare < -0.3).sort((a, b) => a.dShare - b.dShare)[0] || null;
  }
  return { at: prev.at, pricePct, prevPrice: prev.price, nextPrice: next.price, bands, lead };
}

export function chartSeries(points) {
  const rows = (points || []).filter((p) => p && p.bands && p.bands.length);
  if (rows.length < 2) return { mode: 'hour', points: rows };
  const span = rows[rows.length - 1].at - rows[0].at;
  if (span < 36 * 60 * 60 * 1000) return { mode: 'hour', points: rows };
  const days = new Map();
  rows.forEach((p) => days.set(new Date(p.at).toISOString().slice(0, 10), p));
  return { mode: 'day', points: Array.from(days.values()) };
}

function point(snap) {
  return {
    at: snap.at,
    price: snap.price || 0,
    mcap: snap.mcap || 0,
    holderCount: snap.holderCount || 0,
    bands: normalizeBands(snap.bands)
  };
}

export function applySnapshot(store, snap) {
  const now = snap.at || Date.now();
  const watch = readJson(store, WATCH, []);
  let row = watch.find((w) => w.mint === snap.mint);
  if (!row) {
    row = { mint: snap.mint, name: snap.name || '', symbol: snap.symbol || '', lastAt: 0 };
    watch.unshift(row);
  }
  row.name = snap.name || row.name;
  row.symbol = snap.symbol || row.symbol;
  const kept = watch.slice(0, MAX_COINS);
  const hist = readJson(store, histKey(snap.mint), []);
  const last = hist[hist.length - 1];
  const lastOk = last && last.bands && last.bands.length;
  const fresh = !lastOk || now - last.at >= GAP;
  const saved = point({ ...snap, at: now });
  if (fresh && kept.some((w) => w.mint === snap.mint)) {
    hist.push(saved);
    while (hist.length > MAX_POINTS) hist.shift();
    store.setMeta(histKey(snap.mint), JSON.stringify(hist));
    row.lastAt = now;
  }
  store.setMeta(WATCH, JSON.stringify(kept));
  const series = fresh ? hist.slice() : hist.concat([saved]);
  const withBands = series.filter((p) => p.bands && p.bands.length);
  const baseline = withBands.length > 1 ? withBands[withBands.length - 2] : null;
  const latest = withBands[withBands.length - 1];
  return {
    saved: fresh && kept.some((w) => w.mint === snap.mint),
    points: withBands.length,
    tracked: kept.length,
    baselineAt: baseline ? baseline.at : 0,
    diff: baseline && latest ? diffBands(baseline, latest) : null,
    chart: chartSeries(withBands)
  };
}

export function nextDue(store, now) {
  const watch = readJson(store, WATCH, []);
  return watch.find((w) => !w.lastAt || now - w.lastAt >= GAP) || null;
}

export async function tierDailyTick(env, store) {
  const due = nextDue(store, Date.now());
  if (!due) return { ok: true, skipped: true };
  const data = await scanTiers(env, due.mint);
  const history = applySnapshot(store, {
    mint: data.mint,
    name: data.name,
    symbol: data.symbol,
    at: Date.now(),
    price: data.price,
    mcap: data.mcap,
    holderCount: data.holderCount,
    bands: data.buckets || []
  });
  return { ok: true, mint: data.mint, saved: history.saved };
}
