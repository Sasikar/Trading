/**
 * API-only Worker. Does NOT host GitHub Pages. No login gate.
 * GitHub Pages (sasikar.github.io/Trading) GETs this for breakout cards.
 */
import { Engine, MemoryStore, handleApi, CORS, json, AUTO_EVERY_MS } from './engine.js';
import { coinsAndCommon } from './fomo-wallets.js';

const _snapshotWallets = Engine.prototype.snapshotWallets;
Engine.prototype.snapshotWallets = function snapshotWalletsWithCommon() {
  const snap = _snapshotWallets.call(this) || {};
  let holdMap = {};
  try {
    holdMap = JSON.parse(this.store.getMeta('fomo_hold') || '{}') || {};
  } catch (e) {
    holdMap = {};
  }
  const extra = coinsAndCommon(holdMap, snap.leaders || [], snap.buys || []);
  snap.coins = extra.coins || [];
  snap.common = extra.common || [];
  snap.note =
    'FOMO top wallets. Leaders = public top-100. Coins = new buys + tokens 2+ scanned wallets still hold. Common = those overlapping wallets as observe tabs. Not a buy list.';
  return snap;
};
