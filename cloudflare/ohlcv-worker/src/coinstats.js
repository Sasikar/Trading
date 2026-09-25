const KEY = 'coinstats_wallets';
const MAX = 30;
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
      at: (row && row.at) || Date.now()
    });
  });
  const kept = clean.slice(0, MAX);
  store.setMeta(KEY, JSON.stringify(kept));
  return kept;
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
  return {
    wallet: wallet,
    total: held.total,
    holdings: held.rows,
    history: labelHistory(historyRows(book.txs, wallet, since), held.rows),
    truncated: book.truncated
  };
}
