import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFomoTop100, newMints, clusterBuys, signalOf, skipMint } from './fomo-wallets.js';

test('parse FOMO top100 data-h rows', () => {
  const html =
    '<tr data-h="unipcs" data-p="12496916" data-sol="2heJbC32Tpfcb3nbUb5ER61K11FGZVfVGtVnDm6LDogF" data-evm="0x0a6ebed0155edb4b21d92ad02897a626cd90119e" data-tw="theunipcs">' +
    '<tr data-h="x" data-p="1" data-sol="Abcdefghijklmnopqrstuvwxyz1234567890ABCD" data-evm="—">';
  const rows = parseFomoTop100(html);
  assert.equal(rows[0].handle, 'unipcs');
  assert.equal(rows[0].sol.slice(0, 4), '2heJ');
  assert.equal(rows[1].evm, '');
  assert.ok(rows[0].gmgnUrl.indexOf('/sol/address/') >= 0);
});

test('new mints ignore stables and prev snapshot', () => {
  assert.equal(skipMint('So11111111111111111111111111111111111111112'), true);
  const n = newMints(
    ['MintA', 'MintB'],
    [{ mint: 'MintA' }, { mint: 'MintC' }, { mint: 'So11111111111111111111111111111111111111112' }]
  );
  assert.deepEqual(n.map((x) => x.toLowerCase()), ['mintc']);
});

test('cluster buys and watchlist signal', () => {
  const c = clusterBuys([
    { mint: 'aa', handle: 'a', wallet: 'w1', at: 2 },
    { mint: 'aa', handle: 'b', wallet: 'w2', at: 3, saved: true, ew: 'NO_CHASE' }
  ]);
  assert.equal(c[0].handles.length, 2);
  assert.equal(signalOf(c[0]), 'WATCHLIST');
  assert.equal(signalOf({ wallets: ['1', '2', '3'] }), 'CLUSTER');
});
