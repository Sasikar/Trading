import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFomoEntry, writeFomoEntry } from './fomo-entry.js';

test('fomo checks stay on the worker', () => {
  const bag = {};
  const store = { getMeta() { return bag.v || '[]'; }, setMeta(_k, v) { bag.v = v; } };
  const items = writeFomoEntry(store, [
    { text: 'DCA entry please', on: true, custom: false },
    { text: '   ', on: true },
    { text: 'x'.repeat(200), on: false, custom: true }
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[0].on, true);
  assert.equal(items[1].text.length, 160);
  assert.deepEqual(readFomoEntry(store), items);
  writeFomoEntry(store, []);
  assert.deepEqual(readFomoEntry(store), []);
});
