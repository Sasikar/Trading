const LABELS = [
  ['whale', 'Whale'],
  ['shark', 'Shark'],
  ['dolphin', 'Dolphin'],
  ['fish', 'Fish'],
  ['mm', 'MM']
];

export function tradesFromTx(tx, mint, price) {
  const user = tx && tx.feePayer;
  if (!user || !(price > 0)) return [];
  let net = 0;
  (tx.tokenTransfers || []).forEach((t) => {
    if (!t || t.mint !== mint) return;
    const amt = Number(t.tokenAmount) || 0;
    if (t.toUserAccount === user) net += amt;
    if (t.fromUserAccount === user) net -= amt;
  });
  if (!net) return [];
  return [{ wallet: user, side: net > 0 ? 'buy' : 'sell', usd: Math.abs(net) * price }];
}

function tierOf(usd) {
  if (usd >= 10000) return 'whale';
  if (usd >= 2000) return 'shark';
  if (usd >= 500) return 'dolphin';
  return 'fish';
}

export function netFlows(trades, holders, price) {
  const holdUsd = new Map();
  (holders || []).forEach((h) => {
    if (!h || !h.owner) return;
    holdUsd.set(h.owner, (Number(h.tokens) || 0) * (price || 0));
  });
  const byWallet = new Map();
  (trades || []).forEach((t) => {
    if (!t || !t.wallet || !(t.usd > 0)) return;
    const row = byWallet.get(t.wallet) || { buy: 0, sell: 0 };
    if (t.side === 'sell') row.sell += t.usd;
    else row.buy += t.usd;
    byWallet.set(t.wallet, row);
  });
  const nets = { whale: 0, shark: 0, dolphin: 0, fish: 0, mm: 0 };
  byWallet.forEach((row, wallet) => {
    const net = row.buy - row.sell;
    const twoSided = row.buy >= 500 && row.sell >= 500 && Math.min(row.buy, row.sell) >= 0.5 * Math.max(row.buy, row.sell);
    const band = twoSided ? 'mm' : tierOf(holdUsd.get(wallet) || 0);
    nets[band] += net;
  });
  return LABELS.map(([id, label]) => ({ id: id, label: label, usd: Math.round(nets[id]) }));
}

async function rpc(key, method, params) {
  const res = await fetch('https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params }),
    signal: AbortSignal.timeout(20000)
  });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error('Holder read failed');
  return body.result;
}

async function market(mint) {
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + mint, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const body = await res.json();
    const pairs = (body.pairs || []).filter((p) => p.chainId === 'solana' && p.baseToken && p.baseToken.address === mint);
    pairs.sort((a, b) => (b.liquidity && b.liquidity.usd || 0) - (a.liquidity && a.liquidity.usd || 0));
    const top = pairs[0];
    if (!top) return null;
    return {
      pair: top.pairAddress || '',
      price: Number(top.priceUsd) || 0,
      change: top.priceChange && top.priceChange.h24 != null ? Number(top.priceChange.h24) : null,
      symbol: (top.baseToken && top.baseToken.symbol) || ''
    };
  } catch (e) {
    return null;
  }
}

async function holdersOf(key, mint) {
  const largest = await rpc(key, 'getTokenLargestAccounts', [mint]);
  const rows = ((largest && largest.value) || []).slice(0, 20);
  if (!rows.length) return [];
  const parsed = await rpc(key, 'getMultipleAccounts', [rows.map((r) => r.address), { encoding: 'jsonParsed' }]);
  const by = new Map();
  (parsed.value || []).forEach((acc, i) => {
    const info = acc && acc.data && acc.data.parsed && acc.data.parsed.info;
    const owner = info && info.owner;
    const tokens = Number(info && info.tokenAmount && info.tokenAmount.uiAmount) || Number(rows[i].uiAmount) || 0;
    if (!owner || !(tokens > 0)) return;
    by.set(owner, (by.get(owner) || 0) + tokens);
  });
  const list = Array.from(by.entries()).map(([owner, tokens]) => ({ owner: owner, tokens: tokens })).sort((a, b) => b.tokens - a.tokens);
  if (list.length > 2 && list[0].tokens >= list[1].tokens * 2) list.shift();
  return list;
}

async function swapsOf(key, address, mint, price, since) {
  const trades = [];
  let before = '';
  let truncated = false;
  for (let page = 0; page < 6; page++) {
    let url = 'https://api.helius.xyz/v0/addresses/' + encodeURIComponent(address) + '/transactions?api-key=' + encodeURIComponent(key) + '&limit=100';
    if (before) url += '&before=' + encodeURIComponent(before);
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) break;
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || !rows.length) break;
    let old = false;
    rows.forEach((tx) => {
      const at = (tx.timestamp || 0) * 1000;
      if (at && at < since) old = true;
      else trades.push.apply(trades, tradesFromTx(tx, mint, price));
    });
    before = rows[rows.length - 1] && rows[rows.length - 1].signature;
    if (old || !before) break;
    if (page === 5) truncated = true;
  }
  return { trades: trades, truncated: truncated };
}

export async function scanFlows(env, mint, hints) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw new Error('Paste a Solana token address.');
  const key = env && env.HELIUS_API_KEY;
  if (!key) throw new Error('Helius key is missing on the worker.');
  hints = hints || {};
  const live = await market(mint);
  const price = (live && live.price) || Number(hints.price) || 0;
  const pair = (live && live.pair) || hints.pair || '';
  if (!(price > 0)) throw new Error('No price for that coin.');
  const holders = await holdersOf(key, mint);
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const book = await swapsOf(key, pair || mint, mint, price, since);
  return {
    mint: mint,
    symbol: (live && live.symbol) || hints.symbol || '',
    price: price,
    change: live && live.change != null ? live.change : (hints.change != null ? Number(hints.change) : null),
    rows: netFlows(book.trades, holders, price),
    truncated: book.truncated,
    trades: book.trades.length
  };
}
