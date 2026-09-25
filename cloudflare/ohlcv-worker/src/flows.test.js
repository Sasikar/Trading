import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netFlows, tradesFromTx } from './flows.js';

test('a buy is tokens arriving at the fee payer', () => {
  const rows = tradesFromTx({
    feePayer: 'USER',
    tokenTransfers: [
      { mint: 'M', tokenAmount: 1000, fromUserAccount: 'POOL', toUserAccount: 'USER' },
      { mint: 'OTHER', tokenAmount: 5, fromUserAccount: 'USER', toUserAccount: 'POOL' }
    ]
  }, 'M', 0.01);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].side, 'buy');
  assert.equal(rows[0].usd, 10);
});

test('whales net buy, fish net sell, and a two-sided wallet is MM', () => {
  const holders = [
    { owner: 'WHALE', tokens: 2000 },
    { owner: 'SHARK', tokens: 300 },
    { owner: 'DOLPHIN', tokens: 80 }
  ];
  const trades = [
    { wallet: 'WHALE', side: 'buy', usd: 37926 },
    { wallet: 'SHARK', side: 'buy', usd: 15345 },
    { wallet: 'DOLPHIN', side: 'sell', usd: 24871 },
    { wallet: 'SMALL', side: 'sell', usd: 31096 },
    { wallet: 'MAKER', side: 'buy', usd: 8000 },
    { wallet: 'MAKER', side: 'sell', usd: 5000 }
  ];
  const rows = netFlows(trades, holders, 10);
  const by = Object.fromEntries(rows.map((r) => [r.id, r.usd]));
  assert.equal(by.whale, 37926);
  assert.equal(by.shark, 15345);
  assert.equal(by.dolphin, -24871);
  assert.equal(by.fish, -31096);
  assert.equal(by.mm, 3000);
});
