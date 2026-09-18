import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OMG_KEEP_MS, upsertOmgLog, pruneOmgLog } from './engine.js';

const CA = 'omgcoinxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxpump';

test('parabolic upserts merge inside 6h then new row later', () => {
  const t0 = 1_800_000_000_000;
  let list = [];
  list = upsertOmgLog(list, { k: CA + '|parab', kind: 'PARABOLIC', h1: 12, m5: 11, at: t0 }, t0);
  list = upsertOmgLog(list, { k: CA + '|parab', kind: 'PARABOLIC', h1: 40, m5: 18, at: t0 + 3600e3 }, t0 + 3600e3);
  assert.equal(list.length, 1);
  assert.equal(list[0].n, 2);
  assert.equal(list[0].peakH1, 40);
  list = upsertOmgLog(
    list,
    { k: CA + '|parab', kind: 'PARABOLIC', h1: 15, m5: 10, at: t0 + 7 * 3600e3 },
    t0 + 7 * 3600e3
  );
  assert.equal(list.length, 2);
});

test('wow dip and parabolic are separate entries', () => {
  const t0 = 1_800_000_000_000;
  let list = upsertOmgLog([], { k: CA + '|parab', kind: 'PARABOLIC', h1: 20, at: t0 }, t0);
  list = upsertOmgLog(list, { k: CA + '|crash|SEVERE', kind: 'WOWDIP', h1: -31, at: t0 }, t0);
  assert.equal(list.length, 2);
});

test('rows older than 7 days are dropped', () => {
  const now = 1_800_000_000_000;
  const old = { k: 'x|parab', kind: 'PARABOLIC', at: now - OMG_KEEP_MS - 1000 };
  const keep = { k: 'y|parab', kind: 'PARABOLIC', at: now - 2 * 86400e3 };
  const out = pruneOmgLog([old, keep], now);
  assert.equal(out.length, 1);
  assert.equal(out[0].k, 'y|parab');
});
