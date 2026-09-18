import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crashObserve } from './engine.js';

test('user example: −31% 1H + 5m bounce + sell pressure → AVOID, not a buy', () => {
  const c = crashObserve({
    tick: {
      price: 0.01,
      m5: 12.86,
      h1: -30.82,
      h6: -39.76,
      h24: -34.17,
      vol5m: 2e5,
      vol1h: 2.018e6,
      buys1h: 80,
      sells1h: 110,
      liq: 1.6e6
    },
    prevLiq: 1.6e6,
    bars1h: [
      { t: 1, o: 0.015, h: 0.016, l: 0.014, c: 0.015, vol: 1 },
      { t: 2, o: 0.015, h: 0.015, l: 0.0095, c: 0.01, vol: 2 }
    ]
  });
  assert.equal(c.severity, 'SEVERE');
  assert.equal(c.status, 'AVOID');
  assert.equal(c.deadCat, true);
  assert.equal(c.sellPressure, true);
  assert.notEqual(c.status, 'RECOVERY_TEST');
});

test('extreme −40% 1H is AVOID even without extra flags', () => {
  const c = crashObserve({
    tick: { price: 1, m5: -2, h1: -41, h6: -20, h24: -10, vol5m: 10, vol1h: 100, liq: 1e6 }
  });
  assert.equal(c.severity, 'EXTREME');
  assert.equal(c.status, 'AVOID');
});

test('−22% 1H with no extras is WATCH, not AVOID', () => {
  const c = crashObserve({
    tick: {
      price: 1,
      m5: -1,
      h1: -22,
      h6: -10,
      h24: -8,
      vol5m: 8,
      vol1h: 120,
      buys1h: 20,
      sells1h: 18,
      liq: 1e6
    },
    prevLiq: 1e6
  });
  assert.equal(c.severity, 'CRASH');
  assert.equal(c.status, 'WATCH');
});

test('quiet tape stays QUIET', () => {
  const c = crashObserve({
    tick: { price: 1, m5: 0.4, h1: -3, h6: 2, h24: 5, vol5m: 10, vol1h: 100, liq: 1e6 }
  });
  assert.equal(c.status, 'QUIET');
  assert.equal(c.severity, 'NONE');
});

test('5m dump −13% fires CRASH before the 1H print', () => {
  const c = crashObserve({
    tick: { price: 1, m5: -13, h1: -8, h6: -4, h24: 0, vol5m: 50, vol1h: 100, liq: 1e6 }
  });
  assert.equal(c.severity, 'CRASH');
  assert.ok(c.status === 'WATCH' || c.status === 'AVOID');
});
