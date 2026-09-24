import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySnapshot, chartSeries, nextDue } from './tier-history.js';

function store() {
  const m = new Map();
  return { getMeta(k) { return m.get(k); }, setMeta(k, v) { m.set(k, String(v)); } };
}

function bands(values) {
  return values.map((value) => ({ value, tokens: value, count: 1 }));
}

test('first scan saves band values and does not invent a mover', () => {
  const s = store();
  const out = applySnapshot(s, { mint: 'Mint1', name: 'fone', symbol: 'fone', at: 1000, price: 1, holderCount: 10, bands: bands([0, 0, 40, 40, 15, 5]) });
  assert.equal(out.saved, true);
  assert.equal(out.diff, null);
  assert.equal(out.chart.points.length, 1);
});

test('the next hour shows which band took value', () => {
  const s = store();
  applySnapshot(s, { mint: 'Mint1', name: 'fone', symbol: 'fone', at: 1000, price: 1, holderCount: 10, bands: bands([0, 10, 40, 30, 15, 5]) });
  const out = applySnapshot(s, { mint: 'Mint1', name: 'fone', symbol: 'fone', at: 1000 + 61 * 60 * 1000, price: 1.2, holderCount: 12, bands: bands([0, 10, 70, 25, 15, 5]) });
  assert.equal(out.saved, true);
  const dolphin = out.diff.bands.find((b) => b.label === 'Dolphin');
  assert.equal(dolphin.dValue, 30);
  assert.ok(dolphin.dShare > 0);
  assert.equal(out.diff.lead.label, 'Dolphin');
  assert.equal(out.chart.mode, 'hour');
});

test('a same-hour rescan compares without saving another point', () => {
  const s = store();
  applySnapshot(s, { mint: 'Mint1', name: 'fone', symbol: 'fone', at: 1000, price: 1, holderCount: 10, bands: bands([0, 0, 50, 50, 0, 0]) });
  const out = applySnapshot(s, { mint: 'Mint1', name: 'fone', symbol: 'fone', at: 1000 + 10 * 60 * 1000, price: 1.1, holderCount: 10, bands: bands([0, 0, 40, 60, 0, 0]) });
  assert.equal(out.saved, false);
  assert.equal(out.chart.points.length, 2);
  assert.equal(out.diff.bands.find((b) => b.label === 'Fish').dValue, 10);
});

test('more than a day and a half rolls the chart to days', () => {
  const start = Date.parse('2026-09-01T00:00:00Z');
  const points = [0, 1, 2].map((d) => ({ at: start + d * 86400000, bands: bands([1, 1, 1, 1, 1, 1]) }));
  const chart = chartSeries(points);
  assert.equal(chart.mode, 'day');
  assert.equal(chart.points.length, 3);
});

test('a coin is due again after an hour', () => {
  const s = store();
  applySnapshot(s, { mint: 'Mint1', name: 'fone', symbol: 'fone', at: Date.now(), price: 1, holderCount: 1, bands: bands([1, 0, 0, 0, 0, 0]) });
  assert.equal(nextDue(s, Date.now()), null);
  assert.equal(nextDue(s, Date.now() + 61 * 60 * 1000).mint, 'Mint1');
});
