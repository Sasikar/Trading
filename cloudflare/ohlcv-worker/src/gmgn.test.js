import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gmgnQualityPass, pickGmgnList, unwrapGmgnHot, unwrapGmgnRank, slimGmgnToken } from './gmgn.js';

test('quality filter keeps volume+liq names and drops stables', () => {
  assert.equal(
    gmgnQualityPass({ symbol: 'USELESS', liquidity: 5e6, volume: 2e6, market_cap: 2e8, holder_count: 6000, top_10_holder_rate: 0.2 }),
    true
  );
  assert.equal(gmgnQualityPass({ symbol: 'SOL', liquidity: 9e9, volume: 9e9, market_cap: 9e9, holder_count: 9e6 }), false);
  assert.equal(gmgnQualityPass({ symbol: 'RUG', liquidity: 2000, volume: 9e6, market_cap: 9e6, holder_count: 12 }), false);
});

test('pickGmgnList sorts by volume and slims', () => {
  const raw = [
    { address: 'a', symbol: 'LOW', chain: 'sol', liquidity: 1e5, volume: 9e4, market_cap: 2e5, holder_count: 400 },
    { address: 'b', symbol: 'HIGH', chain: 'sol', liquidity: 2e5, volume: 9e5, market_cap: 3e6, holder_count: 900 }
  ];
  const out = pickGmgnList(raw, 'volume', 10);
  assert.equal(out[0].name, 'HIGH');
  assert.equal(out[0].gmgnUrl, 'https://gmgn.ai/sol/token/b');
});

test('unwrap nested rank and hot blocks', () => {
  const rank = unwrapGmgnRank({ code: 0, data: { code: 0, data: { rank: [{ symbol: 'A' }] } } });
  assert.equal(rank[0].symbol, 'A');
  const hot = unwrapGmgnHot({ code: 0, data: [{ interval: '1h', chain: 'sol', tokens: [{ symbol: 'B' }] }] });
  assert.equal(hot[0].symbol, 'B');
  assert.equal(slimGmgnToken({ chain: 'sol', address: 'x', symbol: 'Z' }).dexUrl.indexOf('dexscreener.com/solana/x') >= 0, true);
});
