/** FOMO wallet tracker. No official public API — leaders from the public top-100 page. */
export const FOMO_HOLD_MS = 30 * 60e3;
export const FOMO_LEADERS_MS = 6 * 3600e3;
export const FOMO_MIN_GAP_MS = 5 * 60e3;
export const FOMO_TOP100 = 'https://fomoapi.io/top100';
export const FOMO_API = 'https://api.fomoapi.io';
export const SOL_RPC = 'https://api.mainnet-beta.solana.com';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const SKIP_MINT = new Set([
  'so11111111111111111111111111111111111111112',
  'epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v',
  'es9vmfrzacermjfrf4h2fyd4kconky11mcce8benwnyb',
  'usd1ttk2fx1eqezrpkz8md9wfvaqvygm6cg3w5sj',
  'ekjqqd7r6gnv6ccauhu3nfux4pqhqgs6p9f6qeqkpump'
]);

export function parseFomoTop100(html) {
  const re =
    /<tr data-h="([^"]*)" data-p="([^"]*)" data-sol="([^"]*)" data-evm="([^"]*)"(?: data-tw="([^"]*)")?/g;
  const out = [];
  let m;
  let rank = 0;
  while ((m = re.exec(String(html || '')))) {
    rank++;
    const handle = m[1];
    const sol = m[3] && m[3] !== '—' ? m[3] : '';
    const evm = m[4] && m[4] !== '—' ? m[4] : '';
    out.push({
      rank,
      handle,
      pnl: +m[2] || 0,
      sol,
      evm,
      tw: m[5] || '',
      fomoUrl: 'https://fomo.family/profile/' + handle,
      solscan: sol ? 'https://solscan.io/account/' + sol : '',
      gmgnUrl: sol ? 'https://gmgn.ai/sol/address/' + sol : ''
    });
  }
  return out;
}

export function slimFomoApiTrader(t, rank) {
  const w = (t && t.wallets) || {};
  const handle = (t && (t.handle || t.userHandle)) || '';
  const sol = w.solana || t.solana || t.sol || '';
  const evm = w.evm || t.evmAddress || t.evm || '';
  return {
    rank: rank || +(t && t.rank) || 0,
    handle,
    pnl: +(t && (t.pnlUsd || t.pnl_usd || t.pnl24h || t.pnl)) || 0,
    volume: +(t && (t.volumeUsd || t.volume)) || 0,
    trades: +(t && (t.trades || t.numTrades)) || 0,
    sol,
    evm,
    tw: (t && t.twitter) || '',
    fomoUrl: handle ? 'https://fomo.family/profile/' + handle : '',
    solscan: sol ? 'https://solscan.io/account/' + sol : '',
    gmgnUrl: sol ? 'https://gmgn.ai/sol/address/' + sol : ''
  };
}

export function skipMint(mint) {
  return SKIP_MINT.has(String(mint || '').toLowerCase());
}

export function mintsFromTokenAccounts(rpcJson) {
  const vals = ((rpcJson && rpcJson.result) || {}).value || [];
  const out = [];
  for (let i = 0; i < vals.length; i++) {
    const info = vals[i] && vals[i].account && vals[i].account.data && vals[i].account.data.parsed && vals[i].account.data.parsed.info;
    if (!info) continue;
    const mint = info.mint;
    const amt = +((info.tokenAmount && info.tokenAmount.uiAmount) || 0);
    if (!mint || skipMint(mint) || !(amt > 0)) continue;
    out.push({ mint, amount: amt });
  }
  return out;
}

export function newMints(prevMints, nowMints) {
  const p = new Set((prevMints || []).map((x) => String(x).toLowerCase()));
  const seen = new Set();
  const out = [];
  for (let i = 0; i < (nowMints || []).length; i++) {
    const m = String((nowMints[i] && nowMints[i].mint) || nowMints[i] || '').toLowerCase();
    if (!m || p.has(m) || seen.has(m) || skipMint(m)) continue;
    seen.add(m);
    out.push(nowMints[i].mint || m);
  }
  return out;
}

export function clusterBuys(rows) {
  const map = new Map();
  for (let i = 0; i < (rows || []).length; i++) {
    const r = rows[i];
    const k = String(r.mint || '').toLowerCase();
    if (!k) continue;
    let c = map.get(k);
    if (!c) {
      c = {
        mint: r.mint,
        handles: [],
        wallets: [],
        at: r.at || 0,
        name: r.name || '',
        liq: r.liq || 0,
        volume: r.volume || 0,
        mcap: r.mcap || 0,
        dexUrl: r.dexUrl || '',
        ew: r.ew || '',
        caState: r.caState || '',
        saved: !!r.saved
      };
      map.set(k, c);
    }
    if (r.handle && c.handles.indexOf(r.handle) < 0) c.handles.push(r.handle);
    if (r.wallet && c.wallets.indexOf(r.wallet) < 0) c.wallets.push(r.wallet);
    if (r.at && r.at > c.at) c.at = r.at;
    if (r.liq) c.liq = r.liq;
    if (r.volume) c.volume = r.volume;
    if (r.mcap) c.mcap = r.mcap;
    if (r.name) c.name = r.name;
    if (r.dexUrl) c.dexUrl = r.dexUrl;
    if (r.ew) c.ew = r.ew;
    if (r.caState) c.caState = r.caState;
    if (r.saved) c.saved = true;
  }
  return Array.from(map.values()).sort((a, b) => b.wallets.length - a.wallets.length || b.at - a.at);
}

export function signalOf(buy) {
  if (buy && buy.saved) return 'WATCHLIST';
  if (buy && (buy.wallets || []).length >= 3) return 'CLUSTER';
  if (buy && (buy.wallets || []).length >= 2) return 'OVERLAP';
  return '';
}
