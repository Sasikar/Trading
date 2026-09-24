const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const TOKEN22 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const BANDS = [1000000, 100000, 10000, 1000, 100, 0];

function b58(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

function rawBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function market(mint, rugPrice, rugMcap) {
  try {
    const res = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + mint, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12000)
    });
    if (res.ok) {
      const dex = await res.json();
      const pairs = (dex.pairs || []).filter((p) => p.baseToken && p.baseToken.address === mint && Number(p.priceUsd) > 0);
      pairs.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
      if (pairs.length) {
        const top = pairs[0];
        return {
          name: (top.baseToken && top.baseToken.name) || "Token",
          symbol: (top.baseToken && top.baseToken.symbol) || "",
          price: Number(top.priceUsd),
          mcap: Number(top.marketCap || top.fdv || 0)
        };
      }
    }
  } catch (e) {}
  if (rugPrice > 0) {
    return { name: "Token", symbol: "", price: rugPrice, mcap: rugMcap || 0 };
  }
  throw new Error("Price feed failed");
}

async function meta(mint) {
  let decimals = 6;
  let program = TOKEN;
  let price = 0;
  let mcap = 0;
  try {
    const res = await fetch("https://api.rugcheck.xyz/v1/tokens/" + mint + "/report", { signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const rug = await res.json();
      if (rug.tokenProgram) program = rug.tokenProgram;
      const holders = rug.topHolders || [];
      for (const h of holders) {
        if (typeof h.decimals === "number") { decimals = h.decimals; break; }
      }
      if (rug.token && typeof rug.token.decimals === "number") decimals = rug.token.decimals;
      price = Number(rug.price) || 0;
      const supply = Number(rug.token && rug.token.supply);
      if (price > 0 && supply > 0) mcap = (supply / Math.pow(10, decimals)) * price;
    }
  } catch (e) {}
  return { decimals, program, price, mcap };
}

async function rpc(key, method, params) {
  const res = await fetch("https://mainnet.helius-rpc.com/?api-key=" + encodeURIComponent(key), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20000)
  });
  const body = await res.json();
  if (!res.ok || body.error) {
    const msg = (body.error && (body.error.message || body.error)) || ("Helius " + res.status);
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg).slice(0, 160));
  }
  return body.result;
}

async function amountsViaGpa(key, mint, program) {
  const filters = program === TOKEN22
    ? [{ memcmp: { offset: 0, bytes: mint } }]
    : [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }];
  const rows = await rpc(key, "getProgramAccounts", [
    program === TOKEN22 ? TOKEN22 : TOKEN,
    { encoding: "base64", dataSlice: { offset: 32, length: 40 }, filters }
  ]);
  const out = [];
  for (const row of rows || []) {
    const data = row.account && row.account.data;
    const b64 = Array.isArray(data) ? data[0] : (typeof data === "string" ? data : "");
    if (!b64) continue;
    const bytes = rawBytes(b64);
    if (bytes.length < 40) continue;
    let raw = 0;
    for (let i = 0; i < 8; i++) raw += bytes[32 + i] * Math.pow(2, 8 * i);
    if (raw > 0) out.push({ raw, owner: b58(bytes.subarray(0, 32)) });
  }
  return out;
}

async function amountsViaDas(key, mint) {
  const out = [];
  let cursor;
  for (let page = 0; page < 20; page++) {
    const params = { mint, limit: 1000 };
    if (cursor) params.cursor = cursor;
    const result = await rpc(key, "getTokenAccounts", params);
    const list = (result && result.token_accounts) || [];
    for (const row of list) {
      const raw = Number(row.amount);
      if (raw > 0) out.push({ raw, owner: row.owner || "" });
    }
    cursor = result && result.cursor;
    if (!cursor || list.length < 1000) break;
  }
  return out;
}

export function bookFromRows(rows, decimals, n) {
  const by = new Map();
  for (const row of rows || []) {
    if (!row || !row.owner || !(row.raw > 0)) continue;
    by.set(row.owner, (by.get(row.owner) || 0) + row.raw);
  }
  const scale = Math.pow(10, decimals || 0);
  return Array.from(by.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n || 15)
    .map(([owner, raw]) => ({ owner, raw: String(Math.round(raw)), tokens: raw / scale }));
}

