import { scanTiers } from './tiers.js';

const WATCH = 'tier_watch';
const GAP = 20 * 60 * 60 * 1000;
const MAX_COINS = 15;
const MAX_DAYS = 14;

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

export function diffBooks(prev, next) {
  const before = new Map((prev.book || []).map((r) => [r.owner, Number(r.raw) || 0]));
  const after = new Map((next.book || []).map((r) => [r.owner, Number(r.raw) || 0]));
  const changed = [];
  const added = [];
  const left = [];
  for (const [owner, raw] of after) {
    if (!before.has(owner)) {
      added.push({ owner, tokens: next.book.find((r) => r.owner === owner).tokens });
      continue;
    }
    const was = before.get(owner);
    if (!(was > 0)) continue;
    const pct = ((raw - was) / was) * 100;
    if (Math.abs(pct) < 0.5) continue;
    const row = next.book.find((r) => r.owner === owner);
    changed.push({ owner, pct, tokens: row ? row.tokens : 0, cut: pct < 0 });
  }
  for (const [owner] of before) {
    if (!after.has(owner)) left.push({ owner });
  }
  changed.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  const pricePct = prev.price > 0 ? ((next.price - prev.price) / prev.price) * 100 : null;
  return {
    at: prev.at,
    pricePct,
    prevPrice: prev.price,
    nextPrice: next.price,
    holderDelta: (next.holderCount || 0) - (prev.holderCount || 0),
    changed,
    added,
    left
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
  const fresh = !last || now - last.at >= GAP;
  const saved = {
    at: now,
    price: snap.price || 0,
    mcap: snap.mcap || 0,
    holderCount: snap.holderCount || 0,
    book: (snap.book || []).slice(0, 15).map((r) => ({ owner: r.owner, raw: String(r.raw), tokens: r.tokens }))
  };
  if (fresh && kept.some((w) => w.mint === snap.mint)) {
    hist.push(saved);
    while (hist.length > MAX_DAYS) hist.shift();
    store.setMeta(histKey(snap.mint), JSON.stringify(hist));
    row.lastAt = now;
  }
  store.setMeta(WATCH, JSON.stringify(kept));
  const baseline = fresh ? hist[hist.length - 2] : last;
  return {
    saved: fresh && kept.some((w) => w.mint === snap.mint),
    days: hist.length,
    tracked: kept.length,
    baselineAt: baseline ? baseline.at : 0,
    diff: baseline ? diffBooks(baseline, saved) : null
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
    book: data.book
  });
  return { ok: true, mint: data.mint, saved: history.saved };
}
