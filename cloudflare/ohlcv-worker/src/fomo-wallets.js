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

export function holdMints(entry) {
  if (!entry) return [];
  if (Array.isArray(entry)) return entry;
  if (Array.isArray(entry.mints)) return entry.mints;
  return [];
}

export function coinsAndCommon(holdMap, leaders, buys) {
  const handleOf = {};
  const leaderOf = {};
  for (let i = 0; i < (leaders || []).length; i++) {
    const l = leaders[i];
    if (!l || !l.sol) continue;
    handleOf[l.sol] = l.handle || '';
    leaderOf[l.sol] = l;
  }
  const mintMap = new Map();
  function touch(mint, wallet, handle, extra) {
    const raw = mint || (extra && extra.mint);
    const k = String(raw || '').toLowerCase();
    if (!k || skipMint(k)) return;
    let c = mintMap.get(k);
    if (!c) {
      c = {
        mint: raw,
        handles: [],
        wallets: [],
        at: 0,
        name: '',
        liq: 0,
        volume: 0,
        mcap: 0,
        dexUrl: extra && extra.dexUrl ? extra.dexUrl : '',
        ew: '',
        caState: '',
        saved: false,
        fresh: false,
        shared: false
      };
      mintMap.set(k, c);
    }
    if (wallet && c.wallets.indexOf(wallet) < 0) c.wallets.push(wallet);
    if (handle && c.handles.indexOf(handle) < 0) c.handles.push(handle);
    if (extra) {
      if (extra.at && extra.at > c.at) c.at = extra.at;
      if (extra.name) c.name = extra.name;
      if (extra.liq) c.liq = extra.liq;
      if (extra.volume) c.volume = extra.volume;
      if (extra.mcap) c.mcap = extra.mcap;
      if (extra.dexUrl) c.dexUrl = extra.dexUrl;
      if (extra.ew) c.ew = extra.ew;
      if (extra.caState) c.caState = extra.caState;
      if (extra.saved) c.saved = true;
      if (extra.at) c.fresh = true;
    }
  }
  const keys = Object.keys(holdMap || {});
  for (let i = 0; i < keys.length; i++) {
    const wallet = keys[i];
    const mints = holdMints(holdMap[wallet]);
    const handle = handleOf[wallet] || '';
    for (let j = 0; j < mints.length; j++) touch(mints[j], wallet, handle, null);
  }
  const clustered = clusterBuys(buys);
  for (let i = 0; i < clustered.length; i++) {
    const b = clustered[i];
    const ws = b.wallets || [];
    if (!ws.length) touch(b.mint, '', (b.handles && b.handles[0]) || '', b);
    for (let j = 0; j < ws.length; j++) {
      touch(b.mint, ws[j], handleOf[ws[j]] || (b.handles && b.handles[j]) || '', b);
    }
  }
  const coins = Array.from(mintMap.values());
  for (let i = 0; i < coins.length; i++) coins[i].shared = (coins[i].wallets || []).length >= 2;
  coins.sort((a, b) => (b.shared ? 1 : 0) - (a.shared ? 1 : 0) || b.wallets.length - a.wallets.length || b.at - a.at);

  const stats = {};
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    for (let j = 0; j < (c.wallets || []).length; j++) {
      const w = c.wallets[j];
      if (!stats[w]) {
        const L = leaderOf[w] || {};
        stats[w] = {
          wallet: w,
          handle: handleOf[w] || L.handle || '',
          rank: L.rank || 0,
          pnl: L.pnl || 0,
          fomoUrl: L.fomoUrl || '',
          solscan: L.solscan || (w ? 'https://solscan.io/account/' + w : ''),
          gmgnUrl: L.gmgnUrl || (w ? 'https://gmgn.ai/sol/address/' + w : ''),
          n: 0,
          sharedN: 0,
          freshN: 0,
          coins: []
        };
      }
      stats[w].n++;
      if (c.shared) stats[w].sharedN++;
      if (c.fresh) stats[w].freshN++;
      stats[w].coins.push({ mint: c.mint, name: c.name, shared: c.shared, fresh: c.fresh, dexUrl: c.dexUrl });
    }
  }
  const common = Object.values(stats).sort((a, b) => b.sharedN - a.sharedN || b.freshN - a.freshN || b.n - a.n);
  const listed = coins.filter((c) => c.shared || c.fresh).slice(0, 80);
  return {
    coins: listed.length ? listed : coins.slice(0, 40),
    common: common.filter((w) => w.sharedN >= 1 || w.freshN >= 1 || w.n >= 4).slice(0, 12)
  };
}
