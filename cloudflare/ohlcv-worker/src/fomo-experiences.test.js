import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFomoExperiences, writeFomoExperiences } from './fomo-experiences.js';

test('fomo experiences keep every price row and a deleted list stays empty', () => {
  const bag = {};
  const store = { getMeta() { return bag.v || 'null'; }, setMeta(_k, v) { bag.v = v; } };
  const items = writeFomoExperiences(store, [{
    id: '1',
    name: 'JEANPHIL',
    prices: [{ entered: '0.008', current: '0.01' }, { entered: '', current: '' }, { entered: '0.007', current: '0.011' }],
    note: 'chunked',
    at: 10
  }, { name: '   ' }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].prices.length, 2);
  assert.equal(readFomoExperiences(store).saved, true);
  writeFomoExperiences(store, []);
  const again = readFomoExperiences(store);
  assert.equal(again.saved, true);
  assert.equal(again.items.length, 0);
});
