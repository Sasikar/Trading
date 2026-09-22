/** Helius enhanced-webhook → FOMO coin overlap. Coin selection only. Not a buy list. */
import { skipMint, clusterBuys } from './fomo-wallets.js';

export const HELIUS_BUYS_KEY = 'helius_buys';
export const HELIUS_SEEN_KEY = 'helius_seen';
const MAX_EVENTS = 800;
const MAX_SEEN = 400;
const STABLES = new Set([
  'so11111111111111111111111111111111112',
  'so11111111111111111111111111111111111111112',
  'epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v',
  'es9vmfrzacermjfrf4h2fyd4kconky11mcce8benwnyb',
  'usd1ttk2fx1eqezrpkz8md9wfvaqvygm6cg3w5sj',
  'ekjqqd7r6gnv6ccauhu3nfux4pqhqgs6p9f6qeqkpump'
]);
const STABLE_USD = new Set([
  'epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v',
  'es9vmfrzacermjfrf4h2fyd4kconky11mcce8benwnyb',
  'usd1ttk2fx1eqezrpkz8md9wfvaqvygm6cg3w5sj'
]);

export function solLeaders(leaders) {
  return (leaders || []).filter((l) => l && l.sol);
}

export function watchSet(leaders) {
  const m = new Map();
  for (const l of solLeaders(leaders)) m.set(l.sol, l);
  return m;
}

function isSkip(mint) {
  const k = String(mint || '').toLowerCase();
  return !k || skipMint(k) || STABLES.has(k);
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

function acct(t, which) {
  if (which === 'to') return t.toUserAccount || t.toUser || t.to || t.account || '';
  return t.fromUserAccount || t.fromUser || t.from || t.account || '';
}

export function netSol(tx, wallet) {
  if (!tx || !wallet) return 0;
  const sw = (tx.events && (tx.events.swap || (tx.events[0] && tx.events[0].swap))) || null;
  if (sw && sw.nativeInput) {
    const acc = sw.nativeInput.account || sw.nativeInput.userAccount || '';
    if (acc === wallet) {
      const lamports = num(sw.nativeInput.amount);
      if (lamports > 0) return lamports / 1e9;
    }
  }
  let out = 0;
  let inn = 0;
  const ns = tx.nativeTransfers || tx.native_transfers || [];
  for (let i = 0; i < ns.length; i++) {
    const n = ns[i] || {};
    const amt = num(n.amount);
    if ((n.fromUserAccount || n.fromUser || n.from) === wallet) out += amt;
    if ((n.toUserAccount || n.toUser || n.to) === wallet) inn += amt;
  }
  return Math.max(0, (out - inn) / 1e9);
}

export function stableSpent(tx, wallet) {
  if (!tx || !wallet) return 0;
  let usd = 0;
  const transfers = tx.tokenTransfers || tx.token_transfers || [];
  for (let i = 0; i < transfers.length; i++) {
    const t = transfers[i] || {};
    const mint = String(t.mint || (t.tokenAmount && t.tokenAmount.mint) || '').toLowerCase();
    if (!STABLE_USD.has(mint)) continue;
    if (acct(t, 'from') !== wallet) continue;
    usd += tokenUi(t);
  }
  return usd;
}

export function buysFromHeliusTx(tx, watch) {
  const out = [];
  if (!tx || !watch || !watch.size) return out;
  const sig = tx.signature || tx.sig || '';
  const at = (tx.timestamp ? tx.timestamp * 1000 : 0) || Date.now();
  const transfers = tx.tokenTransfers || tx.token_transfers || [];
  for (let i = 0; i < transfers.length; i++) {
    const t = transfers[i] || {};
    const mint = t.mint || (t.tokenAmount && t.tokenAmount.mint) || '';
    if (isSkip(mint)) continue;
    const to = acct(t, 'to');
    const from = acct(t, 'from');
    const Lto = watch.get(to);
    const Lfrom = watch.get(from);
    const amount = tokenUi(t);
    if (Lto && !Lfrom) {
      out.push({
        mint,
        wallet: to,
        handle: Lto.handle || '',
        side: 'buy',
        at,
        sig,
        amount,
        sol: 0,
        usdc: 0,
        name: t.symbol || '',
        dexUrl: mint ? 'https://dexscreener.com/solana/' + mint : ''
      });
    } else if (Lfrom && !Lto) {
      out.push({
        mint,
        wallet: from,
        handle: Lfrom.handle || '',
        side: 'sell',
        at,
        sig,
        amount,
        sol: 0,
        usdc: 0,
        name: t.symbol || '',
        dexUrl: mint ? 'https://dexscreener.com/solana/' + mint : ''
      });
    }
  }
  const buyers = {};
  for (let i = 0; i < out.length; i++) {
    if (out[i].side !== 'buy') continue;
    const w = out[i].wallet;
    buyers[w] = (buyers[w] || 0) + 1;
  }
  const solOf = {};
  const usdOf = {};
  Object.keys(buyers).forEach((w) => {
    solOf[w] = netSol(tx, w);
    usdOf[w] = stableSpent(tx, w);
  });
  for (let i = 0; i < out.length; i++) {
    if (out[i].side !== 'buy') continue;
    const n = buyers[out[i].wallet] || 1;
    out[i].sol = (solOf[out[i].wallet] || 0) / n;
    out[i].usdc = (usdOf[out[i].wallet] || 0) / n;
  }
  return out;
}

export function parseHeliusPayload(body) {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.transactions)) return body.transactions;
  return [body];
}

export function mergeEvents(prev, incoming, seenArr) {
  const seen = new Set(seenArr || []);
  const ev = Array.isArray(prev) ? prev.slice() : [];
  for (let i = 0; i < (incoming || []).length; i++) {
    const r = incoming[i];
    if (!r || r.side !== 'buy') continue;
    const id = (r.sig || '') + '|' + (r.wallet || '') + '|' + String(r.mint || '').toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    ev.push(r);
  }
  ev.sort((a, b) => (b.at || 0) - (a.at || 0));
  const nextSeen = Array.from(seen);
  return {
    events: ev.slice(0, MAX_EVENTS),
    seen: nextSeen.slice(Math.max(0, nextSeen.length - MAX_SEEN))
  };
}

export function scoreCoins(buyRows) {
  const buys = (buyRows || []).filter((r) => r && r.side !== 'sell');
  const coins = clusterBuys(buys).map((c) => {
    const n = (c.wallets || []).length;
    return { ...c, score: n, shared: n >= 2, fresh: true, overlap: n };
  });
  coins.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.at || 0) - (a.at || 0));
  return coins;
}

export function overlapOnly(coins) {
  return (coins || []).filter((c) => (c.score || (c.wallets || []).length) >= 2);
}
