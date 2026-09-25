const KEY = 'coinstats_wallets';
const MAX = 80;
const WEEK = 7 * 24 * 60 * 60 * 1000;

function valid(address) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address || '');
}

export function readWallets(store) {
  try {
    const parsed = JSON.parse(store.getMeta(KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export function writeWallets(store, list) {
  const clean = [];
  (list || []).forEach((row) => {
    const address = String((row && row.address) || row || '').trim();
    if (!valid(address) || clean.some((item) => item.address === address)) return;
    clean.push({
      address: address,
      label: String((row && row.label) || '').slice(0, 32),
      at: (row && row.at) || Date.now(),
      manual: !!(row && row.manual),
      mints: Array.isArray(row && row.mints) ? row.mints.map(String).filter(valid).slice(0, 20) : []
    });
  });
  const kept = clean.slice(0, MAX);
  store.setMeta(KEY, JSON.stringify(kept));
  return kept;
}

const CHART_KEY = 'cs_hour_chart';

export function readChart(store, mint) {
  try {
    const all = JSON.parse(store.getMeta(CHART_KEY) || '{}');
    const series = all && all[mint];
    return Array.isArray(series) ? series : [];
  } catch (e) {
    return [];
  }
}

export function writeChartPoint(store, mint, point) {
  if (!valid(mint)) throw new Error('That coin is missing.');
  const hour = String((point && (point.hour || point.day)) || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hour)) throw new Error('Bad hour.');
  let all = {};
  try { all = JSON.parse(store.getMeta(CHART_KEY) || '{}') || {}; } catch (e) { all = {}; }
  const series = (Array.isArray(all[mint]) ? all[mint] : []).filter((row) => row && row.hour !== hour);
  series.push({
    hour: hour,
    total: Number(point.total) || 0,
    coin: Number(point.coin) || 0,
    at: Date.now()
  });
  series.sort((a, b) => (a.hour < b.hour ? -1 : 1));
  all[mint] = series.slice(-24);
  const keys = Object.keys(all);
  if (keys.length > 40) keys.slice(0, keys.length - 40).forEach((key) => { delete all[key]; });
  store.setMeta(CHART_KEY, JSON.stringify(all));
  return all[mint];
}

export function holdingsFromDas(json) {
  const result = (json && json.result) || {};
  const rows = [];
  const native = result.nativeBalance || {};
  const sol = (Number(native.lamports) || 0) / 1e9;
  const solPrice = Number(native.price_per_sol) || 0;
  const solValue = Number(native.total_price) || sol * solPrice;
  if (sol >= 0.001 && solValue >= 1) {
    rows.push({ mint: 'SOL', symbol: 'SOL', amount: sol, price: solPrice, value: solValue });
  }
  (result.items || []).forEach((item) => {
    const info = (item && item.token_info) || {};
    const decimals = Number(info.decimals);
    const raw = Number(info.balance != null ? info.balance : info.amount);
    if (!(raw > 0) || !(decimals >= 0)) return;
    const face = String(item.interface || '');
    if (face && !/fungible/i.test(face)) return;
    const amount = raw / Math.pow(10, decimals);
    const price = Number(info.price_info && info.price_info.price_per_token) || 0;
    const value = Number(info.price_info && info.price_info.total_price) || amount * price;
    if (!(value >= 1)) return;
    const meta = item.content && item.content.metadata;
    const symbol = info.symbol || (meta && (meta.symbol || meta.name)) || String(item.id || '').slice(0, 4);
    rows.push({ mint: item.id || '', symbol: symbol, amount: amount, price: price, value: value });
  });
  rows.sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return { total: total, rows: rows.slice(0, 80) };
}

export function historyRows(txs, wallet, since) {
  const rows = [];
  (txs || []).forEach((tx) => {
    const at = (tx.timestamp || 0) * 1000;
    if (!at || at < since) return;
    (tx.tokenTransfers || []).forEach((move) => {
      if (!move || (move.toUserAccount !== wallet && move.fromUserAccount !== wallet)) return;
      const amount = Math.abs(Number(move.tokenAmount) || 0);
      if (!(amount > 0)) return;
      rows.push({
        at: at,
        type: tx.type || '',
        signature: tx.signature || '',
        token: move.tokenSymbol || move.mint || '',
        side: move.toUserAccount === wallet ? 'in' : 'out',
        amount: amount,
        source: tx.source || ''
      });
    });
    (tx.nativeTransfers || []).forEach((move) => {
      if (!move || (move.toUserAccount !== wallet && move.fromUserAccount !== wallet)) return;
      const lamports = Math.abs(Number(move.amount) || 0);
      if (lamports < 1e7) return;
      rows.push({
        at: at,
        type: tx.type || '',
        signature: tx.signature || '',
        token: 'SOL',
        side: move.toUserAccount === wallet ? 'in' : 'out',
        amount: lamports / 1e9,
        source: tx.source || ''
      });
    });
  });
  rows.sort((a, b) => b.at - a.at);
  return rows.slice(0, 400);
}

const NAMES = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT',
  So11111111111111111111111111111111111111112: 'SOL'
};

export function labelHistory(rows, holdings) {
  const name = Object.assign({}, NAMES);
  const price = { SOL: 0 };
  (holdings || []).forEach((row) => {
    if (row.mint && row.symbol) name[row.mint] = row.symbol;
    if (row.mint && row.price) price[row.mint] = row.price;
    if (row.symbol === 'SOL' && row.price) price.SOL = row.price;
  });
  return (rows || []).map((row) => {
    const mint = row.token || '';
    const symbol = name[mint] || mint;
    const px = price[mint] || (symbol === 'SOL' ? price.SOL : 0) || 0;
    return Object.assign({}, row, {
      token: symbol,
      mint: name[mint] ? mint : '',
      usd: px ? Math.abs(row.amount) * px : 0
    });
  });
}

async function rpc(key, method, params) {
  const res = await fetch('https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params }),
    signal: AbortSignal.timeout(20000)
  });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error('Wallet read failed');
  return body;
}

async function recentTxs(key, wallet, since) {
  const txs = [];
  let before = '';
  let truncated = false;
  for (let page = 0; page < 6; page++) {
    let url = 'https://api.helius.xyz/v0/addresses/' + encodeURIComponent(wallet) + '/transactions?api-key=' + encodeURIComponent(key) + '&limit=100';
    if (before) url += '&before=' + encodeURIComponent(before);
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) break;
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || !rows.length) break;
    let old = false;
    rows.forEach((tx) => {
      const at = (tx.timestamp || 0) * 1000;
      if (at && at < since) old = true;
      else txs.push(tx);
    });
    before = rows[rows.length - 1] && rows[rows.length - 1].signature;
    if (old || !before) break;
    if (page === 5) truncated = true;
  }
  return { txs: txs, truncated: truncated };
}

