const SOL = "So11111111111111111111111111111111111111112";

export function readSwap(tx, mint, price) {
  const wallet = tx && (tx.feePayer || tx.fee_payer);
  if (!wallet || !mint) return null;
  let net = 0;
  const transfers = (tx && tx.tokenTransfers) || [];
  for (let i = 0; i < transfers.length; i++) {
    const t = transfers[i];
    if (!t || t.mint !== mint) continue;
    const amt = Number(t.tokenAmount);
    if (!(amt > 0)) continue;
    if (t.fromUserAccount === wallet) net -= amt;
    if (t.toUserAccount === wallet) net += amt;
  }
  if (!net) return null;
  const side = net > 0 ? "buy" : "sell";
  const tokens = Math.abs(net);
  return { wallet, side, tokens, usd: tokens * (Number(price) || 0), ts: Number(tx.timestamp) || 0 };
}

export function rankWallets(rows) {
  const map = new Map();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.wallet) continue;
    const key = r.side + ":" + r.wallet;
    const cur = map.get(key) || { wallet: r.wallet, side: r.side, usd: 0, tokens: 0, trades: 0 };
    cur.usd += r.usd || 0;
    cur.tokens += r.tokens || 0;
    cur.trades += 1;
    map.set(key, cur);
  }
  const all = Array.from(map.values());
  const sellers = all.filter((r) => r.side === "sell").sort((a, b) => b.usd - a.usd).slice(0, 5);
  const buyers = all.filter((r) => r.side === "buy").sort((a, b) => b.usd - a.usd).slice(0, 5);
  const sellUsd = all.filter((r) => r.side === "sell").reduce((s, r) => s + r.usd, 0);
  const buyUsd = all.filter((r) => r.side === "buy").reduce((s, r) => s + r.usd, 0);
  return { sellers, buyers, sellUsd, buyUsd };
}

function reason(pair, ranked, coverage) {
  const chg = pair.change24;
  const dir = chg > 1 ? "up" : chg < -1 ? "down" : "flat";
  const leans = pair.sells > pair.buys ? "more sell transactions than buys" : pair.buys > pair.sells ? "more buy transactions than sells" : "buy and sell counts about even";
  let line = "Price is " + dir + " " + Math.abs(chg).toFixed(2) + "% over 24 hours. The main pool shows " + leans + " (" + pair.buys + " buys, " + pair.sells + " sells) on $" + Math.round(pair.volume24).toLocaleString() + " volume. Liquidity is $" + Math.round(pair.liquidity).toLocaleString() + ", so a small lean moves the price.";
  if (pair.change6 != null && Math.abs(pair.change24) > 10 && Math.abs(pair.change6) < Math.abs(pair.change24) / 2) {
    line += " Last 6 hours is " + pair.change6.toFixed(2) + "%, so most of the move is older than 6 hours.";
  }
  if (ranked && coverage) {
    const net = (ranked.buyUsd || 0) - (ranked.sellUsd || 0);
    line += coverage.complete
      ? " Wallet list covers the full 24 hours. Net flow in that list is " + (net >= 0 ? "+" : "-") + "$" + Math.round(Math.abs(net)).toLocaleString() + "."
      : " Wallet list does not cover the full 24 hours. It starts at " + coverage.from + ".";
  }
  line += " Chain shows who swapped. It does not show why.";
  return line;
}

async function mainPair(mint) {
  const res = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + mint, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) throw new Error("Price feed failed");
  const body = await res.json();
  const pairs = (body.pairs || []).filter((p) => p.chainId === "solana" && p.baseToken && p.baseToken.address === mint && Number(p.liquidity && p.liquidity.usd) > 0);
  pairs.sort((a, b) => (b.liquidity.usd || 0) - (a.liquidity.usd || 0));
  if (!pairs.length) throw new Error("No trading pair for that address yet");
  const top = pairs[0];
  const tx = (top.txns && top.txns.h24) || {};
  const ch = top.priceChange || {};
  return {
    name: top.baseToken.name || "Token",
    symbol: top.baseToken.symbol || "",
    pair: top.pairAddress,
    dex: top.dexId || "",
    price: Number(top.priceUsd) || 0,
    liquidity: Number(top.liquidity && top.liquidity.usd) || 0,
    volume24: Number(top.volume && top.volume.h24) || 0,
    buys: Number(tx.buys) || 0,
    sells: Number(tx.sells) || 0,
    change24: Number(ch.h24) || 0,
    change6: ch.h6 == null ? null : Number(ch.h6),
    change1: ch.h1 == null ? null : Number(ch.h1)
  };
}

