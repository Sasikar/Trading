/* Firstprint — FOMO + Pump.fun wallet intelligence. Same tabs as the desk. Not a buy list. */
(function () {
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function addr(seed) {
  const rand = rng(hash(seed + ":addr"));
  let out = "";
  for (let i = 0; i < 44; i++) out += B58[Math.floor(rand() * B58.length)];
  return out;
}

function evm(seed) {
  const rand = rng(hash(seed + ":evm"));
  let out = "0x";
  const hex = "0123456789abcdef";
  for (let i = 0; i < 40; i++) out += hex[Math.floor(rand() * 16)];
  return out;
}

const FOMO_TOKENS = [
  "PONS",
  "LORE",
  "THESIS",
  "CALL",
  "FEED",
  "COPY",
  "DESK",
  "PRINT",
  "ALPHA",
  "SIGHT",
  "TAPE",
  "WHALE",
  "GOAT",
  "CRAYON",
  "PULSE",
  "MONK",
];

const PUMP_TOKENS = [
  "PEPE2",
  "WOJAK",
  "BONK2",
  "MOODENG",
  "PNUT",
  "GOAT",
  "FART",
  "CHILL",
  "POPCAT",
  "MICHI",
  "GIGA",
  "RETARD",
  "TURBO",
  "SIGMA",
  "COPE",
  "WIF",
];

function mintFor(symbol, platform) {
  const suffix = platform === "pumpfun" ? "pump" : "fomo";
  return addr(`${symbol}:${suffix}`).slice(0, 40) + suffix;
}

function spark(rand, trend) {
  const pts = [];
  let v = 0.42 + rand() * 0.16;
  for (let i = 0; i < 14; i++) {
    v += (rand() - 0.46) * 0.12 + trend * 0.03;
    v = Math.min(0.96, Math.max(0.06, v));
    pts.push(v);
  }
  return pts;
}

function holdings(rand, tokens, platform, n) {
  const used = new Set();
  const out = [];
  let remain = 1;
  for (let i = 0; i < n; i++) {
    let symbol = pick(rand, tokens);
    let guard = 0;
    while (used.has(symbol) && guard++ < 8) symbol = pick(rand, tokens);
    used.add(symbol);
    const weight = i === n - 1 ? remain : Math.max(0.08, remain * (0.28 + rand() * 0.4));
    remain -= weight;
    out.push({
      symbol,
      mint: mintFor(symbol, platform),
      valueUsd: Math.round((8_000 + rand() * 180_000) * (0.6 + weight)),
      pnlPct: Math.round((rand() * 240 - 70) * 10) / 10,
      weight: Math.max(0.04, weight),
    });
  }
  return out.sort((a, b) => b.valueUsd - a.valueUsd);
}

function trades(rand, tokens, platform, n) {
  const out = [];
  let agoSec = Math.floor(rand() * 40) + 4;
  for (let i = 0; i < n; i++) {
    const symbol = pick(rand, tokens);
    const side = rand() > 0.46 ? "buy" : "sell";
    const sizeUsd = Math.round(400 + rand() * 42_000);
    const won = rand() > 0.38;
    out.push({
      id: `${symbol}-${i}-${agoSec}`,
      symbol,
      mint: mintFor(symbol, platform),
      side,
      sizeUsd,
      pnlUsd: Math.round(sizeUsd * (won ? 0.12 + rand() * 1.8 : -(0.08 + rand() * 0.7))),
      agoSec,
      mcUsd: Math.round(20_000 + rand() * 4_800_000),
    });
    agoSec += Math.floor(40 + rand() * 2800);
  }
  return out;
}

function build(platform, spec) {
  const rand = rng(hash(`${platform}:${spec.handle}`));
  const tokens = platform === "fomo" ? FOMO_TOKENS : PUMP_TOKENS;
  const scale = spec.pnlAll > 0 ? 1 : 0.7;
  const pnlAll = spec.pnlAll;
  const pnl30d = Math.round(pnlAll * (0.18 + rand() * 0.22) * scale);
  const pnl7d = Math.round(pnl30d * (0.28 + rand() * 0.3));
  const pnl24h = Math.round(pnl7d * (0.12 + rand() * 0.28) * (rand() > 0.22 ? 1 : -0.6));
  const history = trades(rand, tokens, platform, 8 + Math.floor(rand() * 5));
  const last = history[0];
  const trend = pnl7d >= 0 ? 1 : -1;
  const tags = new Set(spec.tags || []);
  spec.roles.forEach((r) => tags.add(r === "kols" ? "kol" : r));
  if (spec.winRate >= 0.62) tags.add("high-wr");
  if (Math.abs(pnl24h) > 40_000) tags.add("hot");
  if (spec.risk === "flagged") tags.add("risk");

  return {
    id: `${platform}-${spec.handle}`,
    platform,
    roles: spec.roles,
    handle: spec.handle,
    alias: spec.alias,
    address: addr(spec.handle),
    evm: platform === "fomo" && rand() > 0.35 ? evm(spec.handle) : null,
    tags: [...tags],
    risk: spec.risk,
    pnl24h,
    pnl7d,
    pnl30d,
    pnlAll,
    volume24h: Math.round(Math.abs(pnl24h) * (6 + rand() * 18) + 12_000),
    winRate: spec.winRate,
    trades: Math.round(80 + rand() * 1600),
    avgHoldMin: Math.round((spec.avgEntrySec ? 2 + rand() * 18 : 8 + rand() * 240) * 10) / 10,
    followers: spec.followers,
    last,
    holdings: holdings(rand, tokens, platform, 3 + Math.floor(rand() * 3)),
    history,
    spark: spark(rand, trend),
    note: spec.note,
    firstBlockHits: spec.firstBlockHits,
    avgEntrySec: spec.avgEntrySec,
    clusterId: spec.clusterId,
    clusterSize: spec.clusterSize,
    bundleShare: spec.bundleShare,
    launches: spec.launches,
    rugged: spec.rugged,
    graduated: spec.graduated,
    avgAthMc: spec.launches
      ? Math.round((40_000 + rand() * 1_800_000) * (spec.graduated ? 1.4 : 0.6))
      : undefined,
    insiderScore: spec.insiderScore,
  };
}

const FOMO_SPECS = [
  {
    handle: "crayon.desk",
    alias: "Crayon",
    roles: ["smart", "kols"],
    pnlAll: 3_867_825,
    winRate: 0.71,
    risk: "clean",
    followers: 184_200,
    tags: ["resolved", "all-time"],
    note: "Top FOMO book. Real Solana wallet sits behind a quiet signer. Size in, thesis out, rarely chases the second candle.",
  },
  {
    handle: "unipulse",
    alias: "Unipulse",
    roles: ["smart", "kols"],
    pnlAll: 3_425_639,
    winRate: 0.68,
    risk: "clean",
    followers: 96_400,
    note: "Rotates two wallets. The one on the profile is empty; this is the book that actually holds.",
  },
  {
    handle: "changeling",
    alias: "Change",
    roles: ["smart", "kols"],
    pnlAll: 2_859_079,
    winRate: 0.64,
    risk: "crowded",
    followers: 210_800,
    note: "Very copied. Entries still print but exits get crowded within a minute of the call.",
  },
  {
    handle: "poorgoat",
    alias: "Poor Goat",
    roles: ["smart", "kols"],
    pnlAll: 2_526_377,
    winRate: 0.66,
    risk: "clean",
    followers: 72_100,
    note: "Slow size, high conviction. Holds through the ugly middle more than the feed expects.",
  },
  {
    handle: "salem.f",
    roles: ["smart", "kols"],
    pnlAll: 1_940_220,
    winRate: 0.61,
    risk: "clean",
    followers: 41_300,
    note: "Night-session specialist. Most of the PnL lands in a four-hour window.",
  },
  {
    handle: "aurelius",
    roles: ["kols"],
    pnlAll: 1_612_400,
    winRate: 0.58,
    risk: "crowded",
    followers: 128_900,
    note: "Calls travel. Wallet still nets, but the fill quality has drifted as the list grew.",
  },
  {
    handle: "lorehound",
    roles: ["kols", "smart"],
    pnlAll: 1_104_800,
    winRate: 0.63,
    risk: "clean",
    followers: 33_700,
    note: "Buys the story, not the candle. Misses fast rugs, catches the ones that actually stick.",
  },
  {
    handle: "coldstart",
    roles: ["smart"],
    pnlAll: 884_210,
    winRate: 0.69,
    risk: "clean",
    note: "No public face. Tight risk, few tokens, almost no revenge trades.",
  },
  {
    handle: "feedwhale",
    roles: ["smart"],
    pnlAll: 742_550,
    winRate: 0.57,
    risk: "crowded",
    note: "Reads the FOMO tape like a book. Size is large enough that the feed now watches back.",
  },
  {
    handle: "thesisboy",
    roles: ["kols"],
    pnlAll: 610_040,
    winRate: 0.6,
    risk: "clean",
    followers: 18_400,
    note: "Writes before sizing. The wallet lags the post by seconds, not blocks.",
  },
  {
    handle: "lyxe",
    roles: ["kols"],
    pnlAll: 498_300,
    winRate: 0.55,
    risk: "clean",
    followers: 54_200,
    note: "Higher turnover than the top of the board. Still net positive over 30d.",
  },
  {
    handle: "quanter",
    roles: ["smart"],
    pnlAll: 455_900,
    winRate: 0.72,
    risk: "clean",
    note: "Systematic exits. Average hold under an hour, win rate stays high because losers die fast.",
  },
  {
    handle: "ethermonk",
    roles: ["kols", "smart"],
    pnlAll: 388_120,
    winRate: 0.59,
    risk: "clean",
    followers: 27_600,
    note: "Splits size across Solana and EVM. The Solana book is the one that actually moves.",
  },
  {
    handle: "copycat.low",
    roles: ["smart"],
    pnlAll: 122_400,
    winRate: 0.51,
    risk: "crowded",
    note: "Follows crayon.desk with a delay. Edge is thin; useful as a lagging confirm, not a lead.",
  },
  {
    handle: "firstprint.bot",
    roles: ["snipers"],
    pnlAll: 214_800,
    winRate: 0.48,
    risk: "crowded",
    firstBlockHits: 612,
    avgEntrySec: 1.8,
    tags: ["bot"],
    note: "Hits FOMO listings in the first two seconds. Sells into the call, not with it.",
  },
  {
    handle: "slotzero",
    roles: ["snipers"],
    pnlAll: 166_200,
    winRate: 0.44,
    risk: "flagged",
    firstBlockHits: 890,
    avgEntrySec: 0.9,
    tags: ["bot", "jito"],
    note: "Too consistent to be a person. Many of the fills share a fee payer.",
  },
  {
    handle: "tap.early",
    roles: ["snipers", "smart"],
    pnlAll: 98_440,
    winRate: 0.56,
    risk: "clean",
    firstBlockHits: 140,
    avgEntrySec: 4.2,
    note: "Human-speed sniper. Skips obvious bundles. Smaller book, cleaner tape.",
  },
  {
    handle: "precall",
    roles: ["snipers", "insiders"],
    pnlAll: 276_100,
    winRate: 0.53,
    risk: "flagged",
    firstBlockHits: 220,
    avgEntrySec: 1.1,
    insiderScore: 82,
    note: "In the book before the post lands. Timing is the tell.",
  },
  {
    handle: "rapidink",
    roles: ["snipers"],
    pnlAll: -42_300,
    winRate: 0.39,
    risk: "crowded",
    firstBlockHits: 1_240,
    avgEntrySec: 0.7,
    tags: ["bot"],
    note: "Spray sniper. High hit count, negative expectancy after fees.",
  },
  {
    handle: "echo.one",
    roles: ["snipers"],
    pnlAll: 54_800,
    winRate: 0.47,
    risk: "clean",
    firstBlockHits: 88,
    avgEntrySec: 6.4,
    note: "Waits for the first failed sniper dump, then takes the second print.",
  },
  {
    handle: "cluster.ivy",
    roles: ["bundlers"],
    pnlAll: 188_900,
    winRate: 0.5,
    risk: "flagged",
    clusterId: "ivy",
    clusterSize: 7,
    bundleShare: 0.34,
    note: "Seven wallets, one funder. Lands as organic size until you map the cluster.",
  },
  {
    handle: "cluster.ivy.2",
    roles: ["bundlers"],
    pnlAll: 61_200,
    winRate: 0.49,
    risk: "flagged",
    clusterId: "ivy",
    clusterSize: 7,
    bundleShare: 0.18,
    note: "Spoke wallet for ivy. Rarely holds past five minutes.",
  },
  {
    handle: "cluster.ivy.3",
    roles: ["bundlers"],
    pnlAll: 44_100,
    winRate: 0.46,
    risk: "flagged",
    clusterId: "ivy",
    clusterSize: 7,
    bundleShare: 0.14,
    note: "Same funding hop as ivy.2, staggered by a slot.",
  },
  {
    handle: "quietpack",
    roles: ["bundlers", "insiders"],
    pnlAll: 132_700,
    winRate: 0.52,
    risk: "crowded",
    clusterId: "quiet",
    clusterSize: 4,
    bundleShare: 0.22,
    insiderScore: 64,
    note: "Smaller pack, better camouflage. Shows up on tokens that later get a KOL post.",
  },
  {
    handle: "splitrail",
    roles: ["bundlers"],
    pnlAll: -18_400,
    winRate: 0.41,
    risk: "flagged",
    clusterId: "rail",
    clusterSize: 9,
    bundleShare: 0.41,
    note: "Heavy bundle, poor exits. The supply they grab often becomes the dump.",
  },
  {
    handle: "deskcraft",
    roles: ["devs"],
    pnlAll: 410_200,
    winRate: 0.54,
    risk: "clean",
    launches: 14,
    rugged: 1,
    graduated: 6,
    note: "Ships into the FOMO feed with actual lore. One ugly deploy, six that held a market.",
  },
  {
    handle: "storymint",
    roles: ["devs", "kols"],
    pnlAll: 188_600,
    winRate: 0.5,
    risk: "crowded",
    launches: 9,
    rugged: 2,
    graduated: 3,
    followers: 22_100,
    note: "Creator who also calls. Treat the wallet as a dev first, a KOL second.",
  },
  {
    handle: "oneanddone",
    roles: ["devs"],
    pnlAll: 96_400,
    winRate: 0.33,
    risk: "flagged",
    launches: 6,
    rugged: 5,
    graduated: 0,
    note: "Serial dumper. Same deploy pattern, different ticker. Avoid.",
  },
  {
    handle: "slowship",
    roles: ["devs"],
    pnlAll: 72_800,
    winRate: 0.58,
    risk: "clean",
    launches: 4,
    rugged: 0,
    graduated: 2,
    note: "Low cadence, keeps a stub of supply. Not a sniper target — a hold check.",
  },
  {
    handle: "ghostforge",
    roles: ["devs", "insiders"],
    pnlAll: 154_000,
    winRate: 0.47,
    risk: "flagged",
    launches: 11,
    rugged: 4,
    graduated: 2,
    insiderScore: 71,
    note: "Linked insiders buy the first slot. The deploy wallet itself looks quiet.",
  },
  {
    handle: "prealloc",
    roles: ["insiders"],
    pnlAll: 268_500,
    winRate: 0.62,
    risk: "flagged",
    insiderScore: 91,
    note: "Receives size before the listing is public on the feed. Highest insider score on FOMO.",
  },
  {
    handle: "shadowseat",
    roles: ["insiders", "smart"],
    pnlAll: 198_300,
    winRate: 0.6,
    risk: "crowded",
    insiderScore: 74,
    note: "Often in the same tokens as crayon.desk, but earlier. Could be a related book.",
  },
  {
    handle: "whisper.sz",
    roles: ["insiders"],
    pnlAll: 87_900,
    winRate: 0.55,
    risk: "flagged",
    insiderScore: 68,
    note: "Smaller insider. Useful as a confirm when it rhymes with a known cluster.",
  },
  {
    handle: "lateinside",
    roles: ["insiders"],
    pnlAll: -12_200,
    winRate: 0.43,
    risk: "crowded",
    insiderScore: 51,
    note: "Was early last month, now just fast. Score is decaying.",
  },
];

const PUMP_SPECS = [
  {
    handle: "trenchmint",
    alias: "Trenchmint",
    roles: ["smart", "kols"],
    pnlAll: 2_410_000,
    winRate: 0.67,
    risk: "clean",
    followers: 64_800,
    tags: ["kolscan"],
    note: "Pump.fun book with a public KOL tag. Buys graduates more than raw curve noise.",
  },
  {
    handle: "curveking",
    roles: ["smart"],
    pnlAll: 1_880_400,
    winRate: 0.7,
    risk: "clean",
    note: "Waits for the curve to stall, then takes the reclaim. Rarely in block zero.",
  },
  {
    handle: "printfarm",
    alias: "Printfarm",
    roles: ["smart", "kols"],
    pnlAll: 1_420_700,
    winRate: 0.63,
    risk: "crowded",
    followers: 88_200,
    note: "Heavily copied on Kolscan. Edge is still there on mid-caps, thinner on fresh mints.",
  },
  {
    handle: "bonded",
    roles: ["smart"],
    pnlAll: 990_250,
    winRate: 0.65,
    risk: "clean",
    note: "Only trades tokens that have crossed 70% on the curve. Misses lottery tickets, keeps the book.",
  },
  {
    handle: "raydiumrat",
    roles: ["smart"],
    pnlAll: 844_600,
    winRate: 0.61,
    risk: "clean",
    note: "Specialist in the migrate. Buys the first clean bid after graduation.",
  },
  {
    handle: "gigaowl",
    roles: ["kols", "smart"],
    pnlAll: 710_300,
    winRate: 0.58,
    risk: "crowded",
    followers: 112_400,
    note: "Loud caller, quieter wallet. The on-chain size is smaller than the timeline implies.",
  },
  {
    handle: "earlyape",
    roles: ["kols"],
    pnlAll: 512_900,
    winRate: 0.56,
    risk: "clean",
    followers: 29_700,
    note: "Small list, high trust. Calls a few Pump launches a week, not a firehose.",
  },
  {
    handle: "degenmint",
    roles: ["kols"],
    pnlAll: 388_400,
    winRate: 0.52,
    risk: "crowded",
    followers: 76_500,
    note: "High volume caller. Filter for the tokens where this wallet actually sized.",
  },
  {
    handle: "foxcurve",
    roles: ["smart"],
    pnlAll: 266_800,
    winRate: 0.69,
    risk: "clean",
    note: "Low trade count, high win rate. A tracking wallet, not a spray book.",
  },
  {
    handle: "blockzero",
    roles: ["snipers"],
    pnlAll: 340_200,
    winRate: 0.46,
    risk: "flagged",
    firstBlockHits: 1_054,
    avgEntrySec: 0.4,
    tags: ["jito", "bot"],
    note: "Lives in slot zero. Classic Pump sniper. Most of the PnL is dump-into-retail.",
  },
  {
    handle: "jitojoe",
    roles: ["snipers"],
    pnlAll: 198_700,
    winRate: 0.45,
    risk: "flagged",
    firstBlockHits: 780,
    avgEntrySec: 0.6,
    tags: ["jito"],
    note: "Bundles the snipe with a tip. Shows up next to blockzero often enough to note.",
  },
  {
    handle: "firstlot",
    roles: ["snipers", "smart"],
    pnlAll: 154_300,
    winRate: 0.57,
    risk: "clean",
    firstBlockHits: 210,
    avgEntrySec: 2.8,
    note: "Selective snipe. Skips bundled deploys. The book looks like a person.",
  },
  {
    handle: "curvehawk",
    roles: ["snipers"],
    pnlAll: 88_900,
    winRate: 0.5,
    risk: "crowded",
    firstBlockHits: 340,
    avgEntrySec: 3.1,
    note: "Snipes the curve, not the mint. Enters as the first organic bid appears.",
  },
  {
    handle: "spray.sol",
    roles: ["snipers"],
    pnlAll: -76_400,
    winRate: 0.36,
    risk: "flagged",
    firstBlockHits: 2_110,
    avgEntrySec: 0.3,
    tags: ["bot"],
    note: "Infrastructure sniper. Thousands of hits, negative after failed rugs.",
  },
  {
    handle: "mintghost",
    roles: ["snipers", "insiders"],
    pnlAll: 121_500,
    winRate: 0.49,
    risk: "flagged",
    firstBlockHits: 160,
    avgEntrySec: 0.8,
    insiderScore: 77,
    note: "In the same block as several flagged deploys. Treat as insider-adjacent.",
  },
  {
    handle: "pack.north",
    roles: ["bundlers"],
    pnlAll: 276_400,
    winRate: 0.51,
    risk: "flagged",
    clusterId: "north",
    clusterSize: 11,
    bundleShare: 0.48,
    note: "Eleven wallets, one Jito bundle. Often owns a third of the first-slot supply.",
  },
  {
    handle: "pack.north.b",
    roles: ["bundlers"],
    pnlAll: 94_200,
    winRate: 0.5,
    risk: "flagged",
    clusterId: "north",
    clusterSize: 11,
    bundleShare: 0.16,
    note: "North spoke. Same funding trail, different tip account.",
  },
  {
    handle: "pack.north.c",
    roles: ["bundlers"],
    pnlAll: 71_800,
    winRate: 0.48,
    risk: "flagged",
    clusterId: "north",
    clusterSize: 11,
    bundleShare: 0.11,
    note: "Sits on leftover supply and drips it after the curve heats.",
  },
  {
    handle: "softbundle",
    roles: ["bundlers"],
    pnlAll: 63_500,
    winRate: 0.53,
    risk: "crowded",
    clusterId: "soft",
    clusterSize: 4,
    bundleShare: 0.19,
    note: "Light coordination. Looks almost organic until you stack the timestamps.",
  },
  {
    handle: "mesh.nine",
    roles: ["bundlers", "devs"],
    pnlAll: 188_000,
    winRate: 0.47,
    risk: "flagged",
    clusterId: "mesh",
    clusterSize: 9,
    bundleShare: 0.37,
    launches: 8,
    rugged: 3,
    graduated: 1,
    note: "Dev that bundles its own launch. The deploy wallet is not the one that buys.",
  },
  {
    handle: "launchfox",
    roles: ["devs"],
    pnlAll: 244_600,
    winRate: 0.55,
    risk: "clean",
    launches: 18,
    rugged: 2,
    graduated: 7,
    note: "One of the cleaner Pump deployers. Graduates more than the base rate.",
  },
  {
    handle: "serialmint",
    roles: ["devs"],
    pnlAll: 132_000,
    winRate: 0.29,
    risk: "flagged",
    launches: 42,
    rugged: 31,
    graduated: 1,
    note: "Factory. Do not ape the next ticker from this wallet.",
  },
  {
    handle: "gradlab",
    roles: ["devs", "smart"],
    pnlAll: 176_400,
    winRate: 0.6,
    risk: "clean",
    launches: 7,
    rugged: 0,
    graduated: 5,
    note: "Ships slowly, migrates often. Dev that actually leaves liquidity.",
  },
  {
    handle: "rugshop",
    roles: ["devs"],
    pnlAll: 89_200,
    winRate: 0.22,
    risk: "flagged",
    launches: 15,
    rugged: 14,
    graduated: 0,
    note: "Same freeze pattern, same dump window. Flagged across the desk.",
  },
  {
    handle: "curve.dev",
    roles: ["devs"],
    pnlAll: 54_700,
    winRate: 0.48,
    risk: "crowded",
    launches: 10,
    rugged: 3,
    graduated: 2,
    note: "Mixed record. Read the last three deploys before mirroring the next.",
  },
  {
    handle: "seedseat",
    roles: ["insiders"],
    pnlAll: 312_800,
    winRate: 0.64,
    risk: "flagged",
    insiderScore: 94,
    note: "Gets size in the deploy bundle without being labeled a bundler. Highest Pump insider score.",
  },
  {
    handle: "slotfriend",
    roles: ["insiders", "snipers"],
    pnlAll: 167_900,
    winRate: 0.58,
    risk: "flagged",
    insiderScore: 80,
    firstBlockHits: 96,
    avgEntrySec: 0.5,
    note: "Always in the same slot as launchfox and gradlab. Related, or very lucky.",
  },
  {
    handle: "precurve",
    roles: ["insiders"],
    pnlAll: 121_100,
    winRate: 0.57,
    risk: "crowded",
    insiderScore: 69,
    note: "Buys as metadata lands, before the public page is hot. Medium confidence insider.",
  },
  {
    handle: "shadowlot",
    roles: ["insiders", "bundlers"],
    pnlAll: 99_400,
    winRate: 0.5,
    risk: "flagged",
    insiderScore: 73,
    clusterId: "shadow",
    clusterSize: 5,
    bundleShare: 0.2,
    note: "Insider that also runs a small pack. Follow the funder, not the ticker.",
  },
  {
    handle: "fadedin",
    roles: ["insiders"],
    pnlAll: -24_600,
    winRate: 0.4,
    risk: "crowded",
    insiderScore: 46,
    note: "Old insider tag, current tape looks retail-fast. Score is on the way down.",
  },
  {
    handle: "kol.trenches",
    roles: ["kols"],
    pnlAll: 276_000,
    winRate: 0.54,
    risk: "clean",
    followers: 48_900,
    note: "Kolscan-ranked. Wallet matches the calls more often than most of the loud list.",
  },
  {
    handle: "sniperowl",
    roles: ["snipers", "kols"],
    pnlAll: 143_200,
    winRate: 0.49,
    risk: "crowded",
    firstBlockHits: 260,
    avgEntrySec: 1.6,
    followers: 19_200,
    note: "Calls the snipe after the fill. Useful as a mirror of what already happened.",
  },
];

const WALLETS = [
  ...FOMO_SPECS.map((s) => build("fomo", s)),
  ...PUMP_SPECS.map((s) => build("pumpfun", s)),
];

function walletsFor(platform, role) {
  return WALLETS.filter((w) => w.platform === platform && (role ? w.roles.includes(role) : true));
}

function walletById(id) {
  return WALLETS.find((w) => w.id === id);
}

function clusterMates(wallet) {
  if (!wallet.clusterId) return [];
  return WALLETS.filter(
    (w) =>
      w.platform === wallet.platform && w.clusterId === wallet.clusterId && w.id !== wallet.id,
  );
}

const TABS = [
  { id: "smart", label: "Smart" },
  { id: "kols", label: "KOLs" },
  { id: "snipers", label: "Snipers" },
  { id: "bundlers", label: "Bundlers" },
  { id: "devs", label: "Devs" },
  { id: "insiders", label: "Insiders" },
  { id: "tape", label: "Tape" },
  { id: "saved", label: "Saved" },
];
  function usd(n, d) {
    d = d == null ? 1 : d;
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(d) + "M";
    if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(d) + "K";
    return sign + "$" + abs.toFixed(0);
  }
  function usdSigned(n) {
    const body = usd(Math.abs(n));
    if (n > 0) return "+" + body;
    if (n < 0) return "-" + body.replace("-", "");
    return body;
  }
  function winPct(n) {
    return Math.round(n * 100) + "%";
  }
  function ago(sec) {
    if (sec < 60) return Math.max(1, Math.floor(sec)) + "s";
    if (sec < 3600) return Math.floor(sec / 60) + "m";
    if (sec < 86400) return Math.floor(sec / 3600) + "h";
    return Math.floor(sec / 86400) + "d";
  }
  function shortAddr(a) {
    if (!a || a.length < 10) return a || "";
    return a.slice(0, 4) + "…" + a.slice(-4);
  }
  function pnlFor(w, tf) {
    if (tf === "24h") return w.pnl24h;
    if (tf === "7d") return w.pnl7d;
    return w.pnl30d;
  }
  function platLabel(p) {
    return p === "fomo" ? "FOMO" : "Pump.fun";
  }
  function roleLabel(r) {
    return { smart: "Smart", kols: "KOLs", snipers: "Snipers", bundlers: "Bundlers", devs: "Devs", insiders: "Insiders" }[r] || r;
  }
  function riskLabel(r) {
    return r === "clean" ? "Clean" : r === "crowded" ? "Crowded" : "Flagged";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      return "&" + "quot;";
    });
  }
  function chip(label, tone) {
    const map = {
      green: "background:rgba(98,227,160,.16);color:#62e3a0",
      red: "background:rgba(255,111,124,.16);color:#ff6f7c",
      gold: "background:rgba(230,200,120,.16);color:#e6c878",
      blue: "background:rgba(110,182,255,.16);color:#6eb6ff",
      mute: "background:#1a2734;color:#9aa6b5",
    };
    return (
      '<span style="display:inline-flex;align-items:center;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;' +
      (map[tone] || map.mute) +
      '">' +
      esc(label) +
      "</span>"
    );
  }
  function btnStyle(on) {
    return on
      ? "padding:8px 12px;border-radius:8px;border:1px solid #243041;background:#1a9b6c;color:#fff;font-weight:800;font-size:12px;cursor:pointer"
      : "padding:8px 12px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#c5d0dc;font-weight:800;font-size:12px;cursor:pointer";
  }

  const $ = function (id) {
    return document.getElementById(id);
  };
  const state = {
    platform: "fomo",
    tab: "smart",
    tf: "7d",
    sort: "pnl",
    query: "",
    selected: null,
    watched: [],
    tape: [],
  };
  try {
    state.watched = JSON.parse(localStorage.getItem("fp_saved") || "[]");
    if (!Array.isArray(state.watched)) state.watched = [];
    state.platform = localStorage.getItem("fp_platform") || "fomo";
    state.tab = localStorage.getItem("fp_tab") || "smart";
  } catch (e) {}

  let tapeSeq = 0;
  function seedTape() {
    const items = [];
    for (let i = 0; i < 24; i++) {
      const w = WALLETS[i % WALLETS.length];
      const t = w.history[i % w.history.length];
      items.push({
        id: "t" + i,
        walletId: w.id,
        platform: w.platform,
        handle: w.handle,
        address: w.address,
        symbol: t.symbol,
        side: i % 3 === 0 ? "sell" : "buy",
        sizeUsd: t.sizeUsd,
        agoSec: 8 + i * 17,
      });
    }
    tapeSeq = 24;
    return items;
  }
  state.tape = seedTape();

  function persist() {
    try {
      localStorage.setItem("fp_saved", JSON.stringify(state.watched));
      localStorage.setItem("fp_platform", state.platform);
      localStorage.setItem("fp_tab", state.tab);
    } catch (e) {}
  }

  function visible() {
    const q = state.query.trim().toLowerCase();
    let list;
    if (state.tab === "saved") {
      list = WALLETS.filter(function (w) {
        return w.platform === state.platform && state.watched.indexOf(w.id) >= 0;
      });
    } else if (state.tab === "tape") {
      list = WALLETS.filter(function (w) {
        return w.platform === state.platform;
      });
    } else {
      list = WALLETS.filter(function (w) {
        return w.platform === state.platform && w.roles.indexOf(state.tab) >= 0;
      });
    }
    if (q) {
      list = list.filter(function (w) {
        return (
          (w.handle + " " + (w.alias || "") + " " + w.address + " " + w.last.symbol).toLowerCase().indexOf(q) >= 0
        );
      });
    }
    if (state.tab === "tape") return list;
    return list.slice().sort(function (a, b) {
      if (state.sort === "win") return b.winRate - a.winRate;
      if (state.sort === "vol") return b.volume24h - a.volume24h;
      if (state.sort === "recent") return a.last.agoSec - b.last.agoSec;
      return pnlFor(b, state.tf) - pnlFor(a, state.tf);
    });
  }

  function extraHead() {
    const t = state.tab;
    if (t === "snipers") return ["Entry", "Hits"];
    if (t === "bundlers") return ["Cluster", "Share"];
    if (t === "devs") return ["Launches", "Grad / rug"];
    if (t === "insiders") return ["Score"];
    if (t === "kols") return ["Followers"];
    return ["Vol 24h"];
  }
  function extraCells(w) {
    const t = state.tab;
    if (t === "snipers")
      return td((w.avgEntrySec != null ? w.avgEntrySec.toFixed(1) : "—") + "s") + td(w.firstBlockHits != null ? String(w.firstBlockHits) : "—");
    if (t === "bundlers")
      return td(w.clusterId || "—") + td(w.bundleShare != null ? Math.round(w.bundleShare * 100) + "%" : "—");
    if (t === "devs")
      return (
        td(w.launches != null ? String(w.launches) : "—") +
        '<td style="padding:10px 8px;border-bottom:1px solid #16202a"><span style="color:#62e3a0">' +
        (w.graduated || 0) +
        '</span> / <span style="color:#ff6f7c">' +
        (w.rugged || 0) +
        "</span></td>"
      );
    if (t === "insiders") return td(w.insiderScore != null ? String(w.insiderScore) : "—");
    if (t === "kols") return td(w.followers ? w.followers.toLocaleString() : "—");
    return td(usd(w.volume24h));
  }
  function td(s) {
    return '<td style="padding:10px 8px;border-bottom:1px solid #16202a;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap">' + esc(s) + "</td>";
  }

  function hideOthers() {
    [
      "showBreakoutMemes",
      "showHunter",
      "showKeep",
      "showHolders",
      "showSentiment",
      "showFailures",
      "showInMemory",
      "showVerdict",
      "showEntryWindow",
      "showPositionMonitor",
      "showWowDip",
      "showOmg",
      "showPitfalls",
      "showStrategy",
      "showDecisionCheck",
      "showGmgn",
      "showWallets",
    ].forEach(function (fn) {
      try {
        window[fn](false);
      } catch (e) {}
    });
    [
      "tf-panels",
      "trend-panel",
      "struct-panel",
      "macro-panel",
      "signal-panel",
      "memegate-panel",
      "coin-panel",
      "antifomo-panel",
      "hunter-panel",
      "breakouts-panel",
      "holders-panel",
      "failures-panel",
      "inmemory-panel",
      "sentiment-panel",
      "keep-panel",
      "verdict-panel",
      "entrywindow-panel",
      "position-panel",
      "wowdip-panel",
      "omg-panel",
      "pitfalls-panel",
      "strategy-panel",
      "decision-panel",
      "gmgn-panel",
      "wallets-panel",
    ].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.style.display = "none";
      el.classList.remove("on");
      if (id === "tf-panels") el.classList.add("hidden");
    });
  }

  function paint() {
    const root = $("fp-root");
    if (!root) return;
    const wallets = visible();
    const savedCount = state.watched.filter(function (id) {
      return WALLETS.some(function (w) {
        return w.id === id && w.platform === state.platform;
      });
    }).length;
    const combined = wallets.reduce(function (s, w) {
      return s + pnlFor(w, state.tf);
    }, 0);
    const avgWin = wallets.length
      ? wallets.reduce(function (s, w) {
          return s + w.winRate;
        }, 0) / wallets.length
      : 0;
    const heads = extraHead();
    let html = "";
    html +=
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">' +
      '<button type="button" class="fp-plat" data-p="fomo" style="' +
      btnStyle(state.platform === "fomo") +
      '">FOMO</button>' +
      '<button type="button" class="fp-plat" data-p="pumpfun" style="' +
      btnStyle(state.platform === "pumpfun") +
      '">Pump.fun</button>' +
      '<input id="fp-q" type="search" placeholder="Search handle, token, address" value="' +
      esc(state.query) +
      '" style="flex:1;min-width:160px;height:36px;border-radius:8px;border:1px solid #243041;background:#0b121a;color:#e8eef6;padding:0 10px;font:650 13px Inter,system-ui,sans-serif"/>' +
      "</div>";
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">';
    TABS.forEach(function (t) {
      const count =
        t.id === "saved"
          ? savedCount
          : t.id === "tape"
            ? null
            : WALLETS.filter(function (w) {
                return w.platform === state.platform && w.roles.indexOf(t.id) >= 0;
              }).length;
      html +=
        '<button type="button" class="fp-tab" data-tab="' +
        t.id +
        '" style="' +
        btnStyle(state.tab === t.id) +
        '">' +
        t.label +
        (count != null ? " " + count : "") +
        "</button>";
    });
    html += "</div>";
    html +=
      '<div style="font-size:11px;color:#8491a1;line-height:1.45;margin-bottom:10px">' +
      platLabel(state.platform) +
      " · " +
      (TABS.filter(function (t) {
        return t.id === state.tab;
      })[0] || { label: "" }).label +
      " — same tabs as the Firstprint desk. FOMO and Pump.fun are equal books. Not a buy list.</div>";
    if (state.tab !== "tape") {
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">';
      ["24h", "7d", "30d"].forEach(function (t) {
        html +=
          '<button type="button" class="fp-tf" data-tf="' +
          t +
          '" style="' +
          btnStyle(state.tf === t) +
          '">' +
          t +
          "</button>";
      });
      [
        ["pnl", "PnL"],
        ["win", "Win"],
        ["vol", "Volume"],
        ["recent", "Recent"],
      ].forEach(function (s) {
        html +=
          '<button type="button" class="fp-sort" data-sort="' +
          s[0] +
          '" style="' +
          btnStyle(state.sort === s[0]) +
          '">' +
          s[1] +
          "</button>";
      });
      html += "</div>";
    }
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px">';
    [
      [platLabel(state.platform) + " wallets", String(wallets.length), ""],
      [state.tf + " book", usdSigned(combined), combined >= 0 ? "#62e3a0" : "#ff6f7c"],
      ["Avg win", Math.round(avgWin * 100) + "%", ""],
      [state.tab === "saved" ? "Saved here" : "Flagged", String(wallets.filter(function (w) { return w.risk === "flagged"; }).length), "#ff6f7c"],
    ].forEach(function (s) {
      html +=
        '<div style="background:#0b121a;border:1px solid #1c2633;border-radius:12px;padding:10px"><div style="font-size:10px;color:#8491a1;font-weight:800;letter-spacing:.06em">' +
        esc(s[0]).toUpperCase() +
        '</div><div style="font-size:16px;font-weight:900;margin-top:4px;font-variant-numeric:tabular-nums;color:' +
        (s[2] || "#e8eef6") +
        '">' +
        esc(s[1]) +
        "</div></div>";
    });
    html += "</div>";

    if (state.tab === "tape") {
      const rows = state.tape.filter(function (t) {
        if (t.platform !== state.platform) return false;
        const q = state.query.trim().toLowerCase();
        if (!q) return true;
        return (t.handle + " " + t.symbol + " " + t.address).toLowerCase().indexOf(q) >= 0;
      });
      html += '<div style="display:flex;flex-direction:column;gap:8px">';
      rows.forEach(function (t) {
        html +=
          '<button type="button" class="fp-open" data-id="' +
          esc(t.walletId) +
          '" style="text-align:left;padding:12px;border-radius:14px;border:1px solid #243041;background:#0b121a;cursor:pointer;display:flex;gap:10px;align-items:center">' +
          chip(t.side === "buy" ? "Buy" : "Sell", t.side === "buy" ? "green" : "red") +
          '<div style="flex:1;min-width:0"><div style="font-weight:800;color:#e8eef6">' +
          esc(t.handle) +
          '</div><div style="font-size:11px;color:#8491a1">$' +
          esc(t.symbol) +
          " · " +
          esc(shortAddr(t.address)) +
          '</div></div><div style="text-align:right;font-weight:800;font-variant-numeric:tabular-nums">' +
          usd(t.sizeUsd) +
          '<div style="font-size:11px;color:#8491a1">' +
          ago(t.agoSec) +
          "</div></div></button>";
      });
      html += "</div>";
    } else if (!wallets.length) {
      html +=
        '<div style="color:#8491a1;font-size:13px;padding:18px 4px">' +
        (state.tab === "saved" ? "Nothing saved on this side yet. Open a wallet and save it." : "No wallets match.") +
        "</div>";
    } else {
      html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>';
      ["#", "Wallet", "Tags", state.tf + " PnL", "Win"]
        .concat(heads)
        .concat(["Last", ""])
        .forEach(function (h) {
          html +=
            '<th style="text-align:left;color:#8491a1;font-size:10px;letter-spacing:.08em;padding:8px;border-bottom:1px solid #1c2633">' +
            esc(h) +
            "</th>";
        });
      html += "</tr></thead><tbody>";
      wallets.forEach(function (w, i) {
        const pnl = pnlFor(w, state.tf);
        const saved = state.watched.indexOf(w.id) >= 0;
        html += '<tr class="fp-open" data-id="' + esc(w.id) + '" style="cursor:pointer">';
        html += td(String(i + 1).padStart(2, "0"));
        html +=
          '<td style="padding:10px 8px;border-bottom:1px solid #16202a"><div style="font-weight:900;color:#e8eef6">' +
          esc(w.alias || w.handle) +
          '</div><div style="font-size:11px;color:#8491a1;font-family:ui-monospace,monospace">' +
          esc(shortAddr(w.address)) +
          "</div></td>";
        html +=
          '<td style="padding:10px 8px;border-bottom:1px solid #16202a">' +
          w.roles
            .slice(0, 2)
            .map(function (r) {
              return chip(roleLabel(r), "mute");
            })
            .join(" ") +
          (w.risk !== "clean" ? " " + chip(riskLabel(w.risk), w.risk === "flagged" ? "red" : "gold") : "") +
          "</td>";
        html +=
          '<td style="padding:10px 8px;border-bottom:1px solid #16202a;font-weight:900;font-variant-numeric:tabular-nums;color:' +
          (pnl >= 0 ? "#62e3a0" : "#ff6f7c") +
          '">' +
          usdSigned(pnl) +
          "</td>";
        html += td(winPct(w.winRate));
        html += extraCells(w);
        html +=
          '<td style="padding:10px 8px;border-bottom:1px solid #16202a"><div style="font-weight:800">$' +
          esc(w.last.symbol) +
          '</div><div style="font-size:11px;color:#8491a1">' +
          esc(w.last.side) +
          " " +
          ago(w.last.agoSec) +
          "</div></td>";
        html +=
          '<td style="padding:10px 8px;border-bottom:1px solid #16202a"><button type="button" class="fp-save" data-id="' +
          esc(w.id) +
          '" style="padding:7px 10px;border-radius:8px;border:1px solid #243041;background:' +
          (saved ? "#1a9b6c" : "#121a24") +
          ";color:" +
          (saved ? "#fff" : "#c5d0dc") +
          ';font-weight:800;font-size:11px;cursor:pointer">' +
          (saved ? "Saved" : "Save") +
          "</button></td>";
        html += "</tr>";
      });
      html += "</tbody></table></div>";
    }

    const sel = state.selected ? walletById(state.selected) : null;
    if (sel) {
      const mates = clusterMates(sel);
      const saved = state.watched.indexOf(sel.id) >= 0;
      html +=
        '<div id="fp-sheet" style="margin-top:14px;padding:16px;border-radius:14px;border:1px solid #243041;background:#0b121a">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><div style="font-weight:900;font-size:18px">' +
        esc(sel.alias || sel.handle) +
        '</div><div style="font-size:12px;color:#8491a1;font-family:ui-monospace,monospace">' +
        esc(sel.handle) +
        " · " +
        esc(shortAddr(sel.address)) +
        "</div></div>" +
        '<button type="button" class="fp-close" style="padding:8px 12px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#c5d0dc;font-weight:800;font-size:12px;cursor:pointer">Close</button></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0">' +
        chip(platLabel(sel.platform), sel.platform === "fomo" ? "blue" : "green") +
        sel.roles
          .map(function (r) {
            return chip(roleLabel(r), "mute");
          })
          .join(" ") +
        chip(riskLabel(sel.risk), sel.risk === "flagged" ? "red" : sel.risk === "crowded" ? "gold" : "green") +
        "</div>" +
        '<div style="font-size:13px;color:#c5d0dc;line-height:1.5">' +
        esc(sel.note) +
        "</div>" +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:12px 0">' +
        '<button type="button" class="fp-save" data-id="' +
        esc(sel.id) +
        '" style="' +
        btnStyle(saved) +
        '">' +
        (saved ? "Saved" : "Save") +
        "</button>" +
        '<button type="button" class="fp-copy" data-copy="' +
        esc(sel.address) +
        '" style="' +
        btnStyle(false) +
        '">Copy ' +
        esc(shortAddr(sel.address)) +
        "</button>" +
        '<a href="https://solscan.io/account/' +
        esc(sel.address) +
        '" target="_blank" rel="noopener" style="' +
        btnStyle(false) +
        ';text-decoration:none">Solscan</a></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px">' +
        [
          ["24h", usdSigned(sel.pnl24h), sel.pnl24h],
          ["7d", usdSigned(sel.pnl7d), sel.pnl7d],
          ["30d", usdSigned(sel.pnl30d), sel.pnl30d],
          ["All", usdSigned(sel.pnlAll), sel.pnlAll],
          ["Win", winPct(sel.winRate), 1],
          ["Trades", String(sel.trades), 1],
        ]
          .map(function (s) {
            return (
              '<div style="background:#121a24;border-radius:10px;padding:10px"><div style="font-size:10px;color:#8491a1;font-weight:800">' +
              s[0] +
              '</div><div style="font-weight:900;margin-top:4px;color:' +
              (s[2] >= 0 ? "#62e3a0" : "#ff6f7c") +
              '">' +
              s[1] +
              "</div></div>"
            );
          })
          .join("") +
        "</div>";
      if (sel.firstBlockHits != null) {
        html +=
          '<div style="margin-top:8px;font-size:12px;color:#8491a1">First-block hits <b style="color:#e8eef6">' +
          sel.firstBlockHits +
          "</b> · avg entry <b style=\"color:#e8eef6\">" +
          (sel.avgEntrySec != null ? sel.avgEntrySec.toFixed(1) : "—") +
          "s</b></div>";
      }
      if (sel.launches != null) {
        html +=
          '<div style="margin-top:8px;font-size:12px;color:#8491a1">Launches <b style="color:#e8eef6">' +
          sel.launches +
          '</b> · graduated <b style="color:#62e3a0">' +
          (sel.graduated || 0) +
          '</b> · rugged <b style="color:#ff6f7c">' +
          (sel.rugged || 0) +
          "</b></div>";
      }
      if (sel.insiderScore != null) {
        html +=
          '<div style="margin-top:8px;font-size:12px;color:#8491a1">Insider score <b style="color:#e6c878">' +
          sel.insiderScore +
          "</b></div>";
      }
      if (mates.length) {
        html +=
          '<div style="margin-top:12px;font-size:12px;font-weight:800;color:#8491a1">CLUSTER ' +
          esc(sel.clusterId) +
          "</div>";
        mates.forEach(function (m) {
          html +=
            '<button type="button" class="fp-open" data-id="' +
            esc(m.id) +
            '" style="display:flex;justify-content:space-between;width:100%;background:transparent;border:0;color:#c5d0dc;padding:8px 0;cursor:pointer;font-weight:800">' +
            esc(m.handle) +
            "<span>" +
            usdSigned(m.pnl7d) +
            "</span></button>";
        });
      }
      html += '<div style="margin-top:14px;font-size:12px;font-weight:800;letter-spacing:.08em;color:#8491a1">HOLDINGS</div>';
      sel.holdings.forEach(function (h) {
        html +=
          '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #16202a"><div style="font-weight:800">$' +
          esc(h.symbol) +
          '</div><div style="font-weight:800;color:' +
          (h.pnlPct >= 0 ? "#62e3a0" : "#ff6f7c") +
          '">' +
          usd(h.valueUsd) +
          " · " +
          (h.pnlPct >= 0 ? "+" : "") +
          h.pnlPct.toFixed(0) +
          "%</div></div>";
      });
      html += '<div style="margin-top:14px;font-size:12px;font-weight:800;letter-spacing:.08em;color:#8491a1">RECENT TAPE</div>';
      sel.history.forEach(function (t) {
        html +=
          '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #16202a"><div>' +
          chip(t.side, t.side === "buy" ? "green" : "red") +
          ' <b>$' +
          esc(t.symbol) +
          "</b> · " +
          ago(t.agoSec) +
          '</div><div style="font-weight:800">' +
          usd(t.sizeUsd) +
          "</div></div>";
      });
      html += "</div>";
    }

    root.innerHTML = html;
    const st = $("fp-status");
    if (st) st.textContent = platLabel(state.platform) + " · " + state.tab;
  }

  function bind() {
    const root = $("fp-root");
    if (!root || root.dataset.bound === "1") return;
    root.dataset.bound = "1";
    root.addEventListener("click", function (ev) {
      const t = ev.target && ev.target.closest && ev.target.closest("button, a, tr.fp-open");
      if (!t) return;
      if (t.classList.contains("fp-plat")) {
        state.platform = t.getAttribute("data-p");
        state.selected = null;
        persist();
        paint();
        return;
      }
      if (t.classList.contains("fp-tab")) {
        state.tab = t.getAttribute("data-tab");
        state.selected = null;
        persist();
        paint();
        return;
      }
      if (t.classList.contains("fp-tf")) {
        state.tf = t.getAttribute("data-tf");
        paint();
        return;
      }
      if (t.classList.contains("fp-sort")) {
        state.sort = t.getAttribute("data-sort");
        paint();
        return;
      }
      if (t.classList.contains("fp-save")) {
        ev.stopPropagation();
        const id = t.getAttribute("data-id");
        const i = state.watched.indexOf(id);
        if (i >= 0) state.watched.splice(i, 1);
        else state.watched.push(id);
        persist();
        paint();
        return;
      }
      if (t.classList.contains("fp-copy")) {
        ev.stopPropagation();
        const v = t.getAttribute("data-copy");
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v);
        t.textContent = "Copied";
        return;
      }
      if (t.classList.contains("fp-close")) {
        state.selected = null;
        paint();
        return;
      }
      if (t.classList.contains("fp-open")) {
        state.selected = t.getAttribute("data-id");
        paint();
        const sheet = $("fp-sheet");
        if (sheet) sheet.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
    root.addEventListener("input", function (ev) {
      if (ev.target && ev.target.id === "fp-q") {
        state.query = ev.target.value;
        paint();
        const q = $("fp-q");
        if (q) {
          q.focus();
          try {
            q.setSelectionRange(q.value.length, q.value.length);
          } catch (e) {}
        }
      }
    });
  }

  let timer = null;
  function showFirstprint(on) {
    const p = $("firstprint-panel");
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = "block";
        p.classList.add("on");
      }
      bind();
      paint();
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        const onp = $("firstprint-panel");
        if (!onp || onp.style.display === "none") return;
        state.tape.forEach(function (t) {
          t.agoSec += 1;
        });
        if (Math.random() > 0.55) {
          const w = WALLETS[Math.floor(Math.random() * WALLETS.length)];
          const tr = w.history[Math.floor(Math.random() * Math.min(4, w.history.length))];
          tapeSeq += 1;
          state.tape.unshift({
            id: "t" + tapeSeq,
            walletId: w.id,
            platform: w.platform,
            handle: w.handle,
            address: w.address,
            symbol: tr.symbol,
            side: Math.random() > 0.42 ? "buy" : "sell",
            sizeUsd: tr.sizeUsd,
            agoSec: 1,
          });
          if (state.tape.length > 48) state.tape.pop();
        }
        if (state.tab === "tape") paint();
      }, 1000);
    } else {
      if (p) {
        p.style.display = "none";
        p.classList.remove("on");
      }
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
  }

  window.showFirstprint = showFirstprint;
  const tabs = document.getElementById("tf-tabs");
  if (tabs) {
    tabs.addEventListener("click", function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector("#tf-tabs .tab.active");
        const tf = act && act.getAttribute("data-tf");
        if (tf === "firstprint") showFirstprint(true);
        else showFirstprint(false);
      }, 0);
    });
  }
})();
