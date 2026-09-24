/**
 * API-only Worker. Does NOT host GitHub Pages. No login gate.
 */
import { Engine, MemoryStore, handleApi, CORS, json, AUTO_EVERY_MS } from './engine.js';
import { coinsAndCommon } from './fomo-wallets.js';
import { buysFromHeliusTx, parseHeliusPayload, mergeEvents, scoreCoins, overlapOnly, watchSet, HELIUS_BUYS_KEY, HELIUS_SEEN_KEY } from './helius-coins.js';
import { syncHeliusWebhook, HELIUS_HOOK_ID_KEY } from './helius-sync.js';
import { notifyNewOverlap } from './helius-tg.js';
import { scanOldTick, readOldCoins, OLD_SCAN_AT_KEY } from './helius-old.js';
import { lookupBuy } from './helius-lookup.js';
import { pumpfunFeed } from './pumpfun.js';
import { scanTiers } from './tiers.js';

const _snapshotWallets = Engine.prototype.snapshotWallets;
Engine.prototype.snapshotWallets = function snapshotWalletsWithCommon() {
  const snap = _snapshotWallets.call(this) || {};
  let holdMap = {};
  try {
    holdMap = JSON.parse(this.store.getMeta('fomo_hold') || '{}') || {};
  } catch (e) {
    holdMap = {};
  }
  let heliusBuys = [];
  try {
    heliusBuys = JSON.parse(this.store.getMeta(HELIUS_BUYS_KEY) || '[]') || [];
  } catch (e) {
    heliusBuys = [];
  }
  const heliusBuyRows = (heliusBuys || []).filter((r) => r && r.side !== 'sell');
  const extra = coinsAndCommon(holdMap, snap.leaders || [], (snap.buys || []).concat(heliusBuyRows));
  const scored = overlapOnly(scoreCoins(heliusBuyRows));
  snap.coins = scored.length ? scored : extra.coins || [];
  snap.common = extra.common || [];
  snap.heliusEvents = heliusBuyRows.length;
  snap.oldCoins = readOldCoins(this.store);
  snap.oldAt = +this.store.getMeta(OLD_SCAN_AT_KEY) || 0;
  snap.note =
    'Coins = overlap buys. Old Coins = holdings 5+ wallets and MC $1M+. Not a buy list.';
  return snap;
};