async function heliusWindow(key, pair, mint, price) {
  const since = Math.floor(Date.now() / 1000) - 86400;
  let before = "";
  const rows = [];
  let oldest = null;
  let complete = false;
  for (let page = 0; page < 8; page++) {
    let url = "https://api.helius.xyz/v0/addresses/" + pair + "/transactions?api-key=" + encodeURIComponent(key) + "&limit=100";
    if (before) url += "&before=" + encodeURIComponent(before);
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const list = await res.json();
    if (!res.ok || !Array.isArray(list)) throw new Error("Swap list failed");
    if (!list.length) { complete = true; break; }
    before = list[list.length - 1].signature || before;
    for (let i = 0; i < list.length; i++) {
      const tx = list[i];
      const ts = Number(tx.timestamp) || 0;
      if (!oldest || (ts && ts < oldest)) oldest = ts;
      if (ts && ts < since) { complete = true; continue; }
      const row = readSwap(tx, mint, price);
      if (row && row.wallet !== pair) rows.push(row);
    }
    if (complete || list.length < 100) { complete = true; break; }
  }
  return { rows, complete, oldest };
}

async function geckoWindow(pair, mint, price) {
  const res = await fetch("https://api.geckoterminal.com/api/v2/networks/solana/pools/" + pair + "/trades", {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) throw new Error("Recent trades failed");
  const body = await res.json();
  const rows = [];
  let oldest = null;
  for (const item of body.data || []) {
    const a = item.attributes || {};
    const ts = Date.parse(a.block_timestamp || "") / 1000;
    if (ts && (!oldest || ts < oldest)) oldest = ts;
    const usd = Number(a.volume_in_usd) || 0;
    const wallet = a.tx_from_address;
    if (!wallet || wallet === pair) continue;
    const side = a.kind === "sell" ? "sell" : a.kind === "buy" ? "buy" : "";
    if (!side) continue;
    rows.push({ wallet, side, usd, tokens: usd && price ? usd / price : 0, ts });
  }
  const since = Date.now() / 1000 - 86400;
  return { rows, complete: !!(oldest && oldest <= since), oldest };
}

function coverage(window) {
  if (!window || !window.oldest) return { complete: false, from: "unknown" };
  const from = new Date(window.oldest * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return { complete: !!window.complete, from };
}

export async function scanMove(env, mint) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw new Error("Paste a Solana token address.");
  const pair = await mainPair(mint);
  const key = env && env.HELIUS_API_KEY;
  let window = null;
  let source = "geckoterminal";
  if (key) {
    try {
      window = await heliusWindow(key, pair.pair, mint, pair.price);
      source = "helius";
    } catch (e) {
      window = null;
    }
  }
  if (!window) window = await geckoWindow(pair.pair, mint, pair.price);
  const ranked = rankWallets(window.rows);
  const span = coverage(window);
  return {
    mint,
    name: pair.name,
    symbol: pair.symbol,
    pair: pair.pair,
    dex: pair.dex,
    price: pair.price,
    change24: pair.change24,
    change6: pair.change6,
    change1: pair.change1,
    buys: pair.buys,
    sells: pair.sells,
    volume24: pair.volume24,
    liquidity: pair.liquidity,
    sellers: ranked.sellers,
    buyers: ranked.buyers,
    sellUsd: ranked.sellUsd,
    buyUsd: ranked.buyUsd,
    tradesRead: window.rows.length,
    source,
    coverage: span,
    reason: reason(pair, ranked, span)
  };
}
