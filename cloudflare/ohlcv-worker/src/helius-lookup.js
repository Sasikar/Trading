/** Random wallet + coin → first/last buy via Helius. Not a buy signal. */
import { netSol, stableSpent } from './helius-coins.js';

const DEX_UA = 'Mozilla/5.0 (compatible; TradingLookup/1.0)';

export function looksLikeMint(s) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s || '').trim());
}

export function pickSolMint(pairs, q) {
  const want = String(q || '')
    .trim()
    .replace(/^\$/, '')
    .toLowerCase();
  if (!want) return null;
  let best = null;
  let bestScore = -1;
  for (let i = 0; i < (pairs || []).length; i++) {
    const p = pairs[i] || {};
    if (String(p.chainId || p.chain || '').toLowerCase() !== 'solana') continue;
    const base = p.baseToken || {};
    const mint = base.address || '';
    if (!mint) continue;
    const sym = String(base.symbol || '').toLowerCase();
    const name = String(base.name || '').toLowerCase();
    const exact = sym === want || name === want;
    const starts = sym.startsWith(want) || name.startsWith(want);
    const liq = +((p.liquidity && p.liquidity.usd) || p.liquidity) || 0;
    const score = (exact ? 1e15 : starts ? 1e12 : 1e9) + liq;
    if (score > bestScore) {
      bestScore = score;
      best = {
        mint,
        symbol: base.symbol || '',
        name: base.name || '',
        dexUrl: p.url || 'https://dexscreener.com/solana/' + mint
      };
    }
  }
  return best;
}

export function pickEnds(sigs, n) {
  const list = (sigs || []).filter(Boolean);
  n = Math.max(1, n || 12);
  if (list.length <= n * 2) return list.slice();
  const out = [];
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const s = list[i];
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  for (let i = Math.max(n, list.length - n); i < list.length; i++) {
    const s = list[i];
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function num(x) {
  const n = +x;
  return Number.isFinite(n) ? n : 0;
}

function tokenUi(t) {
  const raw = (t && (t.tokenAmount || t.amount)) || {};
  if (raw && typeof raw === 'object') {
    const ui = raw.uiAmount ?? raw.uiAmountString;
    const n = num(ui);
    if (n) return n;
    const amt = num(raw.amount);
    const dec = num(raw.decimals);
    if (amt && dec >= 0 && dec <= 18) return amt / Math.pow(10, dec);
  }
  if (typeof raw === 'number') return num(raw);
  return num(t && t.uiAmount);
}

export function buysInTx(tx, wallet, mint) {
  const out = [];
  if (!tx || !wallet || !mint) return out;
  const m = String(mint).toLowerCase();
  const w = String(wallet);
  const sig = tx.signature || tx.sig || '';
  const at = (tx.timestamp ? tx.timestamp * 1000 : 0) || (tx.blockTime ? tx.blockTime * 1000 : 0);
  const transfers = tx.tokenTransfers || tx.token_transfers || [];
  for (let i = 0; i < transfers.length; i++) {
    const t = transfers[i] || {};
    const tm = String(t.mint || (t.tokenAmount && t.tokenAmount.mint) || '').toLowerCase();
    if (tm !== m) continue;
    const to = t.toUserAccount || t.toUser || t.to || '';
    const from = t.fromUserAccount || t.fromUser || t.from || '';
    if (to === w && from !== w) {
      out.push({
        sig,
        at,
        amount: tokenUi(t),
        sol: 0,
        usdc: 0
      });
    }
  }
  if (out.length) {
    const sol = netSol(tx, wallet);
    const usdc = stableSpent(tx, wallet);
    const split = out.length;
    for (let i = 0; i < out.length; i++) {
      out[i].sol = sol / split;
      out[i].usdc = usdc / split;
    }
  }
  return out;
}

async function rpc(url, method, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(String(j.error.message || j.error));
  return j.result;
}

export async function resolveMint(q) {
  const r = await fetch('https://api.dexscreener.com/latest/dex/search?q=' + encodeURIComponent(q), {
    headers: { accept: 'application/json', 'user-agent': DEX_UA },
    cache: 'no-store'
  });
  const j = await r.json().catch(() => ({}));
  const pairs = j.pairs || (Array.isArray(j) ? j : []);
  return pickSolMint(pairs, q);
}

async function tokenAccountsByMint(rpcUrl, wallet, mint) {
  const res = await rpc(rpcUrl, 'getTokenAccountsByOwner', [wallet, { mint }, { encoding: 'jsonParsed' }]);
  const val = (res && res.value) || [];
  return val.map((v) => v && v.pubkey).filter(Boolean);
}

async function signaturesFor(rpcUrl, ata, pages) {
  const sigs = [];
  let before = '';
  let truncated = false;
  for (let i = 0; i < (pages || 3); i++) {
    const opts = { limit: 1000 };
    if (before) opts.before = before;
    const rows = (await rpc(rpcUrl, 'getSignaturesForAddress', [ata, opts])) || [];
    for (let j = 0; j < rows.length; j++) {
      const s = rows[j];
      if (!s || s.err) continue;
      if (s.signature) sigs.push(s.signature);
    }
    if (rows.length < 1000) return { sigs, truncated };
    before = rows[rows.length - 1] && rows[rows.length - 1].signature;
    if (!before) break;
  }
  truncated = true;
  return { sigs, truncated };
}

async function parseTxs(key, sigs) {
  if (!sigs.length) return [];
  const url = 'https://api.helius.xyz/v0/transactions?api-key=' + encodeURIComponent(key);
  const chunks = [];
  for (let i = 0; i < sigs.length; i += 100) chunks.push(sigs.slice(i, i + 100));
  const out = [];
  for (let i = 0; i < chunks.length; i++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transactions: chunks[i] })
    });
    const j = await r.json().catch(() => null);
    if (Array.isArray(j)) out.push.apply(out, j);
  }
  return out;
}

