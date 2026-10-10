/** Same Early / Strong / Watch / Off gate as the CA tab. */
const CA_STRONG_MIN_CONFIRMS = 6;

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  const ag = gains / period, al = losses / period;
  if (al === 0) return 100;
  return 100 - (100 / (1 + ag / al));
}
function emaArr(closes, n) {
  const o = [], k = 2 / (n + 1);
  let prev = null;
  for (let i = 0; i < closes.length; i++) {
    if (prev == null) {
      if (i < n - 1) { o.push(null); continue; }
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += closes[j];
      prev = s / n;
      o.push(prev);
      continue;
    }
    prev = closes[i] * k + prev * (1 - k);
    o.push(prev);
  }
  return o;
}
function calcMACDSeries(closes, times) {
  function _ema(arr, n) {
    const o = [], k = 2 / (n + 1);
    let prev = null;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] == null) { o.push(null); continue; }
      if (prev == null) {
        let s = 0, c = 0;
        for (let j = 0; j <= i; j++) if (arr[j] != null) { s += arr[j]; c++; }
        if (c < n) { o.push(null); continue; }
        prev = s / c;
        o.push(prev);
        continue;
      }
      prev = arr[i] * k + prev * (1 - k);
      o.push(prev);
    }
    return o;
  }
  const e12 = _ema(closes, 12), e26 = _ema(closes, 26);
  const macdLine = closes.map((_, i) => (e12[i] != null && e26[i] != null) ? e12[i] - e26[i] : null);
  const signal = _ema(macdLine.map((v) => v == null ? 0 : v), 9);
  const hist = [], ml = [], sl = [];
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] == null || signal[i] == null || times[i] == null) continue;
    const h = macdLine[i] - signal[i];
    hist.push({ value: h });
    ml.push({ value: macdLine[i] });
    sl.push({ value: signal[i] });
  }
  const last = hist.length ? hist[hist.length - 1] : null;
  const prev = hist.length > 1 ? hist[hist.length - 2] : null;
  return {
    lastHist: last ? last.value : null,
    prevHist: prev ? prev.value : null,
    lastMacd: ml.length ? ml[ml.length - 1].value : null,
    lastSig: sl.length ? sl[sl.length - 1].value : null
  };
}
function mgClamp(x, a, b) { a = a == null ? -1 : a; b = b == null ? 1 : b; return Math.max(a, Math.min(b, x)); }
function mgSign(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }
function mgMomScore(pack) {
  if (!pack || pack.lastMacd == null || pack.lastSig == null || pack.lastHist == null) return 0;
  let s = 0;
  if (pack.lastMacd > pack.lastSig && pack.lastHist > 0) s = 0.8;
  else if (pack.lastMacd < pack.lastSig && pack.lastHist < 0) s = -0.8;
  const fresh = pack.prevHist != null && ((pack.prevHist < 0 && pack.lastHist >= 0) || (pack.prevHist >= 0 && pack.lastHist < 0));
  if (fresh) s = mgClamp(s + 0.2 * mgSign(pack.lastHist));
  return s;
}
function calcCVD(kl) {
  let cvd = 0;
  const out = [];
  for (const k of kl) {
    const o = +k[1], h = +k[2], l = +k[3], c = +k[4], v = +k[5] || 0;
    let delta = 0;
    if (h > l) delta = ((c - o) / (h - l)) * v;
    else delta = c >= o ? v : -v;
    cvd += delta;
    out.push({ cvd });
  }
  return out;
}
function coinBreakoutAge(kl) {
  const n = kl.length;
  if (n < 25) return { age: 99, fresh: false, held: false };
  const closes = kl.map((k) => +k[4]);
  const highs = kl.map((k) => +k[2]);
  let rh = -Infinity;
  for (let i = n - 22; i <= n - 3; i++) if (i >= 0) rh = Math.max(rh, highs[i]);
  if (!isFinite(rh)) rh = highs[n - 3];
  const c0 = closes[n - 1];
  const heldRolling = c0 >= rh * 0.997;
  let firstIdx = null;
  const lookStart = Math.max(22, n - 20);
  for (let i = lookStart; i < n; i++) {
    let prevH = -Infinity;
    for (let j = i - 21; j <= i - 2; j++) if (j >= 0) prevH = Math.max(prevH, highs[j]);
    if (!isFinite(prevH)) continue;
    if (closes[i] > prevH && c0 >= prevH * 0.997) {
      if (firstIdx == null) firstIdx = i;
    }
  }
  const age = firstIdx != null ? (n - 1 - firstIdx) : 99;
  const fresh = heldRolling && firstIdx != null && age <= 2;
  return { age, fresh, held: heldRolling };
}

export function barsToKl(bars) {
  return (bars || []).map((b) => [+b.t, +b.o, +b.h, +b.l, +b.c, +(b.vol || 0)]).filter((k) => isFinite(k[0]) && isFinite(k[4]));
}

