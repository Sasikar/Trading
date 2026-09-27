import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestSupport, readFavSupports } from './fav-support.js';

test('engine price is the nearest floor that more than one timeframe shares', () => {
  const pick = suggestSupport(0.01, [
    { tf: '5m', px: 0.0097 },
    { tf: '15m', px: 0.0081 },
    { tf: '1h', px: 0.00805 },
    { tf: '4h', px: 0.006 }
  ]);
  assert.equal(pick.tfs.length, 2);
  assert.ok(pick.price > 0.008);
  assert.ok(pick.price < 0.0082);
  assert.match(pick.why, /15m/);
});

test('a lone 5m low does not beat a higher-timeframe pair', () => {
  const pick = suggestSupport(1, [
    { tf: '5m', px: 0.99 },
    { tf: '4h', px: 0.8 },
    { tf: '1d', px: 0.81 }
  ]);
  assert.deepEqual(pick.tfs.sort(), ['1d', '4h']);
});

test('readFavSupports uses stored candle lows', () => {
  const bars = [];
  for (let i = 0; i < 6; i++) bars.push({ t: i, l: 0.004 + i * 0.0001 });
  const store = {
    getWatch: () => [{ ca: 'abc', name: 'JEAN' }],
    getTick: () => ({ price: 0.006 }),
    bars: (_ca, tf) => (tf === '1h' || tf === '4h' ? bars : [])
  };
  const row = readFavSupports(store).rows[0];
  assert.equal(row.name, 'JEAN');
  assert.equal(row.price, 0.004);
  assert.ok(row.tfs.includes('1h'));
});
