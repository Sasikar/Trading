/** Daily bag scan → Old Coins. 5+ holders, MC >= $1M. Not a buy list. */
import { skipMint } from './fomo-wallets.js';

export const OLD_COINS_KEY = 'old_coins';
export const OLD_SCAN_AT_KEY = 'old_coins_at';
export const OLD_CURSOR_KEY = 'old_coins_cursor';
export const OLD_HOLD_KEY = 'old_hold_partial';
const DAY_MS = 24 * 3600e3;
const MIN_HOLD = 5;
const MIN_MC = 1e6;
const PER_TICK = 8;

function heliusUrl(env) {
  const k = env && env.HELIUS_API_KEY;
  return k ? 'https://mainnet.helius-rpc.com/?api-key=' + k : '';
}

export function parseDasAssets(json) {
  const items = (json && json.result && json.result.items) || [];
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const mint = it.id || (it.token_info && it.token_info.mint) || '';
    if (!mint || skipMint(mint)) continue;
    const iface = String(it.interface || '');
    const isTok = /fungible/i.test(iface) || !!(it.token_info && it.token_info.decimals != null);
    if (!isTok) continue;
    const raw = +((it.token_info && (it.token_info.balance || it.token_info.amount)) || 0);
    if (!(raw > 0)) continue;
    const symbol =
      (it.content && it.content.metadata && (it.content.metadata.symbol || it.content.metadata.name)) ||
      (it.token_info && it.token_info.symbol) ||
      '';
    out.push({ mint, symbol });
  }
  return out;
}

export async function assetsByOwner(env, owner) {
  const url = heliusUrl(env);
  if (!url || !owner) return [];
  const body = {
    jsonrpc: '2.0',
    id: 'old',
    method: 'getAssetsByOwner',
    params: {
      ownerAddress: owner,
      page: 1,
      limit: 1000,
      displayOptions: { showFungible: true, showNativeBalance: false }
    }
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  return parseDasAssets(j);
}

export function clusterHolds(holdMap, leaders) {
  const handleOf = {};
  for (const l of leaders || []) if (l && l.sol) handleOf[l.sol] = l.handle || '';
  const byMint = {};
  const wallets = Object.keys(holdMap || {});
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const mints = holdMap[w] || [];
    for (let j = 0; j < mints.length; j++) {
      const mint = mints[j].mint || mints[j];
      const symbol = mints[j].symbol || '';
      if (!mint) continue;
      if (!byMint[mint]) byMint[mint] = { mint, wallets: [], handles: [], name: symbol, symbol, dexUrl: 'https://dexscreener.com/solana/' + mint };
      if (byMint[mint].wallets.indexOf(w) < 0) {
        byMint[mint].wallets.push(w);
        byMint[mint].handles.push(handleOf[w] || '');
      }
      if (symbol) byMint[mint].name = symbol;
    }
  }
  return Object.keys(byMint)
    .map((k) => {
      const c = byMint[k];
      c.score = c.wallets.length;
      return c;
    })
    .filter((c) => c.score >= MIN_HOLD)
    .sort((a, b) => b.score - a.score);
}

export async function enrichMcap(coins) {
  const out = [];
  for (let i = 0; i < (coins || []).length; i += 25) {
    const chunk = coins.slice(i, i + 25);
    const ids = chunk.map((c) => c.mint).join(',');
    try {
      const r = await fetch('https://api.dexscreener.com/tokens/v1/solana/' + ids);
      const arr = await r.json();
      const best = {};
      const list = Array.isArray(arr) ? arr : [];
      for (let j = 0; j < list.length; j++) {
        const p = list[j] || {};
        const mint = (p.baseToken && p.baseToken.address) || '';
        const mcap = +p.marketCap || +p.fdv || 0;
        const symbol = (p.baseToken && (p.baseToken.symbol || p.baseToken.name)) || '';
        if (!mint) continue;
        if (!best[mint] || mcap > best[mint].mcap) best[mint] = { mcap, symbol };
      }
      for (let k = 0; k < chunk.length; k++) {
        const c = chunk[k];
        const x = best[c.mint] || {};
        const mcap = x.mcap || 0;
        if (mcap < MIN_MC) continue;
        out.push(Object.assign({}, c, { mcap, name: x.symbol || c.name || '', symbol: x.symbol || c.symbol || '' }));
      }
    } catch (e) {}
  }
  return out.sort((a, b) => b.score - a.score || b.mcap - a.mcap);
}

export async function scanOldTick(env, store, leaders) {
  const now = Date.now();
  const last = +store.getMeta(OLD_SCAN_AT_KEY) || 0;
  let cursor = +store.getMeta(OLD_CURSOR_KEY) || 0;
  let hold = {};
  try {
    hold = JSON.parse(store.getMeta(OLD_HOLD_KEY) || '{}') || {};
  } catch (e) {
    hold = {};
  }
  const sols = (leaders || []).filter((l) => l && l.sol);
  if (!sols.length) return { ok: false, error: 'no leaders' };
  if (cursor === 0 && last && now - last < DAY_MS && store.getMeta(OLD_COINS_KEY)) {
    return { ok: true, skipped: true, at: last };
  }
  const slice = sols.slice(cursor, cursor + PER_TICK);
  for (let i = 0; i < slice.length; i++) {
    const w = slice[i].sol;
    try {
      hold[w] = await assetsByOwner(env, w);
    } catch (e) {
      hold[w] = hold[w] || [];
    }
  }
  cursor += slice.length;
  store.setMeta(OLD_HOLD_KEY, JSON.stringify(hold));
  if (cursor < sols.length) {
    store.setMeta(OLD_CURSOR_KEY, String(cursor));
    return { ok: true, progress: cursor, total: sols.length };
  }
  const clustered = clusterHolds(hold, sols);
  const coins = await enrichMcap(clustered);
  store.setMeta(OLD_COINS_KEY, JSON.stringify(coins));
  store.setMeta(OLD_SCAN_AT_KEY, String(now));
  store.setMeta(OLD_CURSOR_KEY, '0');
  store.setMeta(OLD_HOLD_KEY, '{}');
  return { ok: true, done: true, coins: coins.length, wallets: sols.length, at: now };
}

export function readOldCoins(store) {
  try {
    return JSON.parse(store.getMeta(OLD_COINS_KEY) || '[]') || [];
  } catch (e) {
    return [];
  }
}
