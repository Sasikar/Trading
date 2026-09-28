import test from "node:test";
import assert from "node:assert/strict";
import {
  adaptiveTolerance,
  advancePaper,
  alertKey,
  buildFomoEntry,
  closedBars,
  clusterPoints,
  confirmedSwings,
  mapEntryWindow,
  rrOf,
} from "./fomoentry-engine.mjs";

const H = 60 * 60 * 1000;

function bar(i, o, h, l, c, vol = 10) {
  return { t: 1_700_000_000_000 + i * H, o, h, l, c, vol };
}

function waveBreak() {
  const bars = [];
  for (let i = 0; i < 40; i++) {
    const phase = i % 8;
    let o;
    let h;
    let l;
    let c;
    if (phase === 0) {
      o = 1.02; h = 1.03; l = 0.99; c = 1;
    } else if (phase === 1) {
      o = 1; h = 1.04; l = 0.995; c = 1.03;
    } else if (phase === 2) {
      o = 1.03; h = 1.07; l = 1.02; c = 1.06;
    } else if (phase === 3) {
      o = 1.06; h = 1.09; l = 1.05; c = 1.08;
    } else if (phase === 4) {
      o = 1.08; h = 1.085; l = 1.04; c = 1.05;
    } else if (phase === 5) {
      o = 1.05; h = 1.06; l = 1.01; c = 1.02;
    } else if (phase === 6) {
      o = 1.02; h = 1.03; l = 0.985; c = 1;
    } else {
      o = 1; h = 1.02; l = 0.99; c = 1.01;
    }
    bars.push(bar(i, o, h, l, c, phase === 3 || phase === 0 ? 40 : 15));
  }
  const ext = [
    [1.1, 1.16, 1.08, 1.14],
    [1.14, 1.22, 1.12, 1.2],
    [1.2, 1.28, 1.18, 1.26],
    [1.26, 1.42, 1.24, 1.38],
    [1.38, 1.4, 1.3, 1.32],
    [1.32, 1.34, 1.24, 1.26],
    [1.26, 1.28, 1.2, 1.22],
    [1.22, 1.24, 1.18, 1.2],
  ];
  ext.forEach((p, k) => bars.push(bar(40 + k, p[0], p[1], p[2], p[3], 60)));
  return bars;
}

test("swings ignore the unconfirmed edge", () => {
  const bars = [];
  for (let i = 0; i < 20; i++) bars.push(bar(i, 1, 1.02, 0.98, 1));
  bars[10] = bar(10, 1, 1.2, 0.99, 1.05);
  bars[11] = bar(11, 1, 1.01, 0.7, 0.9);
  const sw = confirmedSwings(bars, 2);
  assert.ok(sw.highs.some((p) => p.i === 10));
  assert.ok(sw.lows.some((p) => p.i === 11));
  assert.equal(sw.highs.some((p) => p.i >= 18), false);
});

test("closed bars drop the open bucket", () => {
  const bars = [bar(0, 1, 1.1, 0.9, 1), bar(1, 1, 1.2, 0.9, 1.1)];
  const now = bars[1].t + 1000;
  const closed = closedBars(bars, "1h", now);
  assert.equal(closed.length, 1);
});

test("tolerance widens with volatility and stays bounded", () => {
  const calm = Array.from({ length: 20 }, (_, i) => bar(i, 1, 1.002, 0.998, 1));
  const wild = Array.from({ length: 20 }, (_, i) => bar(i, 1, 1.08, 0.92, 1));
  assert.ok(adaptiveTolerance(wild) > adaptiveTolerance(calm));
  assert.ok(adaptiveTolerance(wild) <= 0.04);
  assert.ok(adaptiveTolerance(calm) >= 0.006);
});

test("clusters nearby swings and keeps distant ones apart", () => {
  const pts = [
    { price: 1, kind: "low" },
    { price: 1.004, kind: "low" },
    { price: 1.2, kind: "high" },
  ];
  const groups = clusterPoints(pts, 0.01);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].length, 2);
});

test("does not invent a setup on a brand new tape", () => {
  const bars = [bar(0, 1, 1.1, 0.9, 1), bar(1, 1, 1.2, 0.95, 1.1)];
  const out = buildFomoEntry({ ca: "new", lookback: "ALL", bars: { "1h": bars }, now: bars.at(-1).t + H + 1 });
  assert.equal(out.entryZone, null);
  assert.equal(out.quality, "INSUFFICIENT HISTORY");
  assert.equal(out.status, "INSUFFICIENT HISTORY");
});

test("breakout retest yields a zone under spot and NO CHASE when extended", () => {
  const bars = waveBreak();
  const now = bars.at(-1).t + H + 1;
  const spot = bars.at(-1).c;
  const out = buildFomoEntry({ ca: "coin", lookback: "ALL", bars: { "1h": bars }, spot, now });
  assert.equal(out.setupType, "BREAKOUT RETEST");
  assert.ok(out.entryZone.high < spot);
  assert.ok(out.invalidation.price < out.entryZone.low);
  assert.equal(out.window.state, "NO_CHASE");
  assert.equal(out.entryZone.touches >= 2, true);
});

