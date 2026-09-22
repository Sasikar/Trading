import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buysFromHeliusTx, netSol, stableSpent, scoreCoins } from './helius-coins.js';

const BUYER = 'BuyerWallet1111111111111111111111111111111';
const MINT = 'TokenMint111111111111111111111111111111111';

test('net SOL is native out minus native in', () => {
  const sol = netSol(
    {
      nativeTransfers: [
        { fromUserAccount: BUYER, toUserAccount: 'pump', amount: 2e9 },
        { fromUserAccount: 'pump', toUserAccount: BUYER, amount: 0.4e9 }
      ]
    },
    BUYER
  );
  assert.equal(sol, 1.6);
});

test('swap.nativeInput wins when present', () => {
  const sol = netSol(
    {
      events: { swap: { nativeInput: { account: BUYER, amount: '500000000' } } },
      nativeTransfers: [{ fromUserAccount: BUYER, toUserAccount: 'x', amount: 9e9 }]
    },
    BUYER
  );
  assert.equal(sol, 0.5);
});

test('USDC spent on the buy', () => {
  const usd = stableSpent(
    {
      tokenTransfers: [
        {
          fromUserAccount: BUYER,
          toUserAccount: 'pool',
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          tokenAmount: { uiAmount: 250 }
        }
      ]
    },
    BUYER
  );
  assert.equal(usd, 250);
});

test('buy row carries SOL ape split across mints in the same tx', () => {
  const watch = new Map([[BUYER, { handle: 'og', sol: BUYER }]]);
  const rows = buysFromHeliusTx(
    {
      signature: 'sig1',
      timestamp: 1700000000,
      nativeTransfers: [{ fromUserAccount: BUYER, toUserAccount: 'pump', amount: 3e9 }],
      tokenTransfers: [
        {
          toUserAccount: BUYER,
          fromUserAccount: 'pump',
          mint: MINT,
          tokenAmount: { uiAmount: 1000 },
          symbol: 'APE'
        },
        {
          toUserAccount: BUYER,
          fromUserAccount: 'pump',
          mint: 'OtherMint11111111111111111111111111111111',
          tokenAmount: { uiAmount: 50 },
          symbol: 'TWO'
        }
      ]
    },
    watch
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].side, 'buy');
  assert.equal(rows[0].handle, 'og');
  assert.equal(rows[0].sol, 1.5);
  assert.equal(rows[1].sol, 1.5);
  assert.equal(rows[0].amount, 1000);
});

test('scoreCoins sums ape per wallet', () => {
  const coins = scoreCoins([
    { mint: MINT, wallet: 'w1', handle: 'a', sol: 1.2, amount: 10, at: 2 },
    { mint: MINT, wallet: 'w1', handle: 'a', sol: 0.8, amount: 5, at: 3 },
    { mint: MINT, wallet: 'w2', handle: 'b', usdc: 40, amount: 1, at: 4 }
  ]);
  assert.equal(coins[0].wallets.length, 2);
  const ape1 = coins[0].apes.find((x) => x.wallet === 'w1');
  const ape2 = coins[0].apes.find((x) => x.wallet === 'w2');
  assert.equal(ape1.sol, 2);
  assert.equal(ape1.tokens, 15);
  assert.equal(ape2.usdc, 40);
});
