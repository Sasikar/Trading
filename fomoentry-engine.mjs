// @ts-nocheck
/**
 * FomoEntry — WHERE the next trade is.
 * Closed candles only. Does not place trades and does not replace Entry Window (WHEN).
 */

const TF_MS = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
};

const TF_RANK = { "5m": 1, "1h": 2, "4h": 3, "1d": 4, "1w": 5 };

export function tfMs(tf) {
  return TF_MS[tf] || TF_MS["1h"];
}

export function closedBars(bars, tf, now) {
  const list = (bars || []).filter((b) => b && +b.h > 0 && +b.l > 0 && +b.c > 0 && +b.t > 0);
  list.sort((a, b) => a.t - b.t);
  const ms = tfMs(tf);
  const tnow = +now || Date.now();
  while (list.length && list[list.length - 1].t + ms > tnow) list.pop();
  return list;
}

/** Drop decimal-bug and one-tick prints that sit far off the rest of the tape. */
export function cleanPrints(bars) {
  const list = (bars || []).filter((b) => b && +b.c > 0 && +b.h > 0 && +b.t > 0);
  if (list.length < 8) return list;
  const closes = list.map((b) => +b.c).sort((a, b) => a - b);
  const lo = closes[Math.floor(closes.length * 0.4)];
  const hi = closes[Math.floor((closes.length - 1) * 0.8)];
  const ref = (lo + hi) / 2;
  if (!(ref > 0)) return list;
  const wickCap = ref * 12;
  const island = ref * 20;
  const dust = ref / 30;
  const out = [];
  for (const b of list) {
    let o = +b.o > 0 ? +b.o : +b.c;
    let h = +b.h;
    let l = +b.l > 0 ? +b.l : Math.min(o, +b.c);
    const c = +b.c;
    if (Math.min(o, h, l, c) > island || Math.max(o, h, l, c) < dust) continue;
    if (h > wickCap && c <= ref * 4) {
      o = Math.min(o, Math.max(c, l));
      h = Math.max(o, c);
    }
    if (o > island) o = c;
    if (h < Math.max(o, c)) h = Math.max(o, c);
    if (l > Math.min(o, c)) l = Math.min(o, c);
    out.push({ ...b, o, h, l, c });
  }
  return out.length >= 8 ? out : list;
}

export function confirmedSwings(bars, k) {
  const highs = [];
  const lows = [];
  const n = bars.length;
  const span = Math.max(1, k | 0);
  for (let i = span; i < n - span; i++) {
    let hi = true;
    let lo = true;
    for (let j = i - span; j <= i + span; j++) {
      if (j === i) continue;
      if (bars[j].h >= bars[i].h) hi = false;
      if (bars[j].l <= bars[i].l) lo = false;
    }
    if (hi) highs.push(point(bars, i, "high"));
    if (lo) lows.push(point(bars, i, "low"));
  }
  return { highs, lows };
}

function point(bars, i, kind) {
  const b = bars[i];
  return {
    i,
    t: b.t,
    price: kind === "high" ? +b.h : +b.l,
    kind,
    vol: +b.vol || 0,
  };
}

export function pivotK(tf, n) {
  if (n < 16) return 1;
  if (tf === "5m") return 3;
  if (tf === "1h" || tf === "4h") return 2;
  return 1;
}

export function adaptiveTolerance(bars) {
  const ranges = [];
  for (const b of bars || []) {
    if (+b.c > 0 && +b.h >= +b.l) ranges.push((+b.h - +b.l) / +b.c);
  }
  if (!ranges.length) return 0.02;
  ranges.sort((a, b) => a - b);
  const med = ranges[Math.floor(ranges.length / 2)];
  return clamp(med * 1.25, 0.006, 0.04);
}

export function clusterPoints(points, tol) {
  const sorted = [...(points || [])].sort((a, b) => a.price - b.price);
  const groups = [];
  for (const p of sorted) {
    const g = groups[groups.length - 1];
    if (!g) {
      groups.push([p]);
      continue;
    }
    const mean = g.reduce((s, x) => s + x.price, 0) / g.length;
    if (mean > 0 && Math.abs(p.price - mean) / mean <= tol) g.push(p);
    else groups.push([p]);
  }
  return groups.filter((g) => g.length);
}