function storeFromSql(sql) {
  try {
    const has = [...sql.exec("SELECT 1 AS n FROM sqlite_master WHERE type='table' AND name='meta' LIMIT 1")];
    if (!has.length) {
      sql.exec(`
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS ticks (
      ca TEXT PRIMARY KEY, t INTEGER, price REAL, vol5m REAL, vol1h REAL, vol24h REAL,
      buys5m INTEGER, sells5m INTEGER, liq REAL, m5 REAL, h1 REAL, h6 REAL, h24 REAL,
      pairAddress TEXT, dexUrl TEXT, chain TEXT, name TEXT
    );
    CREATE TABLE IF NOT EXISTS open_bar (
      ca TEXT, tf TEXT, t INTEGER, o REAL, h REAL, l REAL, c REAL,
      vol REAL, buys INTEGER, sells INTEGER, n INTEGER,
      PRIMARY KEY (ca, tf)
    );
    CREATE TABLE IF NOT EXISTS ohlcv (
      ca TEXT, tf TEXT, t INTEGER, o REAL, h REAL, l REAL, c REAL,
      vol REAL, buys INTEGER, sells INTEGER, n INTEGER,
      PRIMARY KEY (ca, tf, t)
    );
    CREATE TABLE IF NOT EXISTS alerts (k TEXT PRIMARY KEY, t INTEGER);
    CREATE TABLE IF NOT EXISTS watch (
      ca TEXT PRIMARY KEY, chain TEXT, name TEXT, poolAddress TEXT
    );
  `);
    }
  } catch (e) {}
  try { sql.exec('ALTER TABLE ticks ADD COLUMN mcap REAL'); } catch (e) {}
  const one = (q, ...b) => { try { const it = sql.exec(q, ...b); for (const row of it) return row; } catch (e) {} return null; };
  const all = (q, ...b) => { try { return [...sql.exec(q, ...b)]; } catch (e) { return []; } };
  const metaMem = new Map();
  const tickMem = new Map();
  const openMem = new Map();
  let watchJson = null;
  let lastOpenFlush = 0;
  return {
    getMeta(k) {
      if (metaMem.has(k)) return metaMem.get(k);
      const r = one('SELECT v FROM meta WHERE k = ?', k);
      const v = r ? r.v : undefined;
      if (v !== undefined) metaMem.set(k, v);
      return v;
    },
    setMeta(k, v) {
      const s = String(v ?? '');
      if (metaMem.get(k) === s) return;
      metaMem.set(k, s);
      try { sql.exec('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', k, s); } catch (e) {}
    },
    getTick(ca) {
      const k = ca.toLowerCase();
      if (tickMem.has(k)) return tickMem.get(k);
      const r = one('SELECT * FROM ticks WHERE ca = ?', k);
      if (r) tickMem.set(k, r);
      return r || undefined;
    },
    setTick(ca, tick) {
      const k = ca.toLowerCase();
      tickMem.set(k, tick);
      try {
        sql.exec(`INSERT OR REPLACE INTO ticks (ca,t,price,vol5m,vol1h,vol24h,buys5m,sells5m,liq,m5,h1,h6,h24,pairAddress,dexUrl,chain,name,mcap) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, k, tick.t, tick.price, tick.vol5m, tick.vol1h, tick.vol24h, tick.buys5m, tick.sells5m, tick.liq, tick.m5, tick.h1, tick.h6, tick.h24, tick.pairAddress || '', tick.dexUrl || '', tick.chain || '', tick.name || '', +tick.mcap || 0);
      } catch (e) {
        try {
          sql.exec(`INSERT OR REPLACE INTO ticks (ca,t,price,vol5m,vol1h,vol24h,buys5m,sells5m,liq,m5,h1,h6,h24,pairAddress,dexUrl,chain,name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, k, tick.t, tick.price, tick.vol5m, tick.vol1h, tick.vol24h, tick.buys5m, tick.sells5m, tick.liq, tick.m5, tick.h1, tick.h6, tick.h24, tick.pairAddress || '', tick.dexUrl || '', tick.chain || '', tick.name || '');
        } catch (e2) {}
      }
    },
    allTicks() { return all('SELECT * FROM ticks'); },
    setWatch(rows) {
      const j = JSON.stringify(rows || []);
      if (j === watchJson) return;
      watchJson = j;
      try {
        sql.exec('DELETE FROM watch');
        for (const r of rows || []) sql.exec('INSERT OR REPLACE INTO watch (ca, chain, name, poolAddress) VALUES (?,?,?,?)', r.ca, r.chain, r.name || '', r.poolAddress || '');
      } catch (e) {}
    },
    getWatch() {
      if (watchJson) { try { const cached = JSON.parse(watchJson); if (cached && cached.length) return cached; } catch (e) {} }
      const rows = all('SELECT ca, chain, name, poolAddress FROM watch');
      if (rows && rows.length) { watchJson = JSON.stringify(rows); return rows; }
      return [];
    },
    openBar(ca, tf) {
      const k = ca.toLowerCase() + '|' + tf;
      if (openMem.has(k)) return openMem.get(k);
      const r = one('SELECT * FROM open_bar WHERE ca = ? AND tf = ?', ca.toLowerCase(), tf) || undefined;
      if (r) openMem.set(k, r);
      return r;
    },
    setOpenBar(ca, tf, bar) { openMem.set(ca.toLowerCase() + '|' + tf, bar); },
    closeBar(ca, tf, bar) {
      const k = ca.toLowerCase() + '|' + tf;
      openMem.delete(k);
      sql.exec(`INSERT OR REPLACE INTO ohlcv (ca,tf,t,o,h,l,c,vol,buys,sells,n) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, ca.toLowerCase(), tf, bar.t, bar.o, bar.h, bar.l, bar.c, bar.vol, bar.buys, bar.sells, bar.n);
      sql.exec('DELETE FROM open_bar WHERE ca = ? AND tf = ?', ca.toLowerCase(), tf);
    },
    insertBar(ca, tf, bar) {
      const r = one('SELECT t FROM ohlcv WHERE ca = ? AND tf = ? AND t = ?', ca.toLowerCase(), tf, bar.t);
      if (r) return false;
      sql.exec(`INSERT OR REPLACE INTO ohlcv (ca,tf,t,o,h,l,c,vol,buys,sells,n) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, ca.toLowerCase(), tf, bar.t, bar.o, bar.h, bar.l, bar.c, bar.vol || 0, bar.buys || 0, bar.sells || 0, bar.n || 1);
      return true;
    },
    flushOpens(now) {
      now = now || Date.now();
      if (now - lastOpenFlush < 5 * 60e3) return;
      lastOpenFlush = now;
      for (const [k, bar] of openMem) {
        const i = k.indexOf('|');
        const tf = k.slice(i + 1);
        if (tf === '1m' || tf === '1d' || tf === '1w' || tf === '1M') continue;
        sql.exec(`INSERT OR REPLACE INTO open_bar (ca,tf,t,o,h,l,c,vol,buys,sells,n) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, k.slice(0, i), k.slice(i + 1), bar.t, bar.o, bar.h, bar.l, bar.c, bar.vol, bar.buys, bar.sells, bar.n);
      }
    },
    bars(ca, tf, limit) {
      return all('SELECT * FROM ohlcv WHERE ca = ? AND tf = ? ORDER BY t DESC LIMIT ?', ca.toLowerCase(), tf, limit || 40).reverse();
    },
    prune(now) {
      sql.exec("DELETE FROM ohlcv WHERE tf = '1m' AND t < ?", now - 7 * 86400e3);
      sql.exec("DELETE FROM ohlcv WHERE tf IN ('5m','10m','15m','30m') AND t < ?", now - 30 * 86400e3);
      sql.exec("DELETE FROM ohlcv WHERE tf IN ('1d','1w','1M') AND t < ?", now - 730 * 86400e3);
    },
    getAlert(key) { const r = one('SELECT t FROM alerts WHERE k = ?', key); return r ? r.t : 0; },
    setAlert(key, t) {
      const r = one('SELECT t FROM alerts WHERE k = ?', key);
      if (r && r.t === t) return;
      sql.exec('INSERT OR REPLACE INTO alerts (k, t) VALUES (?, ?)', key, t);
    }
  };
}

export class OhlcvEngine {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  boot() {
    if (this.engine) return;
    try {
      this.sql = this.ctx.storage.sql;
      this.store = storeFromSql(this.sql);
      this.engine = new Engine(this.store, this.env);
    } catch (e) {
      this.store = new MemoryStore();
      this.engine = new Engine(this.store, this.env);
      this.engine.lastErr = 'sqlite: ' + String(e && e.message ? e.message : e).slice(0, 120);
    }
  }
  async ensureAlarm() {
    const next = await this.ctx.storage.getAlarm();
    const now = Date.now();
    if (!next || next <= now + 2000) await this.ctx.storage.setAlarm(now + (AUTO_EVERY_MS || 300000));
  }
  async alarm() {
    try { this.boot(); await this.engine.tick('auto'); } catch (e) {
      try { if (this.engine) this.engine.lastErr = String(e && e.message ? e.message : e); } catch (e2) {}
    }
    try { await this.ctx.storage.setAlarm(Date.now() + (AUTO_EVERY_MS || 300000)); } catch (e3) {}
  }
  leadersNow() {
    let leaders = [];
    try { leaders = JSON.parse(this.store.getMeta('fomo_leaders') || '[]') || []; } catch (e) {}
    if (!leaders.length) {
      try { leaders = (this.engine.snapshotWallets() || {}).leaders || []; } catch (e2) {}
    }
    return leaders;
  }
  async handleHelius(request) {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      let n = 0;
      try { n = (JSON.parse(this.store.getMeta(HELIUS_BUYS_KEY) || '[]') || []).length; } catch (e) {}
      const wantSync = url.searchParams.get('sync') === '1';
      let sync = { skipped: !wantSync };
      if (wantSync) {
        const id = this.store.getMeta(HELIUS_HOOK_ID_KEY) || '';
        sync = await syncHeliusWebhook(this.env, this.leadersNow(), id);
        if (sync.webhookId) this.store.setMeta(HELIUS_HOOK_ID_KEY, sync.webhookId);
      }
      return new Response(JSON.stringify({
        ok: true,
        path: '/helius',
        events: n,
        hasKey: !!(this.env && this.env.HELIUS_API_KEY),
        sync
      }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...CORS, 'content-type': 'application/json' } });
    }
    let body = null;
    try { body = await request.json(); } catch (e) {
      return new Response(JSON.stringify({ ok: true, ingested: 0 }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
    }
    const leaders = this.leadersNow();
    const watch = watchSet(leaders);
    const txs = parseHeliusPayload(body);
    const incoming = [];
    for (let i = 0; i < txs.length; i++) incoming.push(...buysFromHeliusTx(txs[i], watch));
    let prev = []; let seen = [];
    try { prev = JSON.parse(this.store.getMeta(HELIUS_BUYS_KEY) || '[]') || []; } catch (e) {}
    try { seen = JSON.parse(this.store.getMeta(HELIUS_SEEN_KEY) || '[]') || []; } catch (e) {}
    const merged = mergeEvents(prev, incoming, seen);
    this.store.setMeta(HELIUS_BUYS_KEY, JSON.stringify(merged.events));
    this.store.setMeta(HELIUS_SEEN_KEY, JSON.stringify(merged.seen));
    if (incoming.length) {
      const scored = overlapOnly(scoreCoins(merged.events));
      try { this.ctx.waitUntil(notifyNewOverlap(this.env, this.store, scored)); } catch (e) {}
    }
    return new Response(JSON.stringify({ ok: true, ingested: incoming.length, stored: merged.events.length }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
  }
  async handleBuyLookup(request) {
    const url = new URL(request.url);
    const wallet = (url.searchParams.get('wallet') || '').trim();
    const q = (url.searchParams.get('q') || url.searchParams.get('coin') || url.searchParams.get('mint') || '').trim();
    let out;
    try {
      out = await lookupBuy(this.env, wallet, q);
    } catch (e) {
      out = { ok: false, error: String(e && e.message ? e.message : e).slice(0, 200) };
    }
    return new Response(JSON.stringify(out), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
  }
  async handlePumpfun() {
    let out;
    try {
      out = await pumpfunFeed();
    } catch (e) {
      out = { ok: false, coins: [], error: String(e && e.message ? e.message : e).slice(0, 160) };
    }
    return new Response(JSON.stringify(out), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
  }
  async fetch(request) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (path === '/health' || path === '/api/health') {
      return new Response(JSON.stringify({ ok: true, engine: 'ohlcv', ts: new Date().toISOString() }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
    }
    if (path === '/nasdaq' || path === '/api/nasdaq') {
      try {
        const q = await nasdaqLive();
        return new Response(JSON.stringify(q), { status: 200, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 160) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
    }
    try {
      this.boot();
      if (path !== '/holders' && path !== '/api/holders') {
        try { await this.ensureAlarm(); } catch (e) {}
      }
      if (path === '/helius' || path === '/api/helius') return this.handleHelius(request);
      if (path === '/buy-lookup' || path === '/api/buy-lookup') return this.handleBuyLookup(request);
      if (path === '/pumpfun' || path === '/api/pumpfun') return this.handlePumpfun();
      if (path === '/oldcoins' || path === '/api/oldcoins') {
        const want = new URL(request.url).searchParams.get('scan') === '1';
        if (want) {
          const r = await scanOldTick(this.env, this.store, this.leadersNow());
          return new Response(JSON.stringify(r), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({ ok: true, coins: readOldCoins(this.store), at: +this.store.getMeta(OLD_SCAN_AT_KEY) || 0 }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
      const out = await handleApi(this.engine, request);
      return new Response(out.body, { status: out.status, headers: out.headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: String(e && e.stack ? e.stack : e) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
    }
  }
}

let ndxCache = { at: 0, body: null };

function ndxNum(s) {
  const n = parseFloat(String(s == null ? '' : s).replace(/[%,$]/g, '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function nasdaqLive() {
  if (ndxCache.body && Date.now() - ndxCache.at < 20000) return ndxCache.body;
  let out = null;
  try {
    const res = await fetch('https://api.nasdaq.com/api/quote/COMP/info?assetclass=index', {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
        Origin: 'https://www.nasdaq.com',
        Referer: 'https://www.nasdaq.com/'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const j = await res.json();
      const p = j && j.data && j.data.primaryData;
      const price = ndxNum(p && p.lastSalePrice);
      if (price != null) {
        out = {
          symbol: '^IXIC',
          name: 'NASDAQ',
          price,
          chg: ndxNum(p.netChange),
          pct: ndxNum(p.percentageChange),
          updated: Date.now(),
          source: 'nasdaq.com',
          live: true
        };
      }
    }
  } catch (e) {}
  if (!out) {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?interval=1m&range=1d', {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error('nasdaq ' + res.status);
    const meta = (await res.json()).chart.result[0].meta;
    const price = +meta.regularMarketPrice;
    const prev = +(meta.previousClose || meta.chartPreviousClose || price);
    const chg = price - prev;
    out = {
      symbol: '^IXIC',
      name: 'NASDAQ',
      price,
      chg,
      pct: prev ? (chg / prev) * 100 : 0,
      updated: Date.now(),
      source: 'yahoo',
      live: true
    };
  }
  ndxCache = { at: Date.now(), body: out };
  return out;
}

function stub(request) {
  return new Request('https://ohlcv.local' + new URL(request.url).pathname + new URL(request.url).search, request);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (path === '/tiers' || path === '/api/tiers') {
      const mint = (new URL(request.url).searchParams.get('mint') || '').trim();
      try {
        const data = await scanTiers(env, mint);
        return new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 180) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
    }
    return env.ENGINE.get(env.ENGINE.idFromName('main')).fetch(stub(request));
  },
  async scheduled(event, env, ctx) {
    const stubId = env.ENGINE.get(env.ENGINE.idFromName('main'));
    ctx.waitUntil(stubId.fetch(new Request('https://ohlcv.local/status')));
    ctx.waitUntil(stubId.fetch(new Request('https://ohlcv.local/helius?sync=1')));
    ctx.waitUntil(stubId.fetch(new Request('https://ohlcv.local/oldcoins?scan=1')));
  }
};

export { MemoryStore, Engine, json };
