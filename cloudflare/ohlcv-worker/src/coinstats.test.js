import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdingsFromDas, historyRows, labelHistory, writeWallets, readWallets } from './coinstats.js';

test('holdings keep priced tokens and native sol', () => {
  const out = holdingsFromDas({
    result: {
      nativeBalance: { lamports: 2e9, price_per_sol: 150, total_price: 300 },
      items: [
        { id: 'MINT', interface: 'FungibleToken', token_info: { symbol: 'JEAN', balance: 1000000, decimals: 6, price_info: { price_per_token: 2, total_price: 2 } } },
        { id: 'DUST', interface: 'FungibleToken', token_info: { symbol: 'SPAM', balance: 10, decimals: 0, price_info: { total_price: 0.1 } } }
      ]
    }
  });
  assert.equal(out.rows.length, 2);
  assert.equal(out.rows[0].symbol, 'SOL');
  assert.equal(out.rows[1].symbol, 'JEAN');
  assert.equal(out.total, 302);
});

test('history keeps the last week and knows in from out', () => {
  const now = Date.now();
  const rows = historyRows([
    {
      timestamp: Math.floor(now / 1000) - 3600,
      type: 'SWAP',
      signature: 'SIG',
      source: 'JUPITER',
      tokenTransfers: [{ tokenSymbol: 'JEAN', tokenAmount: 5, toUserAccount: 'ME', fromUserAccount: 'POOL' }]
    },
    {
      timestamp: Math.floor((now - 8 * 24 * 3600 * 1000) / 1000),
      tokenTransfers: [{ tokenSymbol: 'OLD', tokenAmount: 1, toUserAccount: 'ME', fromUserAccount: 'POOL' }]
    }
  ], 'ME', now - 7 * 24 * 3600 * 1000);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].side, 'in');
  assert.equal(rows[0].token, 'JEAN');
});

test('history uses the holding name so a search can find it', () => {
  const rows = labelHistory(
    [{ token: 'GTBxUiw6wJdmmkCGZgRHLyYxqu1vG4KtRpeox6yDpump', amount: 10, side: 'in' }],
    [{ mint: 'GTBxUiw6wJdmmkCGZgRHLyYxqu1vG4KtRpeox6yDpump', symbol: 'JEANPHIL', price: 0.004 }]
  );
  assert.equal(rows[0].token, 'JEANPHIL');
  assert.equal(rows[0].usd, 0.04);
});

test('wallets add without duplicates', () => {
  const bag = {};
  const store = {
    getMeta() { return bag.v || '[]'; },
    setMeta(_k, v) { bag.v = v; }
  };
  const a = writeWallets(store, [{ address: 'not-a-wallet' }]);
  assert.equal(a.length, 0);
  const addr = '5sAQ111111111111111111111111111111111k5qe';
  writeWallets(store, [{ address: addr }, { address: addr }]);
  assert.equal(readWallets(store).length, 1);
});
