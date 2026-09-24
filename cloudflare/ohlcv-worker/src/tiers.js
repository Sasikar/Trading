const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN22 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const BANDS = [1000000, 100000, 10000, 1000, 100, 0];

function u64le(b64) {
  const bin = atob(b64);
  let n = 0;
  for (let i = 0; i < bin.length; i++) n += bin.charCodeAt(i) * Math.pow(2, 8 * i);
  return n;
}

async function market(mint) {
  const res = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + mint, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error("Price feed failed");
  const dex = await res.json();
  const pairs = (dex.pairs || []).filter((p) => p.baseToken && p.baseToken.address === mint && Number(p.priceUsd) > 0);
  pairs.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
  if (!pairs.length) throw new Error("No trading pair for that address yet");
  const top = pairs[0];
  return {
    name: (top.baseToken && top.baseToken.name) || "Token",
    symbol: (top.baseToken && top.baseToken.symbol) || "",
    price: Number(top.priceUsd),
    mcap: Number(top.marketCap || top.fdv || 0)
  };
}

async function meta(mint) {
  let decimals = 6;
  let program = TOKEN;
  try {
    const res = await fetch("https://api.rugcheck.xyz/v1/tokens/" + mint + "/report", { signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const rug = await res.json();
      if (rug.tokenProgram) program = rug.tokenProgram;
      const holders = rug.topHolders || [];
      for (const h of holders) {
        if (typeof h.decimals === "number") { decimals = h.decimals; break; }
      }
    }
  } catch (e) {}
  return { decimals, program };
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
    { encoding: "base64", dataSlice: { offset: 64, length: 8 }, filters }
  ]);
  const out = [];
  for (const row of rows || []) {
    const data = row.account && row.account.data;
    const b64 = Array.isArray(data) ? data[0] : (typeof data === "string" ? data : "");
    if (!b64) continue;
    const raw = u64le(b64);
    if (raw > 0) out.push(raw);
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
      if (raw > 0) out.push(raw);
    }
    cursor = result && result.cursor;
    if (!cursor || list.length < 1000) break;
  }
  return out;
}

function bucket(amounts, price, decimals) {
  const scale = Math.pow(10, decimals);
  const buckets = BANDS.map(() => ({ count: 0, value: 0 }));
  for (const raw of amounts) {
    const usd = (raw / scale) * price;
    let idx = BANDS.length - 1;
    for (let i = 0; i < BANDS.length; i++) {
      if (usd >= BANDS[i]) { idx = i; break; }
    }
    buckets[idx].count += 1;
    buckets[idx].value += usd;
  }
  const sum = buckets.reduce((s, b) => s + b.value, 0);
  return { buckets, sum, holderCount: amounts.length };
}

export async function scanTiers(env, mint) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw new Error("Paste a Solana token address.");
  const key = env && env.HELIUS_API_KEY;
  if (!key) throw new Error("Helius key is missing on the worker.");
  const [mkt, info] = await Promise.all([market(mint), meta(mint)]);
  let amounts;
  try {
    amounts = await amountsViaGpa(key, mint, info.program);
  } catch (e) {
    amounts = await amountsViaDas(key, mint);
  }
  if (!amounts.length) throw new Error("No holders found for that mint");
  const grouped = bucket(amounts, mkt.price, info.decimals);
  return {
    name: mkt.name,
    symbol: mkt.symbol,
    price: mkt.price,
    mcap: mkt.mcap || grouped.sum,
    holderCount: grouped.holderCount,
    buckets: grouped.buckets,
    sum: grouped.sum,
    mint
  };
}
