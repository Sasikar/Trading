import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decisionCheck, countLevelTests, pickDecisionHit } from './decision-check.js';

test('extended EW location is WAIT / WAIT FOR RESET, not a buy', () => {
  const c = decisionCheck({
    hit: {
      tf: '1h',
      state: 'STRETCHED',
      event: 'BREAKOUT HELD',
      age: 3,
      volX: 1.2,
      ca: 'x',
      entry: { paint: 'EXTENDED' },
      ew: { state: 'NO_CHASE', label: 'NO CHASE', level: 1, spot: 1.18, extPct: 18 }
    },
    tick: { price: 1.18, m5: 2, h1: 8, liq: 2e6, t: Date.now() },
    bars5m: []
  });
  assert.equal(c.overall, 'WAIT');
  assert.equal(c.action, 'WAIT FOR RESET');
  const ext = c.checks.find((x) => x.id === 'extension');
  assert.equal(ext.state, 'WAIT');
  assert.equal(ext.internal, 'BLUNDER_FOMO');
  assert.equal(/blunder|stupid|chase|fomo/i.test(ext.why), false);
});

test('no setup is not a negative WAIT from missing data', () => {
  const c = decisionCheck({
    hit: { tf: '1h', state: 'WATCH', event: '—', ew: { state: 'NO_SETUP' }, entry: {} },
    tick: { price: 1, m5: 0.2, h1: -1, liq: 5e5, t: Date.now() }
  });
  const ext = c.checks.find((x) => x.id === 'extension');
  assert.equal(ext.state, 'UNAVAILABLE');
  assert.ok(c.overall === 'CLEAR' || c.overall === 'CHECK');
});

test('invalidated setup is WAIT FOR CONFIRMATION', () => {
  const c = decisionCheck({
    hit: {
      tf: '1h',
      state: 'WATCH',
      event: 'BREAKOUT HELD',
      age: 2,
      volX: 1,
      entry: { paint: 'FAILED' },
      ew: { state: 'INVALIDATED', level: 1, spot: 0.96, extPct: -4 }
    },
    tick: { price: 0.96, m5: -3, h1: -8, liq: 8e5, t: Date.now() }
  });
  assert.equal(c.overall, 'WAIT');
  assert.equal(c.action, 'WAIT FOR CONFIRMATION');
});

test('level tests count crossings not every bar', () => {
  const bars = [
    { c: 0.9 },
    { c: 1.01 },
    { c: 1.02 },
    { c: 0.9 },
    { c: 1.01 }
  ];
  assert.equal(countLevelTests(bars, 1), 2);
});

test('pickDecisionHit prefers ACTIVE over NO_SETUP', () => {
  const h = pickDecisionHit({
    '4h': { ew: { state: 'NO_SETUP' }, tf: '4h' },
    '1h': { ew: { state: 'ACTIVE' }, tf: '1h' }
  });
  assert.equal(h.tf, '1h');
});
