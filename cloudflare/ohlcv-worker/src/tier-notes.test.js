import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNote, writeNote } from './tier-notes.js';

function store() {
  const m = new Map();
  return { getMeta(k) { return m.get(k); }, setMeta(k, v) { m.set(k, String(v)); } };
}

test('a note comes back for the same mint and does not leak to another', () => {
  const s = store();
  writeNote(s, 'MintA', { bubble: 'rug', dex: 'liked the wick' });
  writeNote(s, 'MintA', { dex: 'liked the wick, still' });
  const a = readNote(s, 'MintA');
  assert.equal(a.bubble, 'rug');
  assert.equal(a.dex, 'liked the wick, still');
  assert.equal(readNote(s, 'MintB').bubble, '');
  assert.equal(readNote(s, 'MintB').dex, '');
});

test('a bad bubble value is dropped', () => {
  const s = store();
  const row = writeNote(s, 'MintA', { bubble: 'nope', dex: 'x' });
  assert.equal(row.bubble, '');
  assert.equal(row.dex, 'x');
});