test("price inside the zone is not a chase and is not active without confirm", () => {
  const bars = waveBreak();
  const now = bars.at(-1).t + H + 1;
  const extended = buildFomoEntry({ ca: "z", lookback: "ALL", bars: { "1h": bars }, now, spot: bars.at(-1).c });
  const mid = extended.entryZone.midpoint;
  const inside = buildFomoEntry({ ca: "z", lookback: "ALL", bars: { "1h": bars }, now, spot: mid, confirm: false, prev: extended });
  assert.equal(inside.window.state, "IN_ZONE");
  assert.equal(inside.setupId, extended.setupId);
  const active = buildFomoEntry({ ca: "z", lookback: "ALL", bars: { "1h": bars }, now, spot: mid, confirm: true, prev: inside });
  assert.equal(active.window.state, "ENTRY_WINDOW_ACTIVE");
  assert.notEqual(active.status, "BUY");
});

test("entry window ACTIVE is WHEN only, and does not force a buy zone", () => {
  const mapped = mapEntryWindow({ state: "NO_CHASE", why: "extended" });
  assert.equal(mapped.label, "NO CHASE");
  assert.equal(mapped.source, "entry-window");
  const reclaim = mapEntryWindow({ state: "RECLAIM" });
  assert.equal(reclaim.label, "IN ZONE · NO CONFIRM");
  const live = mapEntryWindow({ state: "ACTIVE" });
  assert.equal(live.label, "ENTRY WINDOW ACTIVE");
});

test("R:R is reward over risk and refuses a target under entry", () => {
  assert.equal(rrOf(1, 0.9, 1.2), 2);
  assert.equal(rrOf(1, 0.9, 0.95), null);
  assert.equal(rrOf(1, 1.1, 1.2), null);
});

test("setup identity freezes while structure holds", () => {
  const bars = waveBreak();
  const now = bars.at(-1).t + H + 1;
  const first = buildFomoEntry({ ca: "coin", lookback: "ALL", bars: { "1h": bars }, now, spot: 1.2 });
  assert.ok(first.entryZone);
  const second = buildFomoEntry({
    ca: "coin",
    lookback: "ALL",
    bars: { "1h": bars },
    now: now + H,
    spot: 1.22,
    prev: first,
  });
  assert.equal(second.setupId, first.setupId);
  assert.equal(second.entryZone.low, first.entryZone.low);
  assert.equal(second.window.state, "NO_CHASE");
});

test("invalidation cancels and does not call it a buy", () => {
  const bars = waveBreak();
  const now = bars.at(-1).t + H + 1;
  const first = buildFomoEntry({ ca: "coin", lookback: "ALL", bars: { "1h": bars }, now, spot: bars.at(-1).c });
  const dead = buildFomoEntry({
    ca: "coin",
    lookback: "ALL",
    bars: { "1h": bars },
    now,
    spot: first.invalidation.price * 0.9,
    prev: first,
  });
  assert.equal(dead.status, "INVALIDATED");
  assert.notEqual(dead.window.label, "ENTRY WINDOW ACTIVE");
});

test("alert keys dedupe inside a bucket", () => {
  const a = alertKey("CA", "id", "ENTRY_ZONE_REACHED", 10);
  const b = alertKey("ca", "id", "ENTRY_ZONE_REACHED", 10);
  const c = alertKey("ca", "id", "ENTRY_ZONE_REACHED", 11);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("paper tracks MFE MAE and invalidation before T1", () => {
  const setup = {
    setupId: "x",
    createdAt: 1,
    currentPrice: 1.1,
    status: "NO CHASE",
    entryZone: { low: 1, high: 1.02, midpoint: 1.01 },
    targets: [{ price: 1.3 }],
    window: { state: "NO_CHASE" },
  };
  const p1 = advancePaper(null, setup, 2);
  assert.ok(p1.mfe > 0);
  const down = advancePaper(p1, { ...setup, currentPrice: 0.9, status: "INVALIDATED" }, 3);
  assert.ok(down.mae < 0);
  assert.equal(down.invalidatedFirst, true);
  assert.equal(down.targetsHit.includes("T1"), false);
});

test("one swing does not become a strong setup", () => {
  const bars = [];
  for (let i = 0; i < 30; i++) bars.push(bar(i, 1, 1.01, 0.99, 1, 5));
  bars[8] = bar(8, 1, 1.01, 0.8, 0.95, 5);
  const out = buildFomoEntry({ ca: "thin", lookback: "ALL", bars: { "1h": bars }, now: bars.at(-1).t + H + 1, spot: 1 });
  if (out.entryZone) assert.notEqual(out.quality, "STRONG");
});
