import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySignals, signalView } from './ew-signals.js';

test('a repeated state is one signal, and a later change is another', () => {
  const t0 = Date.parse('2026-09-25T12:00:00Z');
  let book = applySignals({}, [{ ca: 'Mint', tf: '15m', state: 'NO_CHASE', label: 'NO CHASE', why: 'extended' }], t0);
  book = applySignals(book, [{ ca: 'Mint', tf: '15m', state: 'NO_CHASE', label: 'NO CHASE', why: 'extended' }], t0 + 1000);
  book = applySignals(book, [{ ca: 'Mint', tf: '15m', state: 'RECLAIM', label: 'RECLAIM', why: 'back' }], t0 + 2000);
  assert.equal(book.log.length, 2);
  assert.equal(book.log[1].state, 'RECLAIM');
});

test('no setup is not a signal, but the next real state fires again', () => {
  const t0 = Date.parse('2026-09-25T12:00:00Z');
  let book = applySignals({}, [{ ca: 'Mint', tf: '5m', state: 'RECLAIM', label: 'RECLAIM' }], t0);
  book = applySignals(book, [{ ca: 'Mint', tf: '5m', state: 'NO_SETUP', label: 'NO BREAKOUT' }], t0 + 1000);
  book = applySignals(book, [{ ca: 'Mint', tf: '5m', state: 'RECLAIM', label: 'RECLAIM' }], t0 + 2000);
  assert.equal(book.log.length, 2);
});

test('the last hour counts only events inside that window', () => {
  const now = Date.parse('2026-09-25T18:00:00Z');
  const book = applySignals({}, [
    { ca: 'Mint', tf: '15m', state: 'NO_CHASE', label: 'NO CHASE' },
    { ca: 'Mint', tf: '1h', state: 'RECLAIM', label: 'RECLAIM' }
  ], now - 2 * 3600e3);
  const again = applySignals(book, [
    { ca: 'Mint', tf: '15m', state: 'RETEST', label: 'RETEST' }
  ], now - 10 * 60e3);
  const view = signalView(again.log, 'mint', now);
  assert.equal(view.byTf['15m'].n, 2);
  assert.equal(view.byTf['15m'].hour, 1);
  assert.equal(view.byTf['1h'].hour, 0);
  assert.equal(view.hour, 1);
});

test('events older than 3 days are dropped', () => {
  const now = Date.parse('2026-09-25T18:00:00Z');
  const book = applySignals({}, [{ ca: 'Mint', tf: '15m', state: 'NO_CHASE', label: 'NO CHASE' }], now - 4 * 86400e3);
  const next = applySignals(book, [], now);
  assert.equal(next.log.length, 0);
});