function median(nums) {
  const s = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return 0;
  return s[Math.floor(s.length / 2)];
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function reactionPct(bars, idx, price, kind) {
  const slice = bars.slice(idx + 1, idx + 7);
  if (!slice.length || !(price > 0)) return 0;
  if (kind === "low") {
    const fav = slice.map((b) => ((+b.h - price) / price) * 100);
    return Math.max(0, median(fav));
  }
  const fav = slice.map((b) => ((price - +b.l) / price) * 100);
  return Math.max(0, median(fav));
}

function closedThrough(bars, fromIdx, price, kind, tol) {
  let n = 0;
  for (let i = fromIdx + 1; i < bars.length; i++) {
    const c = +bars[i].c;
    if (kind === "low" && c < price * (1 - tol * 0.35)) n++;
    if (kind === "high" && c > price * (1 + tol * 0.35)) n++;
  }
  return n;
}

export function scoreCluster(group, bars, tf, tol, lastIndex) {
  const kind = group.filter((p) => p.kind === "high").length >= group.filter((p) => p.kind === "low").length ? "high" : "low";
  const price = group.reduce((s, p) => s + p.price, 0) / group.length;
  const lastTouch = Math.max(...group.map((p) => p.i));
  const barsSince = Math.max(0, lastIndex - lastTouch);
  const reacts = group.map((p) => reactionPct(bars, p.i, p.price, p.kind));
  const reaction = median(reacts);
  const vols = bars.map((b) => +b.vol || 0).filter((v) => v > 0);
  const medVol = median(vols);
  const volConfirm = medVol > 0 && group.some((p) => p.vol >= medVol);
  const through = closedThrough(bars, Math.min(...group.map((p) => p.i)), price, kind, tol);
  const fresh = barsSince <= Math.max(6, Math.round(bars.length * 0.25));
  const touches = group.length;
  const factors = {
    touches: Math.min(30, touches * 7),
    recency: barsSince <= 6 ? 15 : barsSince <= 24 ? 10 : barsSince <= 80 ? 5 : 1,
    timeframe: { "5m": 6, "1h": 10, "4h": 14, "1d": 16, "1w": 16 }[tf] || 6,
    reaction: Math.min(15, Math.round(reaction * 3)),
    volume: volConfirm ? 10 : 2,
    fresh: fresh ? 8 : 0,
    through: through >= 2 ? -18 : through === 1 ? -8 : 0,
    single: touches < 2 ? -8 : 0,
  };
  const strength = clamp(Object.values(factors).reduce((s, n) => s + n, 0), 0, 100);
  return {
    price,
    low: Math.min(...group.map((p) => p.price)),
    high: Math.max(...group.map((p) => p.price)),
    kind,
    type: kind === "low" ? "SUPPORT" : "RESISTANCE",
    tf,
    tfs: [tf],
    touchCount: touches,
    sources: group.map((p) => ({ t: p.t, price: p.price, kind: p.kind, tf })),
    strength,
    factors,
    ageBars: barsSince,
    fresh,
    reactionPct: +reaction.toFixed(2),
    volConfirm,
    closedThrough: through,
    confidence: strength >= 60 ? "HIGH" : strength >= 40 ? "MODERATE" : "LOW",
  };
}

export function levelsForTimeframe(bars, tf, tol, now) {
  const closed = closedBars(cleanPrints(bars), tf, now);
  if (closed.length < 8) return [];
  const k = pivotK(tf, closed.length);
  const swings = confirmedSwings(closed, k);
  const points = [...swings.highs, ...swings.lows];
  return clusterPoints(points, tol)
    .map((g) => scoreCluster(g, closed, tf, tol, closed.length - 1))
    .filter((l) => l.touchCount >= 1 && l.strength >= 12);
}

export function mergeLevels(levels, tol) {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const out = [];
  for (const lv of sorted) {
    const prev = out[out.length - 1];
    const near = prev && prev.price > 0 && Math.abs(lv.price - prev.price) / prev.price <= tol;
    if (!near) {
      out.push({
        ...lv,
        tfs: [...lv.tfs],
        sources: [...lv.sources],
        factors: { ...lv.factors },
      });
      continue;
    }
    const touches = prev.touchCount + lv.touchCount;
    const tfs = [...new Set([...prev.tfs, ...lv.tfs])];
    const sources = [...prev.sources, ...lv.sources];
    const price = (prev.price * prev.touchCount + lv.price * lv.touchCount) / touches;
    const bonus = (tfs.length - 1) * 8;
    const factors = { ...prev.factors };
    factors.timeframe = Math.min(24, (factors.timeframe || 0) + bonus);
    factors.touches = Math.min(30, touches * 7);
    const strength = clamp(Object.values(factors).reduce((s, n) => s + n, 0), 0, 100);
    const kind = sources.filter((s) => s.kind === "high").length >= sources.filter((s) => s.kind === "low").length ? "high" : "low";
    out[out.length - 1] = {
      ...prev,
      price,
      low: Math.min(prev.low, lv.low),
      high: Math.max(prev.high, lv.high),
      kind,
      type: kind === "low" ? "SUPPORT" : "RESISTANCE",
      tfs,
      sources,
      touchCount: touches,
      strength,
      factors,
      ageBars: Math.min(prev.ageBars, lv.ageBars),
      fresh: prev.fresh || lv.fresh,
      reactionPct: Math.max(prev.reactionPct, lv.reactionPct),
      volConfirm: prev.volConfirm || lv.volConfirm,
      closedThrough: Math.max(prev.closedThrough, lv.closedThrough),
      confidence: strength >= 60 ? "HIGH" : strength >= 40 ? "MODERATE" : "LOW",
      confluence: tfs.length,
    };
  }
  return out.sort((a, b) => b.strength - a.strength);
}

function sliceLookback(barsByTf, lookback, now) {
  const tnow = +now || Date.now();
  const ms =
    lookback === "24H" ? 24 * 3600e3 : lookback === "7D" ? 7 * 24 * 3600e3 : lookback === "30D" ? 30 * 24 * 3600e3 : null;
  const order =
    lookback === "24H"
      ? ["5m", "1h"]
      : lookback === "7D"
        ? ["1h", "4h", "5m"]
        : lookback === "30D"
          ? ["4h", "1h", "1d"]
          : ["4h", "1h", "1d", "5m", "1w"];
  const out = {};
  for (const tf of order) {
    const raw = barsByTf[tf] || [];
    out[tf] = ms ? raw.filter((b) => +b.t >= tnow - ms) : raw.slice();
  }
  return { bars: out, order };
}

function markFlips(levels, bars, tol) {
  const last = bars.length ? +bars[bars.length - 1].c : 0;
  return levels.map((lv) => {
    let sawUnder = false;
    let broke = false;
    for (const b of bars) {
      if (+b.c <= lv.high * (1 + tol * 0.1)) sawUnder = true;
      if (sawUnder && +b.c > lv.high * (1 + tol * 0.15)) broke = true;
    }
    const holding = last > lv.high * (1 - tol * 0.25);
    const flipped = lv.type === "RESISTANCE" && broke && holding;
    return {
      ...lv,
      flipped,
      type: flipped ? "SUPPORT" : lv.type,
      role: flipped ? "BROKEN_RESISTANCE" : broke && lv.type === "RESISTANCE" ? "LOST_BREAK" : lv.type,
    };
  });
}

function roundId(n) {
  if (!(n > 0)) return "0";
  return Number(n).toExponential(4);
}

export function setupId(ca, lookback, type, low, high) {
  return [String(ca || "").toLowerCase(), lookback, type, roundId(low), roundId(high)].join("|");
}

export function alertKey(ca, id, type, bucket) {
  return [String(ca || "").toLowerCase(), id || "none", type, String(bucket)].join("|");
}

export function rrOf(mid, inval, target) {
  const risk = mid - inval;
  const reward = target - mid;
  if (!(risk > 0) || !(reward > 0)) return null;
  return +(reward / risk).toFixed(2);
}

function qualityOf(setup, dataQuality, historyBars) {
  if (historyBars < 12) return "INSUFFICIENT HISTORY";
  if (!setup.entryZone) return historyBars < 30 ? "INSUFFICIENT HISTORY" : "INSUFFICIENT STRUCTURE";
  const strong =
    dataQuality === "NORMAL HISTORY" &&
    (setup.entryZone.touches >= 3 || setup.entryZone.confluence >= 2) &&
    setup.rr.target1 != null &&
    setup.rr.target1 >= 1 &&
    setup.invalidation.percentRisk != null &&
    setup.invalidation.percentRisk <= 12;
  if (strong) return "STRONG";
  if (historyBars < 30 || setup.entryZone.touches < 2) return "WEAK · PROVISIONAL";
  return "MODERATE";
}

function windowFromPrice(spot, zone, inval, confirm) {
  if (!(spot > 0) || !zone) return { state: "WAIT", label: "WAIT" };
  if (inval > 0 && spot < inval) return { state: "INVALIDATED", label: "INVALIDATED" };
  if (spot > zone.high) {
    const dist = (spot - zone.high) / zone.high;
    if (dist <= 0.03) return { state: "APPROACHING", label: "APPROACHING" };
    return { state: "NO_CHASE", label: "NO CHASE" };
  }
  if (spot >= zone.low && spot <= zone.high) {
    if (confirm) return { state: "ENTRY_WINDOW_ACTIVE", label: "ENTRY WINDOW ACTIVE" };
    return { state: "IN_ZONE", label: "IN ZONE · NO CONFIRM" };
  }
  const below = (zone.low - spot) / zone.low;
  if (below <= 0.03) return { state: "APPROACHING", label: "APPROACHING" };
  return { state: "WAIT", label: "WAIT" };
}

const WHEN_MAP = {
  ACTIVE: { state: "ENTRY_WINDOW_ACTIVE", label: "ENTRY WINDOW ACTIVE" },
  RECLAIM: { state: "IN_ZONE", label: "IN ZONE · NO CONFIRM" },
  RETEST: { state: "IN_ZONE", label: "IN ZONE · NO CONFIRM" },
  WAIT_RETEST: { state: "WAIT", label: "WAIT" },
  APPROACHING: { state: "APPROACHING", label: "APPROACHING" },
  NO_CHASE: { state: "NO_CHASE", label: "NO CHASE" },
  MISSED: { state: "NO_CHASE", label: "NO CHASE" },
  INVALIDATED: { state: "INVALIDATED", label: "INVALIDATED" },
  EXPIRED: { state: "EXPIRED", label: "EXPIRED" },
  NEAR: { state: "WAIT", label: "WAIT" },
  WARMING: { state: "WAIT", label: "WAIT" },
  NO_SETUP: { state: "WAIT", label: "WAIT" },
};

export function mapEntryWindow(ew) {
  if (!ew || !ew.state) return null;
  const hit = WHEN_MAP[String(ew.state).toUpperCase()];
  if (!hit) return { state: "WAIT", label: ew.label || "WAIT", source: "entry-window", raw: ew.state };
  return { ...hit, source: "entry-window", raw: ew.state, why: ew.why || "" };
}

/** Same rule as the FomoEntry badge. WEAK stays WAIT. */
export function takeState(setup) {
  if (!setup || !setup.entryZone) return "WAIT";
  const q = setup.quality || "";
  if (q.indexOf("INSUFFICIENT") >= 0 || q.indexOf("WEAK") >= 0) return "WAIT";
  const w = setup.window && setup.window.state;
  if (w === "IN_ZONE" || w === "ENTRY_WINDOW_ACTIVE" || w === "APPROACHING") return "TAKE";
  const spot = +setup.currentPrice;
  const zone = setup.entryZone;
  if (spot >= zone.low && spot <= zone.high * 1.03) return "TAKE";
  return "WAIT";
}

function emptySetup(partial) {
  return {
    status: "WAITING FOR STRUCTURE",
    setupType: null,
    quality: "INSUFFICIENT STRUCTURE",
    dataQuality: partial.dataQuality || "LIMITED HISTORY",
    currentPrice: partial.spot || 0,
    entryZone: null,
    breakoutTrigger: null,
    targets: [],
    invalidation: null,
    rr: { target1: null, target2: null, target3: null },
    window: { state: "WAIT", label: "WAITING FOR STRUCTURE" },
    when: partial.when || { state: "WAIT", label: "WAIT" },
    keyLevels: partial.keyLevels || { support: [], resistance: [] },
    candles: partial.candles || { count: 0 },
    reason: partial.reason || "Not enough structure to name a next entry.",
    events: [],
    setupId: null,
  };
}

function bandAround(level, tol) {
  const pad = Math.max(level.high - level.low, level.price * tol * 0.35);
  const mid = level.price;
  return {
    low: +(mid - pad / 2).toPrecision(6),
    high: +(mid + pad / 2).toPrecision(6),
    midpoint: +mid.toPrecision(6),
  };
}

function pickInvalidation(zone, supports, tol) {
  const under = supports.filter((s) => s.high < zone.low * 0.995).sort((a, b) => b.price - a.price);
  const structural = under.length ? under[0].low : 0;
  const buffered = zone.low * (1 - Math.max(0.028, tol * 1.4));
  let price = structural > 0 && structural < zone.low ? Math.min(structural, buffered) : buffered;
  const risk = (zone.midpoint - price) / zone.midpoint;
  if (risk > 0.12) price = zone.midpoint * 0.88;
  if (!(price < zone.low)) price = zone.low * 0.97;
  return price;
}

export function buildFomoEntry(input) {
  const now = +((input && input.now) || Date.now());
  const lookback = (input && input.lookback) || "7D";
  const ca = (input && input.ca) || "";
  const barsByTf = (input && input.bars) || {};
  const sliced = sliceLookback(barsByTf, lookback, now);
  for (const tf of sliced.order) sliced.bars[tf] = cleanPrints(sliced.bars[tf]);
  const primaryTf = sliced.order.find((tf) => closedBars(sliced.bars[tf], tf, now).length >= 8) || sliced.order[0];
  const primary = closedBars(sliced.bars[primaryTf] || [], primaryTf, now);
  const allClosed = [];
  for (const tf of sliced.order) allClosed.push(...closedBars(sliced.bars[tf] || [], tf, now));
  const spot =
    +((input && input.spot) || 0) ||
    (primary.length ? +primary[primary.length - 1].c : 0);
  const tol = adaptiveTolerance(primary.length ? primary : allClosed);
  const rawLevels = [];
  for (const tf of sliced.order) {
    rawLevels.push(...levelsForTimeframe(sliced.bars[tf], tf, tol, now));
  }
  let merged = mergeLevels(rawLevels, tol);
  merged = markFlips(merged, primary.length ? primary : [], tol);
  const support = merged
    .filter((l) => l.type === "SUPPORT" || l.flipped)
    .map((l) => decorate(l, spot, lookback))
    .sort((a, b) => b.price - a.price);
  const resistance = merged
    .filter((l) => l.type === "RESISTANCE" && !l.flipped)
    .map((l) => decorate(l, spot, lookback))
    .sort((a, b) => a.price - b.price);
  const candles = {
    count: primary.length,
    primaryTf,
    oldest: primary.length ? primary[0].t : null,
    newestClosed: primary.length ? primary[primary.length - 1].t : null,
    byTf: Object.fromEntries(sliced.order.map((tf) => [tf, closedBars(sliced.bars[tf], tf, now).length])),
  };
  const dataQuality = primary.length >= 30 ? "NORMAL HISTORY" : "LIMITED HISTORY";
  const when = mapEntryWindow(input && input.entryWindow) || { state: "WAIT", label: "WAIT", source: "price" };
  const keyLevels = {
    support: support.filter((l) => (l.price <= spot * 1.002 || l.flipped) && (!spot || l.price >= spot / 20)),
    resistance: resistance.filter((l) => l.price >= spot * 0.998 && (!spot || l.price <= spot * 20)),
  };

  if (primary.length < 12) {
    return {
      ...emptySetup({
        spot,
        dataQuality,
        keyLevels,
        candles,
        when,
        reason: "INSUFFICIENT HISTORY. Levels are not reliable yet.",
      }),
      ca,
      lookback,
      tol,
      quality: "INSUFFICIENT HISTORY",
      status: "INSUFFICIENT HISTORY",
      createdAt: now,
      updatedAt: now,
    };
  }

  const flips = merged
    .filter((l) => l.flipped && l.low <= spot * 1.02 && (l.touchCount >= 2 || l.tfs.length >= 2 || l.strength >= 48))
    .sort((a, b) => Math.abs(a.price - spot) - Math.abs(b.price - spot) || b.price - a.price);
  const nearSupport = support
    .filter((l) => !l.flipped && l.price < spot && (spot - l.price) / spot <= 0.12 && (l.touchCount >= 2 || l.strength >= 50))
    .sort((a, b) => b.price - a.price);

  let anchor = null;
  let setupType = null;
  let reason = "";
  if (flips.length) {
    anchor = flips[0];
    setupType = "BREAKOUT RETEST";
    const tfNote = anchor.tfs.length > 1 ? anchor.tfs.join("+") + " confluence" : anchor.tf + " structure";
    reason = "Prior breakout held as support · " + anchor.touchCount + " touches · " + tfNote;
  } else if (reclaim(primary, nearSupport[0], tol)) {
    anchor = nearSupport[0];
    setupType = "SUPPORT RECLAIM";
    reason = "Price lost this support and closed back above it · " + anchor.touchCount + " touches";
  } else if (nearSupport.length && resistance.length && spot > nearSupport[0].high && (resistance[0].price - spot) / spot < 0.08 && (spot - nearSupport[0].price) / spot > 0.03) {
    anchor = nearSupport[0];
    setupType = "PULLBACK SETUP";
    reason = "Extended off " + anchor.touchCount + "-touch support. Next bid is the cluster, not the high.";
  } else if (resistance.length && spot < resistance[0].low && (resistance[0].price - spot) / spot <= 0.015 && resistance[0].strength >= 40) {
    setupType = "MOMENTUM BREAKOUT";
  } else if (resistance.length && nearSupport.length && spot < resistance[0].price && spot > nearSupport[0].price) {
    const rangeTight = (resistance[0].price - nearSupport[0].price) / spot < 0.18;
    if (rangeTight && resistance[0].touchCount >= 2 && nearSupport[0].touchCount >= 2) {
      setupType = "RANGE BREAKOUT";
    }
  }

  if (setupType === "MOMENTUM BREAKOUT" || setupType === "RANGE BREAKOUT") {
    const triggerLvl = resistance[0];
    return freezeOrFresh(input, {
      ca,
      lookback,
      tol,
      status: "WAITING FOR STRUCTURE",
      setupType,
      quality: primary.length < 30 ? "WEAK · PROVISIONAL" : "MODERATE",
      dataQuality,
      currentPrice: spot,
      entryZone: null,
      breakoutTrigger: {
        price: triggerLvl.price,
        reason: triggerLvl.touchCount + "-touch resistance · not broken on a closed candle",
        strength: triggerLvl.strength,
      },
      targets: [],
      invalidation: null,
      rr: { target1: null, target2: null, target3: null },
      window: { state: "WAIT", label: "WAITING FOR STRUCTURE" },
      when,
      keyLevels,
      candles,
      reason:
        setupType === "RANGE BREAKOUT"
          ? "Still inside the range. Trigger is the resistance. No entry zone until a break and retest."
          : "Price is pressing resistance. No chase, and no entry zone until it breaks and retests.",
      events: [],
      setupId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (!anchor) {
    return freezeOrFresh(
      input,
      {
        ...emptySetup({
          spot,
          dataQuality,
          keyLevels,
          candles,
          when,
          reason: "INSUFFICIENT STRUCTURE. No confluence worth an entry zone.",
        }),
        ca,
        lookback,
        tol,
        status: "WAITING FOR STRUCTURE",
        quality: primary.length < 30 ? "WEAK · PROVISIONAL" : "INSUFFICIENT STRUCTURE",
        createdAt: now,
        updatedAt: now,
      }
    );
  }

  const zone = bandAround(anchor, tol);
  const invalPx = pickInvalidation({ ...zone, midpoint: (zone.low + zone.high) / 2 }, support, tol);
  const midpoint = (zone.low + zone.high) / 2;
  const above = resistance.filter((r) => {
    if (!(r.price > Math.max(spot, zone.high) * 1.004)) return false;
    if (r.strength < 28 || (r.touchCount < 2 && r.tfs.length < 2)) return false;
    const pct = (r.price - midpoint) / midpoint;
    return pct >= 0.025 && pct <= 3;
  });
  const targets = above.slice(0, 3).map((r) => ({
    price: +r.price.toPrecision(6),
    percent: +(((r.price - midpoint) / midpoint) * 100).toFixed(2),
    reason: r.touchCount + "-touch " + r.tfs.join("/") + " resistance",
    strength: r.strength,
    timeframe: r.tfs[0],
  }));
  const rr = {
    target1: targets[0] && targets[0].strength >= 30 ? rrOf(midpoint, invalPx, targets[0].price) : null,
    target2: targets[1] && targets[1].strength >= 30 ? rrOf(midpoint, invalPx, targets[1].price) : null,
    target3: targets[2] && targets[2].strength >= 30 ? rrOf(midpoint, invalPx, targets[2].price) : null,
  };
  const confirm = !!(input && input.confirm) || (when && when.state === "ENTRY_WINDOW_ACTIVE" && when.source === "entry-window" && zoneContains(zone, input.entryWindow && input.entryWindow.level));
  const window = windowFromPrice(spot, zone, invalPx, confirm);
  const id = setupId(ca, lookback, setupType, zone.low, zone.high);
  const setup = {
    ca,
    lookback,
    tol,
    setupId: id,
    status: window.state === "INVALIDATED" ? "INVALIDATED" : window.label,
    setupType,
    quality: "MODERATE",
    dataQuality,
    currentPrice: spot,
    entryZone: {
      low: zone.low,
      high: zone.high,
      midpoint: +midpoint.toPrecision(6),
      reason,
      confidence: anchor.confidence,
      touches: anchor.touchCount,
      confluence: anchor.tfs.length,
      tfs: anchor.tfs,
    },
    breakoutTrigger: targets[0]
      ? { price: targets[0].price, reason: "First resistance above the zone" }
      : { price: null, reason: "No reliable resistance above the zone yet" },
    targets,
    invalidation: {
      price: +invalPx.toPrecision(6),
      percentRisk: +(((midpoint - invalPx) / midpoint) * 100).toFixed(2),
      reason: "Below the entry cluster. A close under this cancels the setup.",
    },
    rr,
    window,
    when,
    keyLevels,
    candles,
    reason,
    events: [],
    createdAt: (input && input.prev && input.prev.createdAt) || now,
    updatedAt: now,
  };
  setup.quality = qualityOf(setup, dataQuality, primary.length);
  if (setup.quality === "WEAK · PROVISIONAL") {
    setup.reason += " Limited history or a thin cluster — recheck as candles print.";
  }
  return freezeOrFresh(input, setup);
}

function zoneContains(zone, level) {
  const lv = +level;
  if (!(lv > 0)) return false;
  return lv >= zone.low * 0.99 && lv <= zone.high * 1.01;
}

function reclaim(bars, level, tol) {
  if (!level || bars.length < 8) return false;
  let lost = false;
  for (const b of bars) {
    if (+b.c < level.low * (1 - tol * 0.2)) lost = true;
    if (lost && +b.c > level.high * (1 + tol * 0.05)) return true;
  }
  return false;
}

function decorate(level, spot, lookback) {
  const distancePct = spot > 0 ? +(((level.price - spot) / spot) * 100).toFixed(2) : null;
  return { ...level, lookback, distancePct };
}

function closeEnough(a, b) {
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(a - b) / a <= 0.012;
}

function lastZoneAt(barsByTf, zone, lookback, now) {
  if (!zone || !(zone.low > 0) || !(zone.high > 0)) return null;
  const tnow = +now || Date.now();
  const sliced = sliceLookback(barsByTf || {}, lookback || "ALL", tnow);
  const tfs = sliced.order.slice();
  Object.keys(barsByTf || {}).forEach(function (tf) {
    if (tfs.indexOf(tf) < 0) tfs.push(tf);
  });
  const rank = { "5m": 1, "15m": 2, "30m": 3, "1h": 4, "2h": 5, "4h": 6, "1d": 7, "1w": 8 };
  let bestOpen = 0;
  let bestAt = 0;
  let bestRank = 99;
  for (const tf of tfs) {
    const ms = tfMs(tf);
    const r = rank[tf] || 9;
    for (const b of sliced.bars[tf] || barsByTf[tf] || []) {
      const t = +b.t;
      if (!(t > 0) || t > tnow + ms) continue;
      const windowMs = lookback === "24H" ? 864e5 : lookback === "7D" ? 7 * 864e5 : lookback === "30D" ? 30 * 864e5 : 0;
      if (windowMs && t < tnow - windowMs) continue;
      const c = +b.c;
      const lo = Math.min(+b.l > 0 ? +b.l : c, c);
      const hi = Math.max(+b.h > 0 ? +b.h : c, c);
      if (!(hi >= zone.low && lo <= zone.high)) continue;
      if (t > bestOpen || (t === bestOpen && r < bestRank)) {
        bestOpen = t;
        bestRank = r;
        bestAt = Math.min(tnow, t + ms);
      }
    }
  }
  return bestAt || null;
}

function withTrigger(setup, input) {
  if (!setup || !setup.entryZone) return setup;
  const at = lastZoneAt((input && input.bars) || {}, setup.entryZone, setup.lookback, setup.updatedAt);
  setup.entryZone = { ...setup.entryZone, triggeredAt: at };
  return setup;
}

function freezeOrFresh(input, fresh) {
  const prev = input && input.prev;
  const now = fresh.updatedAt;
  if (!prev || !prev.setupId || prev.ca !== fresh.ca) {
    if (fresh.entryZone) fresh.events = ["TRADE_SETUP_CREATED"];
    return withTrigger(fresh, input);
  }
  const dead = prev.status === "INVALIDATED" || prev.status === "EXPIRED";
  if (!dead && prev.entryZone && fresh.entryZone && prev.setupType === fresh.setupType && closeEnough(prev.entryZone.midpoint, fresh.entryZone.midpoint)) {
    const kept = {
      ...fresh,
      setupId: prev.setupId,
      entryZone: prev.entryZone,
      invalidation: prev.invalidation,
      targets: prev.targets,
      breakoutTrigger: prev.breakoutTrigger,
      rr: prev.rr,
      setupType: prev.setupType,
      createdAt: prev.createdAt || fresh.createdAt,
      reason: prev.entryZone.reason || fresh.reason,
    };
    const zone = kept.entryZone;
    const inval = kept.invalidation && kept.invalidation.price;
    const confirm =
      !!(input && input.confirm) ||
      (kept.when &&
        kept.when.state === "ENTRY_WINDOW_ACTIVE" &&
        zoneContains(zone, input.entryWindow && input.entryWindow.level));
    kept.window = windowFromPrice(fresh.currentPrice, zone, inval, confirm);
    kept.status = kept.window.state === "INVALIDATED" ? "INVALIDATED" : kept.window.label;
    kept.events = diffEvents(prev, kept);
    const staleMs =
      fresh.lookback === "24H"
        ? 36 * 3600e3
        : fresh.lookback === "7D"
          ? 5 * 24 * 3600e3
          : fresh.lookback === "30D"
            ? 20 * 24 * 3600e3
            : 14 * 24 * 3600e3;
    if (kept.createdAt && now - kept.createdAt > staleMs && kept.window.state === "NO_CHASE" && !(prev.paper && prev.paper.zoneReached)) {
      kept.status = "EXPIRED";
      kept.window = { state: "EXPIRED", label: "EXPIRED" };
      kept.events = [...kept.events, "SETUP_EXPIRED"];
      const again = buildFomoEntry({ ...input, prev: null });
      if (again && again.setupId && again.setupId !== kept.setupId && again.entryZone) {
        again.replacedId = kept.setupId;
        again.events = ["SETUP_EXPIRED", "TRADE_SETUP_CREATED"];
        return again;
      }
    }
    return withTrigger(kept, input);
  }
  if (prev.invalidation && fresh.currentPrice > 0 && fresh.currentPrice < prev.invalidation.price && prev.entryZone) {
    const invalidated = {
      ...prev,
      status: "INVALIDATED",
      window: { state: "INVALIDATED", label: "INVALIDATED" },
      currentPrice: fresh.currentPrice,
      updatedAt: now,
      events: ["INVALIDATION_REACHED"],
      keyLevels: fresh.keyLevels,
      when: fresh.when,
    };
    if (fresh.entryZone && fresh.setupId !== prev.setupId) {
      fresh.replacedId = prev.setupId;
      fresh.events = ["INVALIDATION_REACHED", "TRADE_SETUP_CREATED"];
      return withTrigger(fresh, input);
    }
    return withTrigger(invalidated, input);
  }
  if (fresh.entryZone && fresh.setupId !== prev.setupId) fresh.events = ["TRADE_SETUP_CREATED"];
  return withTrigger(fresh, input);
}

function diffEvents(prev, next) {
  const events = [];
  const was = prev.window && prev.window.state;
  const now = next.window && next.window.state;
  if (was !== now) events.push("ENTRY_WINDOW_STATE_CHANGED");
  if (now === "IN_ZONE" || now === "ENTRY_WINDOW_ACTIVE") {
    if (was !== "IN_ZONE" && was !== "ENTRY_WINDOW_ACTIVE") events.push("ENTRY_ZONE_REACHED");
  }
  if ((was === "IN_ZONE" || was === "ENTRY_WINDOW_ACTIVE") && now !== "IN_ZONE" && now !== "ENTRY_WINDOW_ACTIVE") {
    events.push("ENTRY_ZONE_LEFT");
  }
  const spot = next.currentPrice;
  const trig = next.breakoutTrigger && next.breakoutTrigger.price;
  if (trig && spot >= trig && !(prev.currentPrice >= trig)) events.push("BREAKOUT_TRIGGER_CROSSED");
  (next.targets || []).forEach((t, i) => {
    if (spot >= t.price && !(prev.currentPrice >= t.price)) events.push("TARGET_" + (i + 1) + "_REACHED");
  });
  return events;
}

export function advancePaper(prev, setup, now) {
  const base = prev || {
    setupId: setup.setupId,
    createdAt: setup.createdAt || now,
    mfe: 0,
    mae: 0,
    zoneReached: false,
    windowActivated: false,
    invalidatedFirst: false,
    targetsHit: [],
  };
  if (!setup || !setup.entryZone) return { ...base, state: setup && setup.status };
  const mid = setup.entryZone.midpoint;
  const spot = setup.currentPrice;
  const move = mid > 0 ? ((spot - mid) / mid) * 100 : 0;
  const mfe = Math.max(base.mfe || 0, move);
  const mae = Math.min(base.mae || 0, move);
  const zoneReached = base.zoneReached || (spot >= setup.entryZone.low && spot <= setup.entryZone.high);
  const windowActivated = base.windowActivated || (setup.window && setup.window.state === "ENTRY_WINDOW_ACTIVE");
  const targetsHit = [...(base.targetsHit || [])];
  (setup.targets || []).forEach((t, i) => {
    const name = "T" + (i + 1);
    if (spot >= t.price && !targetsHit.includes(name)) targetsHit.push(name);
  });
  const invalidated = setup.status === "INVALIDATED";
  return {
    ...base,
    setupId: setup.setupId,
    state: setup.status,
    entryZone: setup.entryZone,
    breakoutTrigger: setup.breakoutTrigger,
    invalidation: setup.invalidation,
    targets: setup.targets,
    mfe: +mfe.toFixed(2),
    mae: +mae.toFixed(2),
    zoneReached,
    windowActivated,
    invalidatedFirst: base.invalidatedFirst || (invalidated && !targetsHit.includes("T1")),
    targetsHit,
    updatedAt: now,
  };
}

export function lookbackMs(lookback) {
  if (lookback === "24H") return 24 * 3600e3;
  if (lookback === "7D") return 7 * 24 * 3600e3;
  if (lookback === "30D") return 30 * 24 * 3600e3;
  return null;
}

export const ENGINE = "fomoentry-1";
