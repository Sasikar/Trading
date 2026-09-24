import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSwap, rankWallets } from './move.js';

test('a wallet sending the mint is a sell', () => {
  const row = readSwap({
    feePayer: 'WalletA',
    timestamp: 10,
    tokenTransfers: [
      { mint: 'Mint', tokenAmount: 1000, fromUserAccount: 'WalletA', toUserAccount: 'Pool' }
    ]
  }, 'Mint', 0.5);
  assert.equal(row.side, 'sell');
  assert.equal(row.usd, 500);
});

test('ranks the biggest seller', () => {
  const ranked = rankWallets([
    { wallet: 'A', side: 'sell', usd: 10, tokens: 1 },
    { wallet: 'A', side: 'sell', usd: 40, tokens: 1 },
    { wallet: 'B', side: 'buy', usd: 25, tokens: 1 }
  ]);
  assert.equal(ranked.sellers[0].wallet, 'A');
  assert.equal(ranked.sellers[0].usd, 50);
  assert.equal(ranked.buyers[0].wallet, 'B');
});
