import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TF_SEC,
  EW_SETUP_TFS,
  EW_OPEN_MS,
  detectTapeBreakout,
  resolveEwEpisode,
  entryWindow,
  entryQuality,
  Engine,
  MemoryStore,
  fmtUsdCompact,
  alertPxMcLine
} from './engine.js';

const CA = 'Ai66catebreakoutxxxxxxxxxxxxxxxxxxxxxxxxpump';

function tfMs(tf) {
  return (TF_SEC[tf] || 3600) * 1000;
}

function priorBars(tf, high, n, t0) {
  const step = tfMs(tf);
  const bars = [];
  for (let i = 0; i < n; i++) {
    const t = t0 + i * step;
    bars.push({ t, o: high * 0.9, h: high, l: high * 0.8, c: high * 0.92, vol: 10 });
  }
  return bars;
}

function strictBreakBars(tf, high) {
  const n = 24;
  const t0 = 1_700_000_000_000;
  const bars = priorBars(tf, high, n, t0);
  const t = t0 + n * tfMs(tf);
  bars.push({
    t,
    o: high * 1.001,
    h: high * 1.004,
    l: high * 0.999,
    c: high * 1.003,
    vol: 30
  });
  return { bars, t0, breakT: t, high };
}

function heldBarsOnly(tf, high) {
  const n = 24;
  const t0 = 1_700_000_000_000;
  const bars = priorBars(tf, high, n, t0);
  const t = t0 + n * tfMs(tf);
  bars.push({
    t,
    o: high * 0.999,
    h: high * 1.001,
    l: high * 0.99,
    c: high * 0.996,
    vol: 8
  });
  return { bars, breakT: t, high };
}

function tickAt(price, t) {
  return {
    t,
    price,
    m5: 0.5,
    h1: 1,
    h6: 2,
    h24: 3,
    vol5m: 1,
    vol1h: 2,
    vol24h: 10,
    buys5m: 4,
    sells5m: 3,
    liq: 1e6,
    name: 'CATE',
    chain: 'solana'
  };
}

function seedEngine(tf, bars, price, t) {
  const store = new MemoryStore();
  const row = { ca: CA, chain: 'solana', name: 'CATE' };
  store.setWatch([row]);
  for (const b of bars) store.insertBar(CA, tf, b);
  store.setTick(CA, tickAt(price, t));
  const engine = new Engine(store, {});
  return { store, engine, row };
}

