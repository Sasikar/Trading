const DEX = {
  PUMP_FUN: 1, PUMP_AMM: 1, RAYDIUM: 1, JUPITER: 1, ORCA: 1, METEORA: 1, OKX: 1,
  LIFINITY: 1, PHOENIX: 1, OPENBOOK: 1, FLUXBEAM: 1, MOONSHOT: 1, UNKNOWN: 1,
  SYSTEM_PROGRAM: 1, TOKEN_PROGRAM: 1, MAGIC_EDEN: 1, TENSOR: 1, DEXSCREENER: 1
};
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function line(id, label, state, detail) {
  return { id: id, label: label, state: state, detail: detail };
}

export function botName(source) {
  const name = String(source || '').trim().toUpperCase();
  if (!name || DEX[name]) return '';
  return name;
}

export function scoreBundle(rows, launchAt) {
  const list = rows || [];
  const known = list.filter((r) => r.old || r.firstAt);
  const fresh = known.filter((r) => !r.old && r.firstAt && launchAt && r.firstAt >= launchAt - DAY);
  let freshLine;
  if (!launchAt) freshLine = line('fresh', 'Fresh wallets', 'grey', 'Launch time did not load.');
  else if (known.length < 3 || known.length * 2 < list.length) freshLine = line('fresh', 'Fresh wallets', 'grey', 'Wallet age did not load for enough holders.');
  else if (fresh.length * 2 >= known.length) freshLine = line('fresh', 'Fresh wallets', 'fail', fresh.length + ' of ' + known.length + ' top wallets were first seen within a day of launch.');
  else freshLine = line('fresh', 'Fresh wallets', 'pass', fresh.length + ' of ' + known.length + ' top wallets were first seen within a day of launch.');

  const stamped = list.filter((r) => !r.old && r.firstAt);
  const olds = list.filter((r) => r.old);
  const hours = new Map();
  stamped.forEach((r) => {
    const key = Math.floor(r.firstAt / HOUR);
    hours.set(key, (hours.get(key) || 0) + 1);
  });
  let sameHour = 0;
  hours.forEach((n) => { if (n > sameHour) sameHour = n; });
  const ageLine = stamped.length + olds.length < 3
    ? line('age', 'Same wallet age', 'grey', 'Fewer than 3 wallet ages came back.')
    : sameHour >= 3
      ? line('age', 'Same wallet age', 'fail', sameHour + ' top wallets were created in the same hour.')
      : line('age', 'Same wallet age', 'pass', stamped.length < 3 ? 'Most top wallets are already old, not created in the same hour.' : 'Creation times are spread out.');

  const slots = new Map();
  list.forEach((r) => { if (r.buySlot) slots.set(r.buySlot, (slots.get(r.buySlot) || 0) + 1); });
  let slotN = 0;
  slots.forEach((n) => { if (n > slotN) slotN = n; });
  const funders = new Map();
  list.forEach((r) => { if (r.funder) funders.set(r.funder, (funders.get(r.funder) || 0) + 1); });
  let fundN = 0;
  let funder = '';
  funders.forEach((n, addr) => { if (n > fundN) { fundN = n; funder = addr; } });
  const sawLink = list.some((r) => r.buySlot || r.funder);
  let linkLine;
  if (!sawLink) linkLine = line('linked', 'Connected wallets', 'grey', 'Launch buys and funding did not load.');
  else if (slotN >= 2) linkLine = line('linked', 'Connected wallets', 'fail', slotN + ' top wallets bought in the same slot.');
  else if (fundN >= 3) linkLine = line('linked', 'Connected wallets', 'fail', fundN + ' top wallets share one funder.');
  else linkLine = line('linked', 'Connected wallets', 'pass', 'No same-slot pair and no funder shared by 3 wallets.');

  const bots = list.map((r) => botName(r.bot)).filter(Boolean);
  const botCounts = new Map();
  bots.forEach((name) => botCounts.set(name, (botCounts.get(name) || 0) + 1));
  let botTop = 0;
  let botLabel = '';
  botCounts.forEach((n, name) => { if (n > botTop) { botTop = n; botLabel = name; } });
  const botLine = bots.length < 3
    ? line('bot', 'Same trading bot', 'grey', 'No swap bot was read on enough wallets.')
    : botTop / bots.length >= 0.7
      ? line('bot', 'Same trading bot', 'fail', botTop + ' of ' + bots.length + ' used ' + botLabel + '.')
      : line('bot', 'Same trading bot', 'pass', 'Top wallets used different swap bots.');

  const flagged = new Set();
  if (slotN >= 2) {
    let hot = 0;
    slots.forEach((n, slot) => { if (n === slotN) hot = slot; });
    list.forEach((r) => { if (r.buySlot === hot) flagged.add(r.owner); });
  }
  if (fundN >= 3) list.forEach((r) => { if (r.funder === funder) flagged.add(r.owner); });
  fresh.forEach((r) => flagged.add(r.owner));
  const held = list.filter((r) => flagged.has(r.owner) && r.buyTokens > 0 && r.nowTokens != null);
  const sold = held.filter((r) => r.nowTokens < r.buyTokens * 0.5);
  let holdLine;
  if (!flagged.size) holdLine = line('hold', 'Still holding', 'grey', 'No flagged wallets to track.');
  else if (!held.length) holdLine = line('hold', 'Still holding', 'grey', 'Buy size was not found for the flagged wallets.');
  else if (sold.length * 2 >= held.length) holdLine = line('hold', 'Still holding', 'fail', sold.length + ' of ' + held.length + ' flagged wallets have sold at least half.');
  else holdLine = line('hold', 'Still holding', 'pass', held.length - sold.length + ' of ' + held.length + ' flagged wallets still hold at least half.');

  return {
    checks: [
      linkLine,
      freshLine,
      ageLine,
      botLine,
      line('insider', 'Insider %', 'grey', 'GMGN’s number. Not on-chain.'),
      line('phish', 'Phishing %', 'grey', 'GMGN’s number. Not on-chain.'),
      holdLine
    ],
    funder: fundN >= 3 ? funder : ''
  };
}

