const test = require("node:test");
const assert = require("node:assert/strict");
const { commentary } = require("./commentary.js");

function jean() {
  return {
    holderCount: 16762,
    mcapUsd: 4550000,
    top5Pct: 11.13,
    top10Pct: 17.55,
    top10Usd: 800000,
    top100Pct: 51.32,
    tokenWhaleConcentration: null,
    portfolioWhaleConcentrationPct: 1.5,
    lpExcluded: null,
    tiers: [
      { tier: "Shark", holders: 2, pctHolders: 0.012, pctOfCoin: 5.97 },
      { tier: "Dolphin", holders: 78, pctHolders: 0.47, pctOfCoin: 41.29 },
      { tier: "Fish", holders: 544, pctHolders: 3.25, pctOfCoin: 36.02 },
      { tier: "Crab", holders: 1783, pctHolders: 10.64, pctOfCoin: 13.18 },
      { tier: "Shrimp", holders: 14355, pctHolders: 85.6402576, pctOfCoin: 3.54 }
    ]
  };
}

test("Jean Phil is Cautious, not a retail-thin warn", () => {
  const out = commentary(jean());
  const ids = out.flags.map((f) => f.id);
  assert.equal(out.verdict, "Cautious");
  assert.ok(ids.includes("T4"));
  assert.ok(ids.includes("T9"));
  assert.ok(ids.includes("T12"));
  assert.equal(ids.includes("T6"), false);
  assert.ok(out.positives.some((p) => p.includes("Top 10")));
  assert.ok(out.positives.some((p) => p.includes("Portfolio whales")));
  assert.ok(out.unverified.some((u) => u.includes("Mint creator")));
});

test("retail at 15 does not fire, 14.99 does", () => {
  const at = jean();
  at.tiers.find((t) => t.tier === "Crab").pctOfCoin = 11.46;
  at.tiers.find((t) => t.tier === "Shrimp").pctOfCoin = 3.54;
  assert.equal(commentary(at).flags.some((f) => f.id === "T6"), false);
  const under = jean();
  under.tiers.find((t) => t.tier === "Crab").pctOfCoin = 11.45;
  under.tiers.find((t) => t.tier === "Shrimp").pctOfCoin = 3.54;
  assert.ok(commentary(under).flags.some((f) => f.id === "T6"));
});

test("Shartcoin-like holder mix is Very High Risk", () => {
  const out = commentary({
    holderCount: 2813,
    mcapUsd: 2100000,
    top5Pct: 31.5,
    top10Pct: 38.68,
    top100Pct: 71.3,
    tokenWhaleConcentration: null,
    portfolioWhaleConcentrationPct: 11.49,
    tiers: [
      { tier: "Shark", holders: 2, pctOfCoin: 29.33, pctHolders: 0.07 },
      { tier: "Dolphin", holders: 28, pctOfCoin: 27.28, pctHolders: 1 },
      { tier: "Fish", holders: 250, pctOfCoin: 31.46, pctHolders: 8.9 },
      { tier: "Crab", holders: 648, pctOfCoin: 10.08, pctHolders: 23 },
      { tier: "Shrimp", holders: 1885, pctOfCoin: 1.82, pctHolders: 67 }
    ]
  });
  const ids = out.flags.map((f) => f.id);
  assert.equal(out.verdict, "Very High Risk");
  assert.ok(ids.includes("T4"));
  assert.ok(ids.includes("T5"));
  assert.ok(ids.includes("T6"));
  assert.ok(out.unverified.some((u) => u.includes("Mint creator")));
  assert.ok(out.unverified.some((u) => u.includes("LP")));
});

test("empty and garbage do not crash and are not Safe", () => {
  for (const input of [null, undefined, {}, { holderCount: "nope", top10Pct: "abc", tiers: "x" }]) {
    const out = commentary(input);
    assert.equal(out.verdict, "Cautious");
    assert.ok(out.unverified.length > 3);
    assert.equal(out.positives.length, 0);
  }
});

test("zero holders is RUG and does not divide", () => {
  const out = commentary({ holderCount: 0, mcapUsd: 1000000, tiers: [] });
  assert.equal(out.verdict, "RUG");
  assert.ok(out.unverified.some((u) => u.includes("Market cap per holder")));
});

test("top 10 over 60 is RUG", () => {
  const out = commentary(Object.assign(clean(), { top10Pct: 72 }));
  assert.equal(out.verdict, "RUG");
  assert.equal(out.flags.filter((f) => f.id === "T1").length, 1);
});

test("a clean book is Safe", () => {
  const out = commentary(clean());
  assert.equal(out.verdict, "Safe");
  assert.equal(out.flags.length, 0);
});

test("string percents parse, garbage does not", () => {
  const out = commentary(Object.assign(clean(), { top10Pct: "61%" }));
  assert.equal(out.verdict, "RUG");
  const bad = commentary(Object.assign(clean(), { top10Pct: "lots" }));
  assert.notEqual(bad.verdict, "RUG");
  assert.ok(bad.unverified.some((u) => u.includes("not a number")));
});

test("config override can move a coin from Cautious to Safe", () => {
  const input = Object.assign(clean(), { top10Pct: 26 });
  assert.equal(commentary(input).verdict, "Cautious");
  assert.equal(commentary(input, { top10WarnPct: 30 }).verdict, "Safe");
});

test("tier percents that do not add up raise an info flag", () => {
  const input = clean();
  input.tiers = input.tiers.map((t) => Object.assign({}, t, { pctOfCoin: t.tier === "Fish" ? 10 : t.pctOfCoin }));
  const out = commentary(input);
  assert.ok(out.flags.some((f) => f.id === "SUM" && f.severity === "INFO"));
});

test("missing shark is not treated as a clean pass", () => {
  const input = clean();
  input.tiers = input.tiers.filter((t) => t.tier !== "Shark");
  const out = commentary(input);
  assert.notEqual(out.verdict, "Safe");
  assert.ok(out.unverified.some((u) => u.includes("Tier Shark missing")));
});

function clean() {
  return {
    holderCount: 8000,
    mcapUsd: 4000000,
    top5Pct: 8,
    top10Pct: 14,
    top10Usd: 560000,
    top100Pct: 40,
    tokenWhaleConcentration: null,
    portfolioWhaleConcentrationPct: 1.2,
    lpExcluded: false,
    tiers: [
      { tier: "Shark", holders: 4, pctHolders: 0.05, pctOfCoin: 6 },
      { tier: "Dolphin", holders: 40, pctHolders: 0.5, pctOfCoin: 18 },
      { tier: "Fish", holders: 400, pctHolders: 5, pctOfCoin: 36 },
      { tier: "Crab", holders: 2000, pctHolders: 25, pctOfCoin: 28 },
      { tier: "Shrimp", holders: 5556, pctHolders: 69.45, pctOfCoin: 12 }
    ]
  };
}