for (const tf of EW_SETUP_TFS) {
  test(tf + ': strict NEW BREAKOUT → WAIT FOR RETEST', () => {
    const { bars, breakT, high } = strictBreakBars(tf, 0.08433);
    const now = breakT + tfMs(tf) + 1000;
    const det = detectTapeBreakout(bars, tf, tickAt(high * 1.003, now));
    assert.equal(det.event, 'NEW BREAKOUT');
    assert.equal(det.strict, true);
    const r = resolveEwEpisode({ ca: CA, tf, det, prev: null, dead: [], now });
    assert.equal(r.action, 'open');
    const ew = entryWindow({
      hit: { tf, level: det.level, spot: high * 1.003, event: det.event, section: 'live', volX: 1, m5: 0.5 },
      episode: r.ep,
      bars5m: [],
      bars1h: [],
      bars4h: bars,
      bars1d: [],
      barsTf: bars
    });
    assert.equal(ew.state, 'WAIT_RETEST');
  });

  test(tf + ': breakout candle cannot become ACTIVE', () => {
    const { bars, breakT, high } = strictBreakBars(tf, 0.08433);
    const now = breakT + tfMs(tf) + 1000;
    const det = detectTapeBreakout(bars, tf, tickAt(high * 1.003, now));
    const r = resolveEwEpisode({ ca: CA, tf, det, prev: null, dead: [], now });
    const entry = { paint: 'WINDOW' };
    const ew = entryWindow({
      hit: {
        tf,
        level: det.level,
        spot: high * 1.003,
        event: 'NEW BREAKOUT',
        section: 'live',
        volX: 2,
        m5: 3,
        entry
      },
      episode: r.ep,
      bars5m: [],
      barsTf: bars
    });
    assert.notEqual(ew.state, 'ACTIVE');
    assert.equal(ew.state, 'WAIT_RETEST');
  });

  test(tf + ': leave → RETEST → RECLAIM → ACTIVE', () => {
    const { bars, breakT, high } = strictBreakBars(tf, 0.08433);
    const now = breakT + tfMs(tf) + 1000;
    const det = detectTapeBreakout(bars, tf, tickAt(high * 1.003, now));
    const r = resolveEwEpisode({ ca: CA, tf, det, prev: null, dead: [], now });
    const ep = Object.assign({}, r.ep, { left: true });
    const bars5 = [
      { t: now - 600000, o: high, h: high * 1.03, l: high * 0.99, c: high * 1.02, vol: 20 },
      { t: now - 300000, o: high * 1.01, h: high * 1.02, l: high * 0.994, c: high * 0.999, vol: 20 },
      { t: now - 60000, o: high * 0.994, h: high * 1.005, l: high * 0.993, c: high * 1.001, vol: 20 }
    ];
    const retest = entryWindow({
      hit: { tf, level: high, spot: high * 1.005, event: 'NEW BREAKOUT', section: 'live', volX: 1, m5: 0.5, entry: { paint: 'WATCH' } },
      episode: ep,
      bars5m: bars5,
      barsTf: bars
    });
    assert.equal(retest.state, 'RECLAIM');
    const active = entryWindow({
      hit: { tf, level: high, spot: high * 1.005, event: 'NEW BREAKOUT', section: 'live', volX: 1.2, m5: 0.5, entry: { paint: 'WINDOW' } },
      episode: ep,
      bars5m: bars5,
      barsTf: bars
    });
    assert.equal(active.state, 'ACTIVE');
  });

  test(tf + ': two 5m closes below → INVALIDATED', () => {
    const { bars, breakT, high } = strictBreakBars(tf, 0.08433);
    const now = breakT + tfMs(tf) + 1000;
    const det = detectTapeBreakout(bars, tf, tickAt(high * 0.99, now));
    const r = resolveEwEpisode({ ca: CA, tf, det, prev: null, dead: [], now });
    const bars5 = [
      { t: now - 600000, o: high, h: high, l: high * 0.9, c: high * 0.99, vol: 10 },
      { t: now - 300000, o: high * 0.99, h: high, l: high * 0.9, c: high * 0.98, vol: 10 }
    ];
    const eq = entryQuality({
      tf,
      level: high,
      event: 'NEW BREAKOUT',
      section: 'live',
      tick: tickAt(high * 0.99, now),
      bars5m: bars5,
      bars1m: [
        { t: now - 60000, o: 1, h: 1, l: 1, c: 1, vol: 1 },
        { t: now - 120000, o: 1, h: 1, l: 1, c: 1, vol: 1 },
        { t: now - 180000, o: 1, h: 1, l: 1, c: 1, vol: 1 },
        { t: now - 240000, o: 1, h: 1, l: 1, c: 1, vol: 1 },
        { t: now - 300000, o: 1, h: 1, l: 1, c: 1, vol: 1 },
        { t: now - 360000, o: 1, h: 1, l: 1, c: 1, vol: 1 },
        { t: now - 420000, o: 1, h: 1, l: 1, c: 1, vol: 1 },
        { t: now - 480000, o: 1, h: 1, l: 1, c: 1, vol: 1 }
      ],
      volX: 1,
      buyR: 1
    });
    assert.equal(eq.paint, 'FAILED');
    const ew = entryWindow({
      hit: { tf, level: high, spot: high * 0.99, event: 'NEW BREAKOUT', section: 'live', entry: eq },
      episode: r.ep,
      bars5m: bars5,
      barsTf: bars
    });
    assert.equal(ew.state, 'INVALIDATED');
  });

  test(tf + ': invalidated + restart remains INVALIDATED', () => {
    const { bars, breakT, high } = strictBreakBars(tf, 0.08433);
    const now = breakT + tfMs(tf) + 1000;
    const { store, engine, row } = seedEngine(tf, bars, high * 1.003, now);
    engine.evaluateRow(row, tf, '');
    const live = engine.ewEpisodeOf(CA, tf);
    assert.ok(live);
    live.invalidated = true;
    live.state = 'INVALIDATED';
    const map = engine.ewEpisodeMap();
    map[engine.ewEpisodeKey(CA, tf)] = live;
    store.setMeta('ew_ep', JSON.stringify(map));
    engine.commitEwEpisode(CA, tf, { ep: live, action: 'keep-dead' }, { ew: { state: 'INVALIDATED' } });
    const engine2 = new Engine(store, {});
    const later = now + 3 * 3600e3;
    store.setTick(CA, tickAt(high * 1.07, later));
    const hit = engine2.evaluateRow(row, tf, '');
    assert.equal(hit.ew.state, 'INVALIDATED');
  });

  test(tf + ': metadata loss fail closed (old bar, no dead/ep)', () => {
    const { bars, breakT, high } = strictBreakBars(tf, 0.08433);
    const now = breakT + tfMs(tf) + 3 * 3600e3;
    const det = detectTapeBreakout(bars, tf, tickAt(high * 1.003, now));
    const r = resolveEwEpisode({ ca: CA, tf, det, prev: null, dead: [], now });
    assert.equal(r.action, 'missed');
    assert.equal(r.ep, null);
    const ew = entryWindow({
      hit: { tf, level: det.level, spot: high * 1.005, event: det.event, section: 'live' },
      episode: r.ep,
      action: r.action,
      barsTf: bars
    });
    assert.equal(ew.state, 'MISSED');
    assert.equal(ew.label, 'BREAKOUT MISSED');
    assert.notEqual(ew.state, 'NO_SETUP');
    assert.notEqual(ew.state, 'ACTIVE');
    assert.notEqual(ew.state, 'RETEST');
    assert.notEqual(ew.state, 'RECLAIM');
    assert.notEqual(ew.state, 'WAIT_RETEST');
  });

  test(tf + ': genuine breakout outside freshness → BREAKOUT MISSED, not chase', () => {
    const { bars, breakT, high } = strictBreakBars(tf, 0.08395);
    const now = breakT + tfMs(tf) + EW_OPEN_MS + 1000;
    const det = detectTapeBreakout(bars, tf, tickAt(0.08587, now));
    assert.equal(det.event, 'NEW BREAKOUT');
    assert.equal(det.strict, true);
    const r = resolveEwEpisode({ ca: CA, tf, det, prev: null, dead: [], now });
    assert.equal(r.action, 'missed');
    const ew = entryWindow({
      hit: { tf, level: det.level, spot: 0.08587, event: 'NEW BREAKOUT', section: 'live' },
      episode: r.ep,
      action: r.action
    });
    assert.equal(ew.state, 'MISSED');
    assert.equal(ew.label, 'BREAKOUT MISSED');
    assert.notEqual(ew.state, 'NO_SETUP');
    assert.notEqual(ew.state, 'RETEST');
    assert.notEqual(ew.state, 'RECLAIM');
    assert.notEqual(ew.state, 'ACTIVE');
  });

  test(tf + ': no genuine breakout stays NO BREAKOUT', () => {
    const { bars, high } = heldBarsOnly(tf, 0.08395);
    const last = bars[bars.length - 1];
    const now = last.t + tfMs(tf) + 1000;
    const det = detectTapeBreakout(bars, tf, tickAt(last.c, now));
    const r = resolveEwEpisode({ ca: CA, tf, det, prev: null, dead: [], now });
    assert.equal(r.action, 'none');
    const ew = entryWindow({
      hit: { tf, level: det.level || high, spot: last.c, event: det.event, section: '' },
      episode: r.ep,
      action: r.action
    });
    assert.ok(ew.state === 'NO_SETUP' || ew.state === 'NEAR' || ew.state === 'WARMING');
    assert.notEqual(ew.state, 'MISSED');
    assert.notEqual(ew.state, 'WAIT_RETEST');
  });

  test(tf + ': invalidated + level moves >1% stays dead', () => {
    const { bars, breakT, high } = strictBreakBars(tf, 0.08433);
    const now = breakT + tfMs(tf) + 1000;
    const det0 = detectTapeBreakout(bars, tf, tickAt(high * 1.003, now));
    const opened = resolveEwEpisode({ ca: CA, tf, det: det0, prev: null, dead: [], now });
    const deadEp = Object.assign({}, opened.ep, { invalidated: true, state: 'INVALIDATED' });
    const drifted = Object.assign({}, det0, { level: high * 1.03, event: 'BREAKOUT HELD', strict: false });
    const r = resolveEwEpisode({ ca: CA, tf, det: drifted, prev: deadEp, dead: [deadEp], now: now + 3600e3 });
    assert.equal(r.action, 'keep-dead');
    assert.equal(r.ep.invalidated, true);
    const ew = entryWindow({
      hit: { tf, level: drifted.level, spot: high * 1.07, event: 'BREAKOUT HELD', section: 'matured' },
      episode: r.ep
    });
    assert.equal(ew.state, 'INVALIDATED');
    assert.ok(Math.abs(ew.level - high) < 1e-8);
  });

  test(tf + ': invalidated + price later above old level stays dead', () => {
    const high = 0.08433;
    const ep = {
      id: 'x',
      ca: CA,
      tf,
      level: high,
      barT: 1,
      invalidated: true,
      state: 'INVALIDATED'
    };
    const ew = entryWindow({
      hit: { tf, level: high, spot: 0.09007, event: 'NEW BREAKOUT', section: 'live' },
      episode: ep
    });
    assert.equal(ew.state, 'INVALIDATED');
    assert.notEqual(ew.state, 'RECLAIM');
    assert.notEqual(ew.state, 'ACTIVE');
  });

  test(tf + ': BREAKOUT HELD cannot create/resurrect episode', () => {
    const { bars, high } = heldBarsOnly(tf, 0.08433);
    const last = bars[bars.length - 1];
    const now = last.t + tfMs(tf) + 1000;
    const det = detectTapeBreakout(bars, tf, tickAt(last.c, now));
    assert.notEqual(det.event, 'NEW BREAKOUT');
    const r = resolveEwEpisode({ ca: CA, tf, det, prev: null, dead: [], now });
    assert.equal(r.action, 'none');
    const dead = {
      id: 'old',
      ca: CA,
      tf,
      level: high,
      barT: last.t - tfMs(tf),
      invalidated: true
    };
    const r2 = resolveEwEpisode({ ca: CA, tf, det, prev: dead, dead: [dead], now });
    assert.equal(r2.action, 'keep-dead');
  });

  test(tf + ': genuine new strict breakout creates a new episode', () => {
    const { bars, breakT, high } = strictBreakBars(tf, 0.08433);
    const now = breakT + tfMs(tf) + 1000;
    const det0 = detectTapeBreakout(bars, tf, tickAt(high * 1.003, now));
    const first = resolveEwEpisode({ ca: CA, tf, det: det0, prev: null, dead: [], now });
    const dead = Object.assign({}, first.ep, { invalidated: true });
    const laterBars = bars.map((b) => Object.assign({}, b));
    const newT = breakT + tfMs(tf);
    laterBars.push({
      t: newT,
      o: high * 1.04,
      h: high * 1.06,
      l: high * 1.03,
      c: high * 1.05,
      vol: 40
    });
    const now2 = newT + tfMs(tf) + 1000;
    const det1 = detectTapeBreakout(laterBars, tf, tickAt(high * 1.05, now2));
    assert.equal(det1.strict, true);
    assert.equal(det1.event, 'NEW BREAKOUT');
    const second = resolveEwEpisode({ ca: CA, tf, det: det1, prev: dead, dead: [dead], now: now2 });
    assert.equal(second.action, 'open');
    assert.notEqual(second.ep.id, dead.id);
    assert.equal(second.ep.invalidated, false);
    const spot = second.ep.level * 1.002;
    const ew = entryWindow({
      hit: { tf, level: second.ep.level, spot, event: 'NEW BREAKOUT', section: 'live' },
      episode: second.ep
    });
    assert.equal(ew.state, 'WAIT_RETEST');
  });
}

