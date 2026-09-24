import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSwap, readSwapRows, rankWallets } from './move.js';

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

test('swap event input is a sell by that wallet', () => {
  const rows = readSwapRows({
    feePayer: 'Router',
    timestamp: 10,
    events: {
      swap: {
        tokenInputs: [{ mint: 'Mint', userAccount: 'Seller', rawTokenAmount: { tokenAmount: '2000000', decimals: 6 } }],
        tokenOutputs: [{ mint: 'Mint', userAccount: 'Buyer', rawTokenAmount: { tokenAmount: '1000000', decimals: 6 } }]
      }
    }
  }, 'Mint', 2, 'Pool');
  assert.equal(rows[0].side, 'sell');
  assert.equal(rows[0].wallet, 'Seller');
  assert.equal(rows[0].usd, 4);
  assert.equal(rows[1].side, 'buy');
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