async function rpc(key, method, params) {
  const res = await fetch('https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params }),
    signal: AbortSignal.timeout(20000)
  });
  const body = await res.json();
  if (!res.ok || body.error) {
    const msg = (body.error && (body.error.message || body.error)) || ('Helius ' + res.status);
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 140));
  }
  return body.result;
}

async function launchOf(mint) {
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + mint, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const body = await res.json();
    const pairs = (body.pairs || []).filter((p) => p.chainId === 'solana' && p.baseToken && p.baseToken.address === mint && p.pairCreatedAt);
    pairs.sort((a, b) => a.pairCreatedAt - b.pairCreatedAt);
    return pairs.length ? pairs[0].pairCreatedAt : null;
  } catch (e) {
    return null;
  }
}

async function ownersOf(key, mint) {
  const largest = await rpc(key, 'getTokenLargestAccounts', [mint]);
  const rows = ((largest && largest.value) || []).slice(0, 20);
  if (!rows.length) throw new Error('No holders found for that mint');
  const pubkeys = rows.map((r) => r.address);
  const parsed = await rpc(key, 'getMultipleAccounts', [pubkeys, { encoding: 'jsonParsed' }]);
  const by = new Map();
  (parsed.value || []).forEach((acc, i) => {
    const info = acc && acc.data && acc.data.parsed && acc.data.parsed.info;
    const owner = info && info.owner;
    const nowTokens = Number(info && info.tokenAmount && info.tokenAmount.uiAmount) || Number(rows[i].uiAmount) || 0;
    if (!owner || !(nowTokens > 0)) return;
    const prev = by.get(owner) || { owner: owner, nowTokens: 0 };
    prev.nowTokens += nowTokens;
    by.set(owner, prev);
  });
  const list = Array.from(by.values()).sort((a, b) => b.nowTokens - a.nowTokens);
  let skipped = '';
  if (list.length > 2 && list[0].nowTokens >= list[1].nowTokens * 2) {
    skipped = list[0].owner;
    list.shift();
  }
  return { rows: list.slice(0, 10), skipped: skipped };
}