function bucket(rows, price, decimals) {
  const scale = Math.pow(10, decimals);
  const buckets = BANDS.map(() => ({ count: 0, value: 0 }));
  let total = 0;
  for (const row of rows) {
    total += row.raw;
    const usd = (row.raw / scale) * price;
    let idx = BANDS.length - 1;
    for (let i = 0; i < BANDS.length; i++) {
      if (usd >= BANDS[i]) { idx = i; break; }
    }
    buckets[idx].count += 1;
    buckets[idx].value += usd;
  }
  const sorted = rows.slice().sort((a, b) => b.raw - a.raw);
  const slicePct = (n) => {
    let raw = 0;
    for (let i = 0; i < Math.min(n, sorted.length); i++) raw += sorted[i].raw;
    return {
      pct: total ? (raw / total) * 100 : 0,
      usd: (raw / scale) * price,
      tokens: raw / scale
    };
  };
  const whales = [];
  for (const row of sorted) {
    const usd = (row.raw / scale) * price;
    if (usd >= 1000000) whales.push(row);
  }
  const whaleRaw = whales.reduce((s, r) => s + r.raw, 0);
  const sum = buckets.reduce((s, b) => s + b.value, 0);
  return {
    buckets,
    sum,
    holderCount: rows.length,
    concentration: {
      top5: slicePct(5),
      top10: slicePct(10),
      top100: slicePct(100),
      tokenWhales: {
        count: whales.length,
        pct: total ? (whaleRaw / total) * 100 : 0,
        usd: (whaleRaw / scale) * price
      }
    }
  };
}

async function otherWealth(key, owner, mint) {
  const result = await rpc(key, "getAssetsByOwner", {
    ownerAddress: owner,
    page: 1,
    limit: 100,
    displayOptions: { showFungible: true, showNativeBalance: true }
  });
  let solUsd = 0;
  let otherUsd = 0;
  for (const it of (result && result.items) || []) {
    const id = it.id || "";
    if (id === mint) continue;
    const usd = Number(it.token_info && it.token_info.price_info && it.token_info.price_info.total_price) || 0;
    if (!(usd > 0)) continue;
    if (id === SOL_MINT) solUsd += usd;
    else otherUsd += usd;
  }
  const nativeUsd = Number(result && result.nativeBalance && result.nativeBalance.total_price) || 0;
  if (nativeUsd > 0) solUsd += nativeUsd;
  return { solUsd, otherUsd };
}

async function portfolioWhales(key, rows, mint, price, decimals) {
  const sorted = rows.slice().sort((a, b) => b.raw - a.raw);
  const seen = new Set();
  const top = [];
  for (const row of sorted) {
    if (!row.owner || seen.has(row.owner)) continue;
    seen.add(row.owner);
    top.push(row);
    if (top.length >= 20) break;
  }
  const total = rows.reduce((s, r) => s + r.raw, 0);
  const scale = Math.pow(10, decimals);
  const checks = await Promise.all(top.map(async (row) => {
    const bag = await otherWealth(key, row.owner, mint);
    const thisUsd = (row.raw / scale) * price;
    const looksLikeLp = bag.solUsd > Math.max(50000, thisUsd * 0.3) && bag.otherUsd < bag.solUsd;
    const wealth = bag.otherUsd + (looksLikeLp ? 0 : bag.solUsd);
    return { raw: row.raw, whale: wealth >= 1000000, lp: looksLikeLp, priced: bag.solUsd + bag.otherUsd > 1 };
  }));
  if (!checks.some((c) => c.priced)) return null;
  const whales = checks.filter((c) => c.whale && !c.lp);
  const rawSum = whales.reduce((s, c) => s + c.raw, 0);
  return {
    count: whales.length,
    pct: total ? (rawSum / total) * 100 : 0,
    usd: (rawSum / scale) * price,
    checked: top.length
  };
}

export async function scanTiers(env, mint) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw new Error("Paste a Solana token address.");
  const key = env && env.HELIUS_API_KEY;
  if (!key) throw new Error("Helius key is missing on the worker.");
  const info = await meta(mint);
  const mkt = await market(mint, info.price, info.mcap);
  let amounts;
  try {
    amounts = await amountsViaGpa(key, mint, info.program);
  } catch (e) {
    amounts = await amountsViaDas(key, mint);
  }
  const rows = amounts;
  if (!rows.length) throw new Error("No holders found for that mint");
  const grouped = bucket(rows, mkt.price, info.decimals);
  let portfolio = null;
  try {
    portfolio = await portfolioWhales(key, rows, mint, mkt.price, info.decimals);
  } catch (e) {
    portfolio = null;
  }
  return {
    name: mkt.name,
    symbol: mkt.symbol,
    price: mkt.price,
    mcap: mkt.mcap || grouped.sum,
    holderCount: grouped.holderCount,
    buckets: grouped.buckets,
    sum: grouped.sum,
    mint,
    concentration: grouped.concentration,
    portfolioWhales: portfolio,
    book: bookFromRows(rows, info.decimals, 15)
  };
}
