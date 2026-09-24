import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySnapshot, diffBooks, nextDue } from './tier-history.js';

function store() {
  const m = new Map();
  return {
    getMeta(k) { return m.get(k); },
    setMeta(k, v) { m.set(k, String(v)); }
  };
}

const book = (raw) => [{ owner: 'WalletA', raw: String(raw), tokens: raw / 1e6 }, { owner: 'WalletB', raw: '5000000', tokens: 5 }];

test('first check saves and has no comparison yet', () => {
  const s = store();
  const out = applySnapshot(s, { mint: 'Mint1', name: 'fone', symbol: 'fone', at: 1_000, price: 1, mcap: 10, holderCount: 100, book: book(10000000) });
  assert.equal(out.saved, true);
  assert.equal(out.baselineAt, 0);
  assert.equal(out.diff, null);
});

test('a later check the same day compares tokens without saving again', () => {
  const s = store();
  applySnapshot(s, { mint: 'Mint1', name: 'fone', symbol: 'fone', at: 1_000, price: 1, mcap: 10, holderCount: 100, book: book(10000000) });
  const out = applySnapshot(s, { mint: 'Mint1', name: 'fone', symbol: 'fone', at: 1_000 + 60 * 60 * 1000, price: 1.4, mcap: 14, holderCount: 110, book: book(8000000) });
  assert.equal(out.saved, false);
  assert.equal(out.days, 1);
  assert.ok(Math.abs(out.diff.pricePct - 40) < 0.01);
  assert.equal(out.diff.changed[0].owner, 'WalletA');
  assert.ok(out.diff.changed[0].cut);
  assert.ok(Math.abs(out.diff.changed[0].pct + 20) < 0.01);
});

test('the next day saves a new row', () => {
  const s = store();
  applySnapshot(s, { mint: 'Mint1', name: 'fone', symbol: 'fone', at: 1_000, price: 1, holderCount: 100, book: book(10000000) });
  const out = applySnapshot(s, { mint: 'Mint1', name: 'fone', symbol: 'fone', at: 1_000 + 21 * 60 * 60 * 1000, price: 0.8, holderCount: 90, book: book(10000000) });
  assert.equal(out.saved, true);
  assert.equal(out.days, 2);
  assert.equal(out.diff.changed.length, 0);
  assert.ok(out.diff.pricePct < 0);
});

test('a wallet that leaves the top list is not called a sale', () => {
  const diff = diffBooks(
    { at: 1, price: 1, holderCount: 10, book: [{ owner: 'Gone', raw: '10', tokens: 10 }, { owner: 'Stay', raw: '10', tokens: 10 }] },
    { at: 2, price: 1, holderCount: 10, book: [{ owner: 'Stay', raw: '10', tokens: 10 }, { owner: 'New', raw: '9', tokens: 9 }] }
  );
  assert.equal(diff.changed.length, 0);
  assert.equal(diff.left[0].owner, 'Gone');
  assert.equal(diff.added[0].owner, 'New');
});

test('daily tick only picks a coin older than 20 hours', () => {
  const s = store();
  applySnapshot(s, { mint: 'Mint1', name: 'fone', symbol: 'fone', at: Date.now(), price: 1, holderCount: 1, book: book(1) });
  assert.equal(nextDue(s, Date.now()), null);
  assert.equal(nextDue(s, Date.now() + 21 * 60 * 60 * 1000).mint, 'Mint1');
});
