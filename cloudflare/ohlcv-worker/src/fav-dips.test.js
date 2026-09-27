import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFavDips, writeFavDips } from './fav-dips.js';

test('fav dips keep date, dip, and support, and a delete stays empty', () => {
  const bag = {};
  const store = { getMeta() { return bag.v || 'null'; }, setMeta(_k, v) { bag.v = v; } };
  const items = writeFavDips(store, [
    { id: '1', date: '2026-09-27', name: 'JEANPHIL', dip: '0.0042', support: '0.0048', watch: true },
    { name: '   ', dip: '1' }
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].date, '2026-09-27');
  assert.equal(items[0].dip, '0.0042');
  assert.equal(items[0].watch, true);
  assert.equal(readFavDips(store).saved, true);
  writeFavDips(store, []);
  const again = readFavDips(store);
  assert.equal(again.saved, true);
  assert.equal(again.items.length, 0);
});
