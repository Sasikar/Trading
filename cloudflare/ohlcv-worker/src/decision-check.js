/**
 * Decision Check — execution-quality layer.
 * Consumes CA / Entry Window / tick / crash. Not a buy/sell signal.
 */

function pct(n) {
  n = +n;
  if (!Number.isFinite(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

function chk(id, label, state, why, metrics, internal) {
  return { id, label, state, why: why || '', metrics: metrics || {}, internal: internal || '' };
}

export function countLevelTests(bars, level) {
  if (!(+level > 0) || !bars || !bars.length) return 0;
  let n = 0;
  let above = false;
  for (let i = 0; i < bars.length; i++) {
    const a = +bars[i].c >= +level * 0.998;
    if (a && !above) n++;
    above = a;
  }
  return n;
}

export function pickDecisionHit(hitsByTf) {
  const order = ['1h', '4h', '2h', '15m', '5m', '1d', '1w'];
  const rank = {
    ACTIVE: 0,
    RECLAIM: 1,
    RETEST: 2,
    WAIT_RETEST: 3,
    WAIT: 3,
    APPROACHING: 4,
    NO_CHASE: 5,
    INVALIDATED: 6,
    MISSED: 7,
    NEAR: 8,
    EXPIRED: 9,
    WARMING: 10,
    NO_SETUP: 11
  };
  let best = null;
  let bestR = 99;
  for (let i = 0; i < order.length; i++) {
    const h = hitsByTf && hitsByTf[order[i]];
    if (!h) continue;
    const r = rank[(h.ew && h.ew.state) || 'NO_SETUP'] ?? 20;
    if (!best || r < bestR) {
      best = h;
      bestR = r;
    }
  }
  return best || (hitsByTf && hitsByTf['1h']) || {};
}

function htfHeld(hit) {
  const ev = String((hit && hit.event) || '');
  const st = String((hit && hit.state) || '');
  return ev === 'NEW BREAKOUT' || ev === 'BREAKOUT HELD' || st === 'STRONG CONFIRMED' || st === 'EARLY' || st === 'STRETCHED';
}

export function decisionCheck(args) {
  const hit = (args && args.hit) || {};
  const ew = hit.ew || (args && args.ew) || {};
  const entry = hit.entry || {};
  const tick = (args && args.tick) || {};
  const crash = (args && args.crash) || {};
  const hitsByTf = (args && args.hitsByTf) || {};
  const bars5m = (args && args.bars5m) || [];
  const paper = (args && args.paper) || [];
  const now = +((args && args.now) || Date.now());
  const tickT = +tick.t || 0;
  const tickAgeMin = tickT ? Math.max(0, (now - tickT) / 60000) : null;
  const level = +ew.level || +hit.level || 0;
  const spot = +ew.spot || +hit.spot || +tick.price || 0;
  const extPct = ew.extPct != null ? +ew.extPct : level > 0 && spot > 0 ? ((spot - level) / level) * 100 : null;
  const ageBars = hit.age == null ? null : +hit.age;
  const tf = String(hit.tf || '').toUpperCase();
  const ewState = String(ew.state || '');
  const volX = hit.volX != null ? +hit.volX : 0;
  const liq = +tick.liq || 0;
  const m5 = +tick.m5 || 0;
  const h1 = +tick.h1 || 0;
  const checks = [];

  const noSetup = !ewState || ewState === 'NO_SETUP' || ewState === 'WARMING';
  const near = ewState === 'NEAR';
  const invalidated = ewState === 'INVALIDATED' || entry.paint === 'FAILED';
  const stretchedEw = ewState === 'NO_CHASE' || entry.paint === 'EXTENDED' || hit.state === 'STRETCHED';
  const liveSetup = !noSetup && !near && ewState !== 'MISSED';

  // A. Entry extension — reuse EW / entryQuality / CA stretch
  if (!liveSetup && !stretchedEw) {
    checks.push(chk('extension', 'Entry extension', 'UNAVAILABLE', 'No printed breakout location yet.', { extPct }, ''));
  } else if (stretchedEw || (extPct != null && extPct >= 10)) {
    checks.push(
      chk(
        'extension',
        'Entry extension',
        'WAIT',
        'Price has moved quickly since breakout' + (extPct != null ? ' (' + pct(extPct) + ' from level)' : '') + '.',
        { extPct, ew: ewState },
        'BLUNDER_FOMO'
      )
    );
  } else if (extPct != null && extPct >= 5) {
    checks.push(
      chk(
        'extension',
        'Entry extension',
        'CHECK',
        'Price is ' + pct(extPct) + ' from the breakout level.',
        { extPct },
        'BLUNDER_FOMO'
      )
    );
  } else {
    checks.push(chk('extension', 'Entry extension', 'CLEAR', 'Location is still near the printed level.', { extPct }, ''));
  }

  // B. Late entry
  const ageMin = ageBars != null && tf ? ageBars * (tf === '5M' ? 5 : tf === '15M' ? 15 : tf === '1H' ? 60 : tf === '2H' ? 120 : tf === '4H' ? 240 : 0) : null;
  if (!liveSetup) {
    checks.push(chk('lateEntry', 'Breakout age', 'UNAVAILABLE', 'No breakout age to review.', {}, ''));
  } else if (ageMin != null && ageMin >= 20 && extPct != null && extPct >= 8) {
    checks.push(
      chk(
        'lateEntry',
        'Breakout age',
        'WAIT',
        'Breakout age ' + Math.round(ageMin) + 'm · price from breakout ' + pct(extPct) + '. Extended entry location.',
        { ageMin, extPct },
        'BLUNDER_LATE_ENTRY'
      )
    );
  } else if (ageMin != null && ageMin >= 15 && extPct != null && extPct >= 4) {
    checks.push(
      chk(
        'lateEntry',
        'Breakout age',
        'CHECK',
        'Breakout age ' + Math.round(ageMin) + 'm · price from breakout ' + pct(extPct) + '.',
        { ageMin, extPct },
        'BLUNDER_LATE_ENTRY'
      )
    );
  } else {
    checks.push(
      chk(
        'lateEntry',
        'Breakout age',
        'CLEAR',
        ageMin != null ? 'Breakout age ' + Math.round(ageMin) + 'm.' : 'Age still short.',
        { ageMin, extPct },
        ''
      )
    );
  }

  // C. Breakout stability — reuse CA event + EW
  if (invalidated) {
    checks.push(chk('stability', 'Breakout stability', 'WAIT', 'Price moved back below the breakout level.', { ew: ewState }, 'BLUNDER_FAKEOUT'));
  } else if (ewState === 'WAIT_RETEST' || ewState === 'APPROACHING' || hit.event === 'NEW BREAKOUT') {
    checks.push(chk('stability', 'Breakout stability', 'CHECK', 'Developing — follow-through still forming.', { event: hit.event, ew: ewState }, ''));
  } else if (hit.state === 'STRONG CONFIRMED' || ewState === 'ACTIVE' || ewState === 'RECLAIM') {
    checks.push(chk('stability', 'Breakout stability', 'CLEAR', 'Stable — level is being held.', { event: hit.event, ew: ewState }, ''));
  } else if (liveSetup && volX < 0.7) {
    checks.push(chk('stability', 'Breakout stability', 'CHECK', 'Needs confirmation — volume vs usual 5m is still light.', { volX }, ''));
  } else if (noSetup) {
    checks.push(chk('stability', 'Breakout stability', 'UNAVAILABLE', 'No breakout to score.', {}, ''));
  } else {
    checks.push(chk('stability', 'Breakout stability', 'CLEAR', 'No rejection print on this snapshot.', { event: hit.event }, ''));
  }

  // D. Fakeout / rejection
  if (invalidated || ewState === 'MISSED') {
    checks.push(
      chk(
        'fakeout',
        'Reclaim',
        'WAIT',
        invalidated ? 'Price moved back below the breakout level.' : 'Break printed after the window closed.',
        { ew: ewState },
        'BLUNDER_FAKEOUT'
      )
    );
  } else {
    checks.push(chk('fakeout', 'Reclaim', liveSetup ? 'CLEAR' : 'UNAVAILABLE', liveSetup ? 'Level has not been lost on this snapshot.' : 'No reclaim to review.', {}, ''));
  }

  // E. Fast move — reuse Dex % already on the tick
  if (m5 >= 10 || h1 >= 20 || (args && args.parabolic && args.parabolic.on)) {
    checks.push(
      chk(
        'fastMove',
        'Fast move',
        'CHECK',
        'Price is moving significantly faster than its recent baseline. Dex 5m ' + pct(m5) + ' · 1h ' + pct(h1) + '.',
        { m5, h1 },
        'BLUNDER_FAST'
      )
    );
  } else {
    checks.push(chk('fastMove', 'Fast move', 'CLEAR', 'Pace is within a normal range on this snapshot.', { m5, h1 }, ''));
  }

  // F. Liquidity / slippage — reuse tick.liq + crash.liqShock
  if (!(liq > 0)) {
    checks.push(chk('liquidity', 'Execution quality', 'UNAVAILABLE', 'No pool liquidity on this snapshot.', {}, ''));
  } else if (crash.liqShock || crash.status === 'AVOID') {
    checks.push(
      chk(
        'liquidity',
        'Execution quality',
        'WAIT',
        crash.liqShock ? 'Liquidity dropped vs the last poll. Slippage may be higher.' : 'Crash surveillance is on AVOID — execution conditions are poor.',
        { liq, status: crash.status },
        'BLUNDER_LIQUIDITY'
      )
    );
  } else if (liq < 15000) {
    checks.push(chk('liquidity', 'Execution quality', 'CHECK', 'Reduced liquidity. Size with care — this is an estimate, not exact slippage.', { liq }, 'BLUNDER_LIQUIDITY'));
  } else if (liq < 50000 && +tick.vol24h > liq * 8) {
    checks.push(chk('liquidity', 'Execution quality', 'CHECK', 'Volume is large vs pool size. Higher slippage potential (estimate).', { liq, vol24h: tick.vol24h }, 'BLUNDER_LIQUIDITY'));
  } else {
    checks.push(chk('liquidity', 'Execution quality', 'CLEAR', 'Liquidity looks normal on this snapshot.', { liq }, ''));
  }

  // G. HTF conflict — reuse CA states across TFs
  const st15 = htfHeld(hitsByTf['15m'] || hitsByTf['5m']);
  const st1h = htfHeld(hitsByTf['1h']);
  const st4h = htfHeld(hitsByTf['4h'] || hitsByTf['2h']);
  const st1d = htfHeld(hitsByTf['1d']);
  if (!hitsByTf['1h'] && !hitsByTf['4h']) {
    checks.push(chk('htf', 'HTF context', 'UNAVAILABLE', 'Higher-timeframe tape not loaded.', {}, ''));
  } else if ((st15 || st1h) && !st4h && hitsByTf['4h'] && (hitsByTf['4h'].state === 'WATCH' || hitsByTf['4h'].ew && hitsByTf['4h'].ew.state === 'NO_SETUP')) {
    checks.push(
      chk(
        'htf',
        'HTF context',
        'CHECK',
        'Short-term momentum and higher-timeframe structure are not aligned.',
        { st15, st1h, st4h, st1d },
        'BLUNDER_HTF'
      )
    );
  } else {
    checks.push(chk('htf', 'HTF context', 'CLEAR', 'No material higher-timeframe conflict on this snapshot.', { st15, st1h, st4h, st1d }, ''));
  }

  // H. Market context — only if provided
  const mkt = (args && args.market) || null;
  if (!mkt || mkt.h1 == null) {
    checks.push(chk('market', 'Market context', 'UNAVAILABLE', 'Broader market tape not attached to this snapshot.', {}, ''));
  } else if (+mkt.h1 <= -4 && h1 >= 6) {
    checks.push(chk('market', 'Market context', 'CHECK', 'Selected asset is moving higher while the broader market is weakening.', { mktH1: mkt.h1, h1 }, ''));
  } else {
    checks.push(chk('market', 'Market context', 'CLEAR', 'No material market conflict on this snapshot.', { mktH1: mkt.h1 }, ''));
  }

  // I. Repeated tests
  const attempts = countLevelTests(bars5m, level);
  if (!(level > 0)) {
    checks.push(chk('attempts', 'Breakout attempts', 'UNAVAILABLE', 'No level to count tests.', {}, ''));
  } else if (attempts >= 3) {
    checks.push(chk('attempts', 'Breakout attempts', 'CHECK', 'Price has tested this level multiple times (' + attempts + ').', { attempts }, ''));
  } else {
    checks.push(chk('attempts', 'Breakout attempts', 'CLEAR', attempts ? attempts + ' test(s) on the 5m tape.' : 'No repeated tests counted.', { attempts }, ''));
  }

  // J. Recent activity from EW paper / last alerts
  const lastPaper = paper.filter((p) => String(p.ca || '').toLowerCase() === String(hit.ca || '').toLowerCase()).slice(-1)[0];
  if (lastPaper && lastPaper.at && now - +lastPaper.at < 2 * 3600e3) {
    const mins = Math.max(1, Math.round((now - +lastPaper.at) / 60000));
    checks.push(chk('recent', 'Recent activity', 'CHECK', 'Previous window activity ' + mins + 'm ago.', { mins }, ''));
  } else {
    checks.push(chk('recent', 'Recent activity', 'UNAVAILABLE', 'No recent window activity stored.', {}, ''));
  }

  const ranked = { WAIT: 0, CHECK: 1, CLEAR: 2, UNAVAILABLE: 3 };
  const material = checks.filter((c) => c.state === 'WAIT' || c.state === 'CHECK');
  let overall = 'CLEAR';
  if (material.some((c) => c.state === 'WAIT')) overall = 'WAIT';
  else if (material.some((c) => c.state === 'CHECK')) overall = 'CHECK';

  let action = 'NO ACTION NEEDED';
  if (overall === 'WAIT' && (stretchedEw || (extPct != null && extPct >= 10))) action = 'WAIT FOR RESET';
  else if (overall === 'WAIT' && invalidated) action = 'WAIT FOR CONFIRMATION';
  else if (overall === 'WAIT' && (crash.liqShock || crash.status === 'AVOID')) action = 'REVIEW LIQUIDITY';
  else if (overall === 'WAIT') action = 'WAIT';
  else if (overall === 'CHECK' && stretchedEw) action = 'WAIT FOR RESET';
  else if (overall === 'CHECK') action = 'MONITOR';

  const data = {
    state: tickAgeMin != null && tickAgeMin <= 8 ? 'CLEAR' : tickAgeMin != null ? 'CHECK' : 'UNAVAILABLE',
    why:
      tickAgeMin != null
        ? tickAgeMin <= 8
          ? 'Fresh Dex snapshot.'
          : 'Spot snapshot is ' + Math.round(tickAgeMin) + 'm old.'
        : 'No Dex snapshot yet.',
    tickAgeMin,
    tfs: Object.keys(hitsByTf || {})
  };
  if (overall === 'WAIT' && data.state === 'UNAVAILABLE') {
    /* missing data must not drive WAIT by itself — already gated per check */
  }

  const attention = material.map((c) => ({ id: c.id, label: c.label, state: c.state, why: c.why }));
  const suggested = action;

  return {
    overall,
    action: suggested,
    tf: hit.tf || '',
    caState: hit.state || '',
    ewState,
    ewLabel: ew.label || '',
    extPct,
    spot,
    level,
    m5,
    h1,
    volX,
    liq,
    checks,
    attention,
    data,
    note: 'Decision Check is not a buy or sell. CA / Entry Window still decide setup and location.'
  };
}

export function decisionActionOf(card) {
  return (card && card.action) || 'NO ACTION NEEDED';
}