export function caEntryState(kl, tfLabel) {
  const tf = String(tfLabel || '4h').toLowerCase();
  try {
    if (!kl || kl.length < 20) return 'WATCH';
    const closes = kl.map((k) => +k[4]).filter((x) => isFinite(x) && x > 0);
    if (closes.length < 20) return 'WATCH';
    const spot = closes[closes.length - 1];
    const highs = kl.map((k) => +k[2]);
    const lows = kl.map((k) => +k[3]);
    const vols = kl.map((k) => +k[5] || 0);
    const rsi = calcRSI(closes, 14);
    let pack = null, mScore = 0, hist = null, macdBull = false, macdBear = false;
    try {
      pack = calcMACDSeries(closes, kl.slice(-closes.length).map((k) => Math.floor(+k[0] / 1000)));
      mScore = mgMomScore(pack);
      hist = pack && pack.lastHist;
      const macd = pack && pack.lastMacd, sig = pack && pack.lastSig;
      if (macd != null && sig != null) {
        if (hist != null) {
          macdBull = macd > sig && hist > 0;
          macdBear = macd < sig && hist < 0;
        } else {
          macdBull = macd > sig;
          macdBear = macd < sig;
        }
      }
    } catch (e) {}
    const lastV = vols[vols.length - 1];
    const avg = vols.slice(-21, -1).reduce((s, x) => s + x, 0) / Math.max(1, Math.min(20, vols.length - 1));
    const vRatio = avg ? lastV / avg : 1;
    let cvdSlope = 0;
    try {
      const cvd = calcCVD(kl);
      if (cvd.length > 5) cvdSlope = cvd[cvd.length - 1].cvd - cvd[cvd.length - 6].cvd;
    } catch (e) {}
    const e20 = emaArr(closes, Math.min(20, closes.length - 1));
    const e50 = emaArr(closes, Math.min(50, closes.length - 1));
    const a20 = e20[e20.length - 1], a50 = e50[e50.length - 1];
    const aboveEma50Pct = (a50 != null && a50 > 0) ? ((spot / a50) - 1) * 100 : null;
    const trendUp = a20 != null && spot > a20 && (a50 == null || a20 >= a50 * 0.998);
    const trendDn = a20 != null && spot < a20 && (a50 == null || a20 <= a50 * 1.002);
    const lb = Math.min(40, closes.length);
    const mid = Math.floor(lb / 2);
    const hSlice = highs.slice(-lb), lSlice = lows.slice(-lb), cSlice = closes.slice(-lb);
    const hh = Math.max.apply(null, hSlice.slice(mid)) > Math.max.apply(null, hSlice.slice(0, mid));
    const hl = Math.min.apply(null, lSlice.slice(mid)) > Math.min.apply(null, lSlice.slice(0, mid));
    const lh = Math.max.apply(null, hSlice.slice(mid)) < Math.max.apply(null, hSlice.slice(0, mid));
    const ll = Math.min.apply(null, lSlice.slice(mid)) < Math.min.apply(null, lSlice.slice(0, mid));
    const hardBreak = cSlice[cSlice.length - 1] < Math.min.apply(null, lSlice.slice(0, -2)) * 0.99
      && cSlice[cSlice.length - 2] < Math.min.apply(null, lSlice.slice(0, -2)) * 0.99;
    let structScore = 0.1;
    if (hardBreak) structScore = -1;
    else if (hh && hl) structScore = 0.85;
    else if (lh && ll) structScore = -0.25;
    const brk = coinBreakoutAge(kl);
    let consUp = 0;
    for (let i = closes.length - 1; i >= 1; i--) { if (closes[i] >= closes[i - 1]) consUp++; else break; }
    let lo10 = Infinity;
    for (let i = Math.max(0, kl.length - 11); i < kl.length - 1; i++) lo10 = Math.min(lo10, +kl[i][3]);
    const gain10 = lo10 > 0 && isFinite(lo10) ? ((spot / lo10) - 1) * 100 : 0;
    const emaExtFailThr = tf === '1w' ? 55 : (tf === '1d' ? 50 : 40);
    const emaStretchThr = tf === '1w' ? 90 : (tf === '1d' ? 80 : 70);
    let stretched = false;
    if (rsi != null && rsi >= 78) stretched = true;
    else if (aboveEma50Pct != null && aboveEma50Pct >= 10 && rsi != null && rsi >= 75) stretched = true;
    else if (rsi != null && rsi >= 72 && consUp >= 3) stretched = true;
    else if (gain10 >= 45 && consUp >= 3 && rsi != null && rsi >= 65) stretched = true;
    else if (aboveEma50Pct != null && aboveEma50Pct >= emaStretchThr) stretched = true;
    let extensionFail = stretched;
    if (!extensionFail && aboveEma50Pct != null && aboveEma50Pct >= emaExtFailThr) extensionFail = true;
    const gStructure = structScore >= 0.35 && !hardBreak;
    const gTrend = trendUp && !trendDn;
    const gMomentum = macdBull || mScore >= 0.2;
    const gBreakout = !!(brk.fresh && brk.held);
    const gVolume = vRatio >= 0.85;
    const gCvd = cvdSlope >= 0;
    const gExtension = !stretched && !extensionFail;
    const gMemeEnv = !hardBreak && vRatio >= 0.5 && structScore > -0.5;
    const confirms = [gStructure, gTrend, gMomentum, gBreakout, gVolume, gCvd, gExtension, gMemeEnv].filter(Boolean).length;
    const majorOk = gStructure && gTrend;
    const inFresh = brk.fresh && brk.age <= 2;
    if (hardBreak || (trendDn && macdBear && structScore <= -0.2)) return 'OFF';
    if (macdBear && cvdSlope < 0 && vRatio < 0.45 && !inFresh) return 'OFF';
    if (stretched && (!inFresh || (rsi != null && rsi >= 78))) return 'STRETCHED';
    if (majorOk && gBreakout && confirms >= CA_STRONG_MIN_CONFIRMS && gMomentum && gMemeEnv && gExtension && !stretched) return 'STRONG CONFIRMED';
    const earlyStruct = structScore >= -0.05 && !hardBreak;
    const earlyTrend = trendUp || (a20 != null && spot > a20);
    const earlyMom = macdBull || mScore >= 0.15;
    const earlyVol = vRatio >= 0.7;
    if (earlyStruct && earlyTrend && earlyMom && earlyVol && inFresh && brk.age <= 2 && !stretched && !(rsi != null && rsi >= 78)) return 'EARLY';
    return 'WATCH';
  } catch (e) {
    return 'WATCH';
  }
}
