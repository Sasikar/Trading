import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeMint, pickSolMint, pickEnds, buysInTx } from './helius-lookup.js';

test('looksLikeMint', () => {
  assert.equal(looksLikeMint('So11111111111111111111111111111111111111112'), true);
  assert.equal(looksLikeMint('MONK'), false);
  assert.equal(looksLikeMint('$MONK'), false);
});

test('pickSolMint prefers exact Solana symbol', () => {
  const hit = pickSolMint(
    [
      { chainId: 'solana', baseToken: { address: 'mintA', symbol: 'MONK', name: 'Monk' }, liquidity: { usd: 10 } },
      { chainId: 'solana', baseToken: { address: 'mintB', symbol: 'MONKEY', name: 'x' }, liquidity: { usd: 9e9 } },
      { chainId: 'ethereum', baseToken: { address: '0x', symbol: 'MONK', name: 'Monk' }, liquidity: { usd: 9e9 } }
    ],
    'monk'
  );
  assert.equal(hit.mint, 'mintA');
});

test('pickEnds newest + oldest', () => {
  const s = [];
  for (let i = 0; i < 20; i++) s.push('s' + i);
  const e = pickEnds(s, 3);
  assert.deepEqual(e, ['s0', 's1', 's2', 's17', 's18', 's19']);
});

test('buysInTx inbound mint only', () => {
  const wallet = 'Buyer111';
  const mint = 'TokenMint111';
  const hits = buysInTx(
    {
      signature: 'sig9',
      timestamp: 1700000000,
      tokenTransfers: [
        { mint, toUserAccount: wallet, fromUserAccount: 'pool', tokenAmount: { uiAmount: 50 } },
        { mint, toUserAccount: 'other', fromUserAccount: wallet, tokenAmount: { uiAmount: 9 } }
      ],
      nativeTransfers: [{ fromUserAccount: wallet, toUserAccount: 'pool', amount: 2e9 }]
    },
    wallet,
    mint
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].amount, 50);
  assert.equal(hits[0].at, 1700000000000);
  assert.equal(hits[0].sol, 2);
});