async function sigAge(key, owner) {
  const rows = (await rpc(key, 'getSignaturesForAddress', [owner, { limit: 1000 }])) || [];
  if (rows.length >= 1000) return { old: true };
  const last = rows[rows.length - 1];
  if (!last || !last.blockTime) return {};
  return { old: false, firstAt: last.blockTime * 1000, oldestSig: last.signature };
}

function buyFromTxs(txs, owner, mint) {
  const hits = (txs || []).filter((tx) => (tx.tokenTransfers || []).some((t) => t.mint === mint && t.toUserAccount === owner && Number(t.tokenAmount) > 0));
  hits.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const tx = hits[0];
  if (!tx) return {};
  let tokens = 0;
  (tx.tokenTransfers || []).forEach((t) => {
    if (t.mint === mint && t.toUserAccount === owner) tokens += Number(t.tokenAmount) || 0;
  });
  return { buySlot: tx.slot || 0, buyTokens: tokens, bot: tx.source || '' };
}

async function walletTxs(key, owner) {
  const url = 'https://api.helius.xyz/v0/addresses/' + encodeURIComponent(owner) + '/transactions?api-key=' + encodeURIComponent(key) + '&limit=100';
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const body = await res.json().catch(() => []);
  return Array.isArray(body) ? body : [];
}

async function fundersOf(key, sigs) {
  if (!sigs.length) return new Map();
  const res = await fetch('https://api.helius.xyz/v0/transactions?api-key=' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: sigs }),
    signal: AbortSignal.timeout(15000)
  });
  const body = await res.json().catch(() => []);
  const out = new Map();
  (Array.isArray(body) ? body : []).forEach((tx) => {
    let best = 0;
    let from = '';
    (tx.nativeTransfers || []).forEach((n) => {
      const lamports = Number(n.amount) || 0;
      if (lamports > best) { best = lamports; from = n.fromUserAccount || ''; }
    });
    if (from && tx.signature) out.set(tx.signature, from);
  });
  return out;
}

export async function scanBundle(env, mint, launchHint) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw new Error('Paste a Solana token address.');
  const key = env && env.HELIUS_API_KEY;
  if (!key) throw new Error('Helius key is missing on the worker.');
  let launchAt = await launchOf(mint);
  const hint = Number(launchHint);
  if (!launchAt && hint > 1e11) launchAt = hint;
  const found = await ownersOf(key, mint);
  const rows = await Promise.all(found.rows.map(async (row) => {
    const out = { owner: row.owner, nowTokens: row.nowTokens, old: false, firstAt: 0, buySlot: 0, buyTokens: 0, bot: '', funder: '' };
    try {
      const age = await sigAge(key, row.owner);
      out.old = !!age.old;
      out.firstAt = age.firstAt || 0;
      out.oldestSig = age.oldestSig || '';
    } catch (e) {}
    try {
      Object.assign(out, buyFromTxs(await walletTxs(key, row.owner), row.owner, mint));
    } catch (e) {}
    return out;
  }));
  const sigs = rows.map((r) => r.oldestSig).filter(Boolean);
  let fundMap = new Map();
  try { fundMap = await fundersOf(key, sigs.slice(0, 10)); } catch (e) {}
  rows.forEach((r) => {
    const from = r.oldestSig && fundMap.get(r.oldestSig);
    if (from && from !== r.owner) r.funder = from;
    delete r.oldestSig;
  });
  const scored = scoreBundle(rows, launchAt);
  return {
    mint: mint,
    launchAt: launchAt,
    skipped: found.skipped,
    read: rows.length,
    checks: scored.checks
  };
}