async function historyFallback(key, wallet, mint, pages) {
  let before = '';
  const all = [];
  for (let i = 0; i < (pages || 6); i++) {
    let url =
      'https://api.helius.xyz/v0/addresses/' +
      encodeURIComponent(wallet) +
      '/transactions?api-key=' +
      encodeURIComponent(key) +
      '&limit=100&token-accounts=all';
    if (before) url += '&before=' + encodeURIComponent(before);
    const r = await fetch(url);
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr) || !arr.length) break;
    all.push.apply(all, arr);
    before = arr[arr.length - 1] && arr[arr.length - 1].signature;
    if (!before) break;
    let hit = false;
    for (let j = 0; j < arr.length; j++) {
      if (buysInTx(arr[j], wallet, mint).length) {
        hit = true;
        break;
      }
    }
    if (hit && i >= 1) {
      /* keep paging a bit for first-buy; stop if already 2 pages with hits on a quiet wallet */
    }
  }
  return all;
}

function slimBuy(b) {
  if (!b) return null;
  return {
    sig: b.sig || '',
    at: b.at || 0,
    amount: +b.amount || 0,
    sol: +b.sol || 0,
    usdc: +b.usdc || 0,
    solscan: b.sig ? 'https://solscan.io/tx/' + b.sig : ''
  };
}

export async function lookupBuy(env, wallet, q) {
  const key = env && env.HELIUS_API_KEY;
  if (!key) return { ok: false, error: 'Helius key missing on worker' };
  wallet = String(wallet || '').trim();
  q = String(q || '').trim();
  if (wallet.length < 32) return { ok: false, error: 'wallet address required' };
  if (!q) return { ok: false, error: 'coin name or mint required' };

  const rpcUrl = 'https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(key);
  let mintInfo = looksLikeMint(q)
    ? { mint: q, symbol: '', name: '', dexUrl: 'https://dexscreener.com/solana/' + q }
    : null;
  if (!mintInfo) {
    try {
      mintInfo = await resolveMint(q);
    } catch (e) {
      return { ok: false, error: 'DexScreener resolve failed: ' + String(e.message || e).slice(0, 120) };
    }
    if (!mintInfo) return { ok: false, error: 'no Solana mint for "' + q + '"' };
  }

  const mint = mintInfo.mint;
  let atas = [];
  try {
    atas = await tokenAccountsByMint(rpcUrl, wallet, mint);
  } catch (e) {
    return { ok: false, error: 'RPC token account: ' + String(e.message || e).slice(0, 120) };
  }

  let sigs = [];
  let truncated = false;
  try {
    for (let i = 0; i < atas.length; i++) {
      const got = await signaturesFor(rpcUrl, atas[i], 3);
      sigs.push.apply(sigs, got.sigs);
      if (got.truncated) truncated = true;
    }
  } catch (e) {
    return { ok: false, error: 'RPC signatures: ' + String(e.message || e).slice(0, 120) };
  }

  let parsed = [];
  try {
    if (sigs.length) parsed = await parseTxs(key, pickEnds(sigs, 12));
    else parsed = await historyFallback(key, wallet, mint, 8);
  } catch (e) {
    return { ok: false, error: 'Helius parse: ' + String(e.message || e).slice(0, 120) };
  }

  const buys = [];
  for (let i = 0; i < parsed.length; i++) {
    const hits = buysInTx(parsed[i], wallet, mint);
    for (let j = 0; j < hits.length; j++) buys.push(hits[j]);
  }
  buys.sort((a, b) => (a.at || 0) - (b.at || 0));

  const base = {
    ok: true,
    wallet,
    mint,
    symbol: mintInfo.symbol || '',
    name: mintInfo.name || '',
    dexUrl: mintInfo.dexUrl || 'https://dexscreener.com/solana/' + mint,
    solscanWallet: 'https://solscan.io/account/' + wallet,
    solscanToken: 'https://solscan.io/token/' + mint,
    scanned: sigs.length || parsed.length,
    atas: atas.length,
    truncated
  };

  if (!buys.length) {
    return Object.assign(base, {
      found: false,
      error: atas.length
        ? 'no inbound transfer in scanned txs'
        : 'no token account — never bought, or sold and closed the ATA'
    });
  }

  const first = slimBuy(buys[0]);
  const last = slimBuy(buys[buys.length - 1]);
  return Object.assign(base, {
    found: true,
    first,
    last: last && last.sig !== first.sig ? last : first
  });
}
