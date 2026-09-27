import { rangeLowFromBars } from './engine.js';

export const SUPPORT_TFS = [
  { tf: '5m', n: 24 },
  { tf: '15m', n: 24 },
  { tf: '1h', n: 24 },
  { tf: '2h', n: 20 },
  { tf: '4h', n: 20 },
  { tf: '1d', n: 30 },
  { tf: '1w', n: 12 }
];

export function suggestSupport(spot, levels) {
  const spotN = +spot || 0;
  const rows = (levels || []).filter((row) => +row.px > 0 && row.tf);
  if (!(spotN > 0) || !rows.length) return { price: 0, tfs: [], why: 'No bars yet.' };
  const under = rows.filter((row) => row.px < spotN * 0.998);
  if (!under.length) return { price: 0, tfs: [], why: 'Price is under every support. No bid.' };
  const sorted = under.slice().sort((a, b) => a.px - b.px);
  const clusters = [];
  sorted.forEach((row) => {
    const last = clusters[clusters.length - 1];
    if (last && (row.px - last.anchor) / last.anchor <= 0.025) last.rows.push(row);
    else clusters.push({ anchor: row.px, rows: [row] });
  });
  let best = null;
  clusters.forEach((cluster) => {
    const price = Math.max(...cluster.rows.map((row) => row.px));
    const tfs = cluster.rows.map((row) => row.tf);
    const score = tfs.length * 100 + price / spotN;
    if (!best || score > best.score) best = { price, tfs, score };
  });
  return {
    price: best.price,
    tfs: best.tfs,
    why: best.tfs.length > 1 ? 'Agreed by ' + best.tfs.join(' ') : 'Only ' + best.tfs[0] + ' is under price'
  };
}

export function readFavSupports(store) {
  const watch = (store.getWatch && store.getWatch()) || [];
  const rows = watch.map((coin) => {
    const ca = String(coin.ca || '').toLowerCase();
    const tick = (store.getTick && store.getTick(ca)) || {};
    const spot = +tick.price || 0;
    const levels = SUPPORT_TFS.map((spec) => ({
      tf: spec.tf,
      px: rangeLowFromBars(store.bars(ca, spec.tf, spec.n + 2), spec.n)
    }));
    const pick = suggestSupport(spot, levels);
    return {
      ca,
      name: coin.name || ca.slice(0, 6),
      spot,
      levels,
      price: pick.price,
      tfs: pick.tfs,
      why: pick.why
    };
  }).filter((row) => row.ca);
  rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { at: Date.now(), rows };
}