async function priceHoldings(rows) {
  const sol = 'So11111111111111111111111111111111111111112';
  const ids = rows.map((row) => (row.mint === 'SOL' ? sol : row.mint)).filter(Boolean).slice(0, 50);
  if (!ids.length) return rows;
  try {
    const res = await fetch('https://lite-api.jup.ag/price/v3?ids=' + ids.join(','), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return rows;
    const prices = await res.json();
    return rows.map((row) => {
      const key = row.mint === 'SOL' ? sol : row.mint;
      const px = Number(prices && prices[key] && prices[key].usdPrice);
      if (!(px > 0)) return row;
      return Object.assign({}, row, { price: px, value: row.amount * px });
    });
  } catch (e) {
    return rows;
  }
}

export async function scanWallet(env, wallet) {
  if (!valid(wallet)) throw new Error('Paste a Solana wallet address.');
  const key = env && env.HELIUS_API_KEY;
  if (!key) throw new Error('Helius key is missing on the worker.');
  const since = Date.now() - WEEK;
  const [das, book] = await Promise.all([
    rpc(key, 'getAssetsByOwner', {
      ownerAddress: wallet,
      page: 1,
      limit: 1000,
      displayOptions: { showFungible: true, showNativeBalance: true }
    }),
    recentTxs(key, wallet, since)
  ]);
  const held = holdingsFromDas(das);
  const rows = await priceHoldings(held.rows);
  const total = rows.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
  return {
    wallet: wallet,
    total: total,
    holdings: rows,
    history: labelHistory(historyRows(book.txs, wallet, since), rows),
    truncated: book.truncated
  };
}

const SNAP_KEY = 'cs_hold_snap';
const SELL_GAP = 10 * 60 * 1000;

function readSnaps(store) {
  try {
    const parsed = JSON.parse(store.getMeta(SNAP_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function sellLine(row) {
  const holding = row.holding || 0;
  const total = row.score || 0;
  const name = row.name || 'This coin';
  return name + '. ' + holding + ' of ' + total + ' still holding.';
}

export function judgeSells(before, balances, wallets) {
  const sold = [];
  let holding = 0;
  (wallets || []).forEach((wallet) => {
    const now = Number(balances && balances[wallet]) || 0;
    const prev = before && before[wallet];
    if (now > 0) holding += 1;
    if (prev > 0 && now < prev * 0.995) sold.push(wallet);
  });
  return { score: (wallets || []).length, sold: sold.length, holding: holding, soldWallets: sold };
}

export function applySnap(store, mint, wallets, balances, now) {
  const all = readSnaps(store);
  const prev = all[mint];
  const hadBaseline = !!(prev && prev.balances);
  const judged = judgeSells(hadBaseline ? prev.balances : null, balances, wallets);
  const due = !prev || now - (prev.at || 0) >= SELL_GAP;
  if (due) {
    all[mint] = {
      v: 2,
      at: now,
      balances: balances,
      line: sellLine(Object.assign({ hadBaseline: hadBaseline }, judged)),
      score: judged.score,
      sold: judged.sold,
      holding: judged.holding
    };
    const keys = Object.keys(all);
    if (keys.length > 40) keys.sort((a, b) => (all[a].at || 0) - (all[b].at || 0)).slice(0, keys.length - 40).forEach((key) => { delete all[key]; });
    store.setMeta(SNAP_KEY, JSON.stringify(all));
  }
  const line = due ? all[mint].line : ((prev && prev.line) || sellLine(Object.assign({ hadBaseline: hadBaseline }, judged)));
  return Object.assign({ mint: mint, hadBaseline: hadBaseline, at: (prev && prev.at) || now, line: line }, judged);
}

const TOKEN_PROGRAMS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
];

async function balanceOf(key, wallet, mint) {
  let total = 0;
  for (let i = 0; i < TOKEN_PROGRAMS.length; i++) {
    const res = await rpc(key, 'getTokenAccountsByOwner', [wallet, { programId: TOKEN_PROGRAMS[i] }, { encoding: 'jsonParsed' }]).catch(() => null);
    ((res && res.value) || []).forEach((row) => {
      const info = row && row.account && row.account.data && row.account.data.parsed && row.account.data.parsed.info;
      if (!info || info.mint !== mint) return;
      const amount = info.tokenAmount || {};
      total += Number(amount.uiAmountString || amount.uiAmount) || 0;
    });
  }
  return total;
}

export async function scanSells(env, store, mint, wallets, now) {
  if (!valid(mint)) throw new Error('That coin is missing.');
  const list = (wallets || []).map(String).filter(valid).slice(0, 36);
  const at = now || Date.now();
  const prev = readSnaps(store)[mint];
  if (prev && prev.v === 2 && prev.line && at - (prev.at || 0) < SELL_GAP) {
    return {
      mint: mint,
      score: prev.score || list.length,
      sold: prev.sold || 0,
      holding: prev.holding || 0,
      hadBaseline: true,
      line: prev.line,
      at: prev.at
    };
  }
  const key = env && env.HELIUS_API_KEY;
  if (!key) throw new Error('Helius key is missing on the worker.');
  const balances = {};
  for (let i = 0; i < list.length; i += 6) {
    const chunk = list.slice(i, i + 6);
    const rows = await Promise.all(chunk.map((wallet) => balanceOf(key, wallet, mint).catch(() => 0)));
    chunk.forEach((wallet, n) => { balances[wallet] = rows[n]; });
  }
  const out = applySnap(store, mint, list, balances, at);
  return out;
}

export async function tickSells(env, store) {
  const grouped = {};
  readWallets(store).forEach((row) => {
    (row.mints || []).forEach((mint) => {
      if (!grouped[mint]) grouped[mint] = [];
      if (grouped[mint].indexOf(row.address) < 0) grouped[mint].push(row.address);
    });
  });
  const snaps = readSnaps(store);
  const now = Date.now();
  const due = Object.keys(grouped)
    .filter((mint) => !snaps[mint] || now - (snaps[mint].at || 0) >= SELL_GAP)
    .sort((a, b) => ((snaps[a] && snaps[a].at) || 0) - ((snaps[b] && snaps[b].at) || 0));
  if (!due.length) return { ok: true, checked: 0 };
  const mint = due[0];
  const row = await scanSells(env, store, mint, grouped[mint], now);
  return { ok: true, checked: 1, mint: mint, line: row.line };
}
