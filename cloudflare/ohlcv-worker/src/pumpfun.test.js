import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passMovers, slimPump } from './pumpfun.js';

test('movers filter matches the video rules we can see', () => {
  const now = 1_000_000_000_000;
  const ok = slimPump({
    mint: 'mint1',
    name: 'Penginu',
    symbol: 'Penginu',
    usd_market_cap: 47000,
    created_timestamp: now - 11 * 60000,
    twitter: 'https://x.com/x',
    website: '',
    telegram: ''
  });
  assert.equal(passMovers(ok, { maxMc: 150000, maxAge: 60, twitter: true, social: true }, now), true);
  assert.equal(passMovers(ok, { maxMc: 10000, maxAge: 60, twitter: true, social: true }, now), false);
  const tiny = Object.assign({}, ok, { mc: 4200 });
  assert.equal(passMovers(tiny, { maxMc: 150000, maxAge: 60, twitter: true, social: true }, now), false);
  const tooBig = Object.assign({}, ok, { mc: 488000 });
  assert.equal(passMovers(tooBig, { maxMc: 150000, maxAge: 60, twitter: true, social: true }, now), false);
  const old = Object.assign({}, ok, { created: now - 90 * 60000 });
  assert.equal(passMovers(old, { maxMc: 150000, maxAge: 60, twitter: true, social: true }, now), false);
  const bare = Object.assign({}, ok, { twitter: '' });
  assert.equal(passMovers(bare, { maxMc: 150000, maxAge: 60, twitter: true, social: true }, now), false);
});