test('EW_SETUP_TFS matches Entry Window supported list', () => {
  assert.deepEqual(EW_SETUP_TFS, ['5m', '15m', '1h', '2h', '4h', '1d', '1w']);
});

test('EW_OPEN_MS is 20 minutes fixed for every EW TF', () => {
  assert.equal(EW_OPEN_MS, 20 * 60e3);
  for (const tf of EW_SETUP_TFS) {
    const { bars, breakT, high } = strictBreakBars(tf, 0.08395);
    const inside = breakT + tfMs(tf) + EW_OPEN_MS - 1000;
    const outside = breakT + tfMs(tf) + EW_OPEN_MS + 1000;
    const detIn = detectTapeBreakout(bars, tf, tickAt(0.08587, inside));
    const detOut = detectTapeBreakout(bars, tf, tickAt(0.08587, outside));
    assert.equal(resolveEwEpisode({ ca: CA, tf, det: detIn, prev: null, dead: [], now: inside }).action, 'open');
    assert.equal(resolveEwEpisode({ ca: CA, tf, det: detOut, prev: null, dead: [], now: outside }).action, 'missed');
  }
});

test('CATE 2H example: LIVE break, freshness expired → BREAKOUT MISSED not NO BREAKOUT', () => {
  const tf = '2h';
  const { bars, breakT } = strictBreakBars(tf, 0.08395);
  const now = breakT + tfMs(tf) + EW_OPEN_MS + 60e3;
  const det = detectTapeBreakout(bars, tf, tickAt(0.08587, now));
  assert.equal(det.event, 'NEW BREAKOUT');
  const r = resolveEwEpisode({ ca: CA, tf, det, prev: null, dead: [], now });
  const ew = entryWindow({
    hit: { tf, level: 0.08395, spot: 0.08587, event: 'NEW BREAKOUT', section: 'live' },
    episode: r.ep,
    action: r.action
  });
  assert.equal(r.action, 'missed');
  assert.equal(ew.state, 'MISSED');
  assert.equal(ew.label, 'BREAKOUT MISSED');
  assert.match(ew.why, /not opened in time/i);
});

test('alert line shows current price and compact MC', () => {
  assert.equal(fmtUsdCompact(1.081e9), '$1.08B');
  assert.equal(fmtUsdCompact(12.4e6), '$12.4M');
  assert.equal(fmtUsdCompact(8500), '$8.5k');
  assert.equal(fmtUsdCompact(0), '—');
  assert.equal(alertPxMcLine({ spot: 0.1701, mcap: 2.4e6 }), 'Price 0.1701 · MC $2.40M');
});
