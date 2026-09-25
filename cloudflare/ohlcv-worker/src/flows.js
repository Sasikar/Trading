const LABELS = [
  ['whale', 'Whale'],
  ['shark', 'Shark'],
  ['dolphin', 'Dolphin'],
  ['fish', 'Fish'],
  ['mm', 'MM']
];

function signedUi(raw) {
  if (raw == null) return 0;
  if (typeof raw === 'number') return raw;
  const src = raw.tokenAmount != null ? raw : { tokenAmount: raw, decimals: 0 };
  const text = String(src.tokenAmount);
  const n = Number(text);
  if (!isFinite(n) || n === 0) return 0;
  const d = Number(src.decimals);
  if (text.replace('-', '').indexOf('.') >= 0 || !(d > 0)) return n;
  return n / Math.pow(10, d);
}

function uiAmount(raw) {
  return Math.abs(signedUi(raw));
}

function tradesFromParsed(tx, mint, price) {
  if (!(price > 0) || !tx) return [];
  const swap = tx.events && tx.events.swap;
  if (swap) {
    const out = [];
    (swap.tokenOutputs || []).forEach((t) => {
      if (!t || t.mint !== mint || !t.userAccount) return;
      const amt = uiAmount(t.rawTokenAmount);
      if (amt > 0) out.push({ wallet: t.userAccount, side: 'buy', usd: amt * price });
    });
    (swap.tokenInputs || []).forEach((t) => {
      if (!t || t.mint !== mint || !t.userAccount) return;
      const amt = uiAmount(t.rawTokenAmount);
      if (amt > 0) out.push({ wallet: t.userAccount, side: 'sell', usd: amt * price });
    });
    if (out.length) return out;
  }
  const user = tx.feePayer;
  if (!user) return [];
  let net = 0;
  (tx.tokenTransfers || []).forEach((t) => {
    if (!t || t.mint !== mint) return;
    const amt = uiAmount(t.tokenAmount);
    if (t.toUserAccount === user) net += amt;
    if (t.fromUserAccount === user) net -= amt;
  });
  if (!net) return [];
  return [{ wallet: user, side: net > 0 ? 'buy' : 'sell', usd: Math.abs(net) * price }];
}

function tradesFromBalances(tx, mint, price, pair) {
  const by = new Map();
  (tx.accountData || []).forEach((acc) => {
    (acc.tokenBalanceChanges || []).forEach((c) => {
      if (!c || c.mint !== mint) return;
      const delta = signedUi(c.rawTokenAmount);
      const wallet = c.userAccount || acc.account;
      if (!wallet || !delta) return;
      by.set(wallet, (by.get(wallet) || 0) + delta);
    });
  });
  if (pair) by.delete(pair);
  const fee = tx.feePayer;
  if (fee && by.get(fee)) {
    const net = by.get(fee);
    return [{ wallet: fee, side: net > 0 ? 'buy' : 'sell', usd: Math.abs(net) * price }];
  }
  const rows = Array.from(by.entries()).filter((row) => row[1]);
  if (rows.length >= 2) {
    rows.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const rest = rows.slice(1).reduce((sum, row) => sum + row[1], 0);
    if (Math.abs(rows[0][1] + rest) <= Math.abs(rest) * 0.02) rows.shift();
  }
  return rows.map((row) => ({ wallet: row[0], side: row[1] > 0 ? 'buy' : 'sell', usd: Math.abs(row[1]) * price }));
}

export function tradesFromTx(tx, mint, price, pair) {
  const parsed = tradesFromParsed(tx, mint, price);
  if (parsed.length) return parsed;
  if (!(price > 0) || !tx) return [];
  return tradesFromBalances(tx, mint, price, pair);
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
  let sample = null;
  for (let page = 0; page < 10; page++) {
    let url = 'https://api.helius.xyz/v0/addresses/' + encodeURIComponent(address) + '/transactions?api-key=' + encodeURIComponent(key) + '&limit=100';
    if (before) url += '&before=' + encodeURIComponent(before);
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) break;
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || !rows.length) break;
    let old = false;
    rows.forEach((tx) => {
      if (!sample || ((tx.accountData || []).length && !sample.acc)) {
        const swap = tx.events && tx.events.swap;
        let changes = 0;
        let chMint = '';
        let chKeys = [];
        const keySet = {};
        (tx.accountData || []).forEach((acc) => {
          Object.keys(acc || {}).forEach((k) => { keySet[k] = 1; });
          const list = (acc && acc.tokenBalanceChanges) || [];
          changes += list.length;
          if (list.length && !chKeys.length) {
            chKeys = Object.keys(list[0]).slice(0, 8);
            chMint = list[0].mint || '';
          }
        });
        sample = {
          keys: Object.keys(tx).slice(0, 20),
          acc: (tx.accountData || []).length,
          accKeys: Object.keys(keySet),
          changes: changes,
          chMint: chMint,
          chKeys: chKeys,
          native: (tx.nativeTransfers || []).length,
          type: tx.type || '',
          transfers: (tx.tokenTransfers || []).length,
          swap: !!swap,
          desc: String(tx.description || '').slice(0, 100)
        };
      }
      const at = (tx.timestamp || 0) * 1000;
      if (at && at < since) old = true;
      else trades.push.apply(trades, tradesFromTx(tx, mint, price, address));
    });
    before = rows[rows.length - 1] && rows[rows.length - 1].signature;
    if (old || !before) break;
    if (page === 9) truncated = true;
  }
  return { trades: trades, truncated: truncated, sample: sample };
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
  const out = {
    mint: mint,
    symbol: (live && live.symbol) || hints.symbol || '',
    price: price,
    change: live && live.change != null ? live.change : (hints.change != null ? Number(hints.change) : null),
    rows: netFlows(book.trades, holders, price),
    truncated: book.truncated,
    trades: book.trades.length
  };
  if (hints.debug && book.sample) out.sample = book.sample;
  return out;
}
