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
import { scanBundle } from './bundle.js';
import { scanFlows } from './flows.js';
import { scanWallet, readWallets, writeWallets, scanSells, tickSells, readChart, writeChartPoint } from './coinstats.js';
import { applySnapshot, tierDailyTick } from './tier-history.js';
import { readFomoEntry, writeFomoEntry, pushFomoGithub, readFomoState } from './fomo-entry.js';
import { readFomoExperiences, writeFomoExperiences } from './fomo-experiences.js';
import { readFavDips, writeFavDips } from './fav-dips.js';
import { readFavSupports } from './fav-support.js';

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
      if (path === '/tier-hist' || path === '/api/tier-hist') {
        const url = new URL(request.url);
        if (url.searchParams.get('tick') === '1') {
          const r = await tierDailyTick(this.env, this.store);
          return new Response(JSON.stringify(r), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
        const body = await request.json();
        const history = applySnapshot(this.store, body);
        return new Response(JSON.stringify(history), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
      if (path === '/tier-notes' || path === '/api/tier-notes') {
        const url = new URL(request.url);
        const mint = (url.searchParams.get('mint') || '').trim();
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
          return new Response(JSON.stringify({ ok: false, error: 'Paste a Solana token address.' }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const note = writeNote(this.store, mint, body || {});
          return new Response(JSON.stringify({ ok: true, ...note }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({ ok: true, ...readNote(this.store, mint) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
      if (path === '/fomo-entry' || path === '/api/fomo-entry') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const items = writeFomoEntry(this.store, body.items || []);
          let github = false;
          try { github = await pushFomoGithub(this.env, items); } catch (e) { github = false; }
          return new Response(JSON.stringify({ ok: true, items: items, github: github }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
        const state = readFomoState(this.store);
        return new Response(JSON.stringify({ ok: true, items: state.items, saved: state.saved }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
      if (path === '/fomo-experiences' || path === '/api/fomo-experiences') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const items = writeFomoExperiences(this.store, body.items || []);
          return new Response(JSON.stringify({ ok: true, items: items, saved: true }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
        const exp = readFomoExperiences(this.store);
        return new Response(JSON.stringify({ ok: true, items: exp.items, saved: exp.saved }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
      if (path === '/fav-dips' || path === '/api/fav-dips') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const items = writeFavDips(this.store, body.items || []);
          return new Response(JSON.stringify({ ok: true, items: items, saved: true }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
        const dips = readFavDips(this.store);
        return new Response(JSON.stringify({ ok: true, items: dips.items, saved: dips.saved }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
      if (path === '/fav-supports' || path === '/api/fav-supports') {
        const board = readFavSupports(this.store);
        return new Response(JSON.stringify({ ok: true, ...board }), { status: 200, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
      }
      if (path === '/coinstats' || path === '/api/coinstats') {
        const wallet = (new URL(request.url).searchParams.get('wallet') || '').trim();
        try {
          const data = await scanWallet(this.env, wallet, this.store);
          return new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
        } catch (e) {
          const message = String(e && e.message ? e.message : e);
          const error = /max usage reached|not valid JSON/i.test(message) ? 'Helius daily limit is used up. Try again later.' : message.slice(0, 180);
          return new Response(JSON.stringify({ ok: false, error: error }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
      }
      if (path === '/coinstats-wallets' || path === '/api/coinstats-wallets') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const wallets = writeWallets(this.store, body.wallets || []);
          return new Response(JSON.stringify({ ok: true, wallets: wallets }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({ ok: true, wallets: readWallets(this.store) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
      if (path === '/coinstats-chart' || path === '/api/coinstats-chart') {
        const url = new URL(request.url);
        const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
        const mint = String(body.mint || url.searchParams.get('mint') || '').trim();
        try {
          if (request.method === 'POST') {
            const series = writeChartPoint(this.store, mint, body || {});
            return new Response(JSON.stringify({ ok: true, series: series }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
          }
          return new Response(JSON.stringify({ ok: true, series: readChart(this.store, mint) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 180) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
      }
      if (path === '/coinstats-sells' || path === '/api/coinstats-sells') {
        const url = new URL(request.url);
        if (url.searchParams.get('tick') === '1') {
          const row = await tickSells(this.env, this.store);
          return new Response(JSON.stringify(row), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
        const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
        const mint = String(body.mint || url.searchParams.get('mint') || '').trim();
        const wallets = body.wallets || String(url.searchParams.get('wallets') || '').split(',').filter(Boolean);
        try {
          const row = await scanSells(this.env, this.store, mint, wallets);
          return new Response(JSON.stringify({ ok: true, ...row }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 180) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
      }
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


function whaleModelText(result) {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';
  const direct = result.response || result.description || result.result || result.output;
  if (typeof direct === 'string') return direct;
  if (direct && typeof direct === 'object' && typeof direct.response === 'string') return direct.response;
  try { return JSON.stringify(direct != null ? direct : result); } catch (e) { return ''; }
}

function looseObject(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const body = raw.slice(start, end + 1);
  const fixed = body
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
    .replace(/,\s*([}\]])/g, '$1');
  for (const item of [body, fixed]) {
    try { return JSON.parse(item); } catch (e) {}
  }
  return null;
}

function pushWhaleRow(rows, seen, addr, pct, amount, value) {
  addr = String(addr || '').replace(/\s+/g, '').replace(/\u2026/g, '...');
  amount = String(amount || '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9]{2,14}\.\.\.[A-Za-z0-9]{2,14}$/.test(addr)) return;
  const num = amount.match(/^(\d+(?:\.\d+)?)([KMB])$/i);
  if (!num) return;
  const key = addr.toLowerCase();
  if (seen[key]) return;
  seen[key] = 1;
  rows.push({
    addr,
    pct: pct === '' || pct == null || !isFinite(Number(pct)) ? null : Number(pct),
    amount: num[1] + num[2].toUpperCase(),
    value: String(value || '').replace(/\s+/g, '')
  });
}

function lineWallets(text) {
  const rows = [];
  const seen = {};
  const pending = [];
  String(text || '').split(/\n/).forEach((line) => {
    const addrM = line.match(/[A-Za-z0-9]{2,14}(?:\.{2,3}|\u2026)[A-Za-z0-9]{2,14}/);
    if (!addrM) return;
    const after = line.slice(addrM.index + addrM[0].length).replace(/\$\s*[0-9.,]+\s*[KMB]?/gi, ' ');
    const amounts = [];
    const re = /(\d+(?:\.\d+)?)\s*([KMB])\b/gi;
    let m;
    while ((m = re.exec(after))) amounts.push(m[1] + m[2].toUpperCase());
    if (!amounts.length) return;
    let pct = '';
    const pctM = after.match(/(\d+(?:\.\d+)?)\s*%/);
    if (pctM) pct = pctM[1];
    else {
      const bare = after.match(/(\d+(?:\.\d+)?)(?!\s*[KMB])/i);
      if (bare && Number(bare[1]) > 0 && Number(bare[1]) <= 100) pct = bare[1];
    }
    const val = line.match(/\$\s*[0-9.,]+\s*[KMB]?/i);
    pending.push({
      addr: addrM[0].replace(/\u2026/g, '...'),
      pct,
      amounts,
      value: val ? val[0].replace(/\s+/g, '') : ''
    });
  });
  const freq = {};
  pending.forEach((row) => row.amounts.forEach((a) => { freq[a] = (freq[a] || 0) + 1; }));
  let supply = '';
  Object.keys(freq).forEach((k) => {
    if (freq[k] >= 3 && freq[k] > (freq[supply] || 0)) supply = k;
  });
  pending.forEach((row) => {
    const holding = row.amounts.find((a) => a !== supply) || row.amounts[0];
    pushWhaleRow(rows, seen, row.addr, row.pct, holding, row.value);
  });
  return rows;
}

function rowsFromWhaleText(text) {
  const parsed = looseObject(text);
  const fromLines = lineWallets(text);
  const fromJson = [];
  const seen = {};
  const list = parsed && (parsed.rows || parsed.wallets);
  if (Array.isArray(list)) {
    list.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      pushWhaleRow(fromJson, seen, row.addr || row.address || row.wallet, row.pct != null ? row.pct : row.percent, row.amount || row.holding || row.tokens, row.value || row.usd);
    });
  }
  function score(rows) {
    return rows.reduce((n, row) => n + 10 + (/\d\.\d/.test(row.amount) ? 3 : 0) + (row.pct ? 1 : 0), 0);
  }
  const rows = score(fromLines) >= score(fromJson) ? fromLines : fromJson;
  let holders = parsed && Number(parsed.holders);
  let coin = parsed && parsed.coin ? String(parsed.coin) : '';
  const raw = String(text || '');
  if (!holders) {
    const hm = raw.match(/holders[^\d]{0,24}(\d{1,3}(?:,\d{3})+|\d{3,8})/i);
    if (hm) holders = Number(String(hm[1]).replace(/,/g, ''));
  }
  if (!coin) {
    const cm = raw.match(/coin\s*[:\-]?\s*([A-Za-z0-9][^\n|]{1,32})/i);
    if (cm) coin = cm[1].trim();
  }
  return {
    rows,
    holders: Number(holders) || 0,
    coin: coin.replace(/\s+/g, ' ').trim().slice(0, 40)
  };
}

async function runWhaleVision(env, model, image, prompt) {
  const dataUrl = 'data:image/jpeg;base64,' + image;
  const attempts = [
    {
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }],
      max_tokens: 1600
    },
    {
      messages: [
        { role: 'system', content: 'You copy holder tables exactly. No markdown.' },
        { role: 'user', content: prompt }
      ],
      image: dataUrl,
      max_tokens: 1600
    }
  ];
  let last = 'AI reader failed';
  for (const input of attempts) {
    try {
      const result = await env.AI.run(model, input);
      const text = whaleModelText(result);
      if (text && text.length > 12) return text;
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      last = msg.slice(0, 160);
      if (/5016|submit the prompt|hereby agree/i.test(msg)) {
        try { await env.AI.run(model, { prompt: 'agree' }); } catch (e) {}
        try {
          const result = await env.AI.run(model, input);
          const text = whaleModelText(result);
          if (text && text.length > 12) return text;
        } catch (e2) {
          last = String(e2 && e2.message ? e2.message : e2).slice(0, 160);
        }
      }
    }
  }
  throw new Error(last);
}

async function readWhaleShot(env, image) {
  const prompt = 'Copy the Holders table you see. Do not reuse this example. First line: holders 12345. Second line: coin Example. Then one wallet per line, amount is the token holding not the dollar value: AbC1...xYz9 | 1.25 | 12.3M | $50.0K. Ignore the supply number repeated beside the grey bar. Do not invent rows.';
  const models = ['@cf/meta/llama-3.2-11b-vision-instruct', '@cf/meta/llama-4-scout-17b-16e-instruct'];
  let text = '';
  let raw = '';
  let last = 'Could not read wallets in that screenshot';
  for (const model of models) {
    try {
      text = await runWhaleVision(env, model, image, prompt);
      const shot = rowsFromWhaleText(text);
      if (shot.rows.length >= 3) return { coin: shot.coin, holders: shot.holders, rows: shot.rows.slice(0, 20) };
      raw = text.slice(0, 700);
    } catch (err) {
      last = String(err && err.message ? err.message : err).slice(0, 160);
      if (err && err.raw) raw = String(err.raw).slice(0, 700);
    }
  }
  const err = new Error(/json|double-quoted|position \d+/i.test(last) ? 'Could not read wallets in that screenshot' : last);
  err.raw = raw;
  throw err;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (path === '/tiers' || path === '/api/tiers') {
      const mint = (new URL(request.url).searchParams.get('mint') || '').trim();
      try {
        const data = await scanTiers(env, mint);
        let history = null;
        try {
          const res = await env.ENGINE.get(env.ENGINE.idFromName('main')).fetch(new Request('https://ohlcv.local/tier-hist', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              mint: data.mint,
              name: data.name,
              symbol: data.symbol,
              price: data.price,
              mcap: data.mcap,
              holderCount: data.holderCount,
              bands: data.buckets || []
            })
          }));
          history = await res.json();
        } catch (e) {
          history = null;
        }
        const { book, ...rest } = data;
        return new Response(JSON.stringify({ ok: true, ...rest, history }), { status: 200, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 180) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
    }
    if (path === '/bundle' || path === '/api/bundle') {
      const mint = (new URL(request.url).searchParams.get('mint') || '').trim();
      try {
        const data = await scanBundle(env, mint, new URL(request.url).searchParams.get('launch'));
        return new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 180) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
    }
    if (path === '/flows' || path === '/api/flows') {
      const url = new URL(request.url);
      const mint = (url.searchParams.get('mint') || '').trim();
      try {
        const data = await scanFlows(env, mint, {
          price: url.searchParams.get('price'),
          pair: url.searchParams.get('pair') || '',
          symbol: url.searchParams.get('symbol') || '',
          change: url.searchParams.get('change'),
          before: url.searchParams.get('before') || '',
          debug: url.searchParams.get('debug') === '1'
        });
        return new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 180) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
    }
    if (path === '/golden-read' && request.method === 'POST') {
      try {
        const body = await request.json();
        const image = String(body.image || '').replace(/^data:image\/\w+;base64,/, '').trim();
        if (image.length < 40) throw new Error('No image');
        if (!env.AI) throw new Error('AI is not on this worker');
        const dataUrl = 'data:image/jpeg;base64,' + image;
        const prompt = 'This is a screenshot of an X post, replies, or comments. Extract only the useful human sentences. Return JSON only: {"notes":["sentence"]}. One note per tweet or reply, in the person\'s own words. Drop names, @handles, times, view counts, likes, ads, buttons, and "Post your reply". Do not invent text. If nothing useful is readable, return {"notes":[]}.';
        const input = {
          messages: [
            { role: 'system', content: 'You extract clean notes from screenshots. Reply with JSON only.' },
            { role: 'user', content: prompt }
          ],
          image: dataUrl,
          max_tokens: 900
        };
        const model = '@cf/meta/llama-3.2-11b-vision-instruct';
        let result;
        try {
          result = await env.AI.run(model, input);
        } catch (err) {
          const msg = String(err && err.message ? err.message : err);
          if (!/5016|submit the prompt|hereby agree/i.test(msg)) throw err;
          try {
            await env.AI.run(model, { prompt: 'agree' });
          } catch (agreed) {
            const thanks = String(agreed && agreed.message ? agreed.message : agreed);
            if (!/thank you for agreeing|5016/i.test(thanks)) throw agreed;
          }
          result = await env.AI.run(model, input);
        }
        function modelText(result) {
          if (typeof result === 'string') return result;
          if (!result || typeof result !== 'object') return '';
          const direct = result.response || result.description || result.result || result.output;
          if (typeof direct === 'string') return direct;
          try { return JSON.stringify(direct != null ? direct : result); } catch (e) { return ''; }
        }
        function noteLine(value, depth) {
          if (depth > 4 || value == null) return [];
          if (typeof value === 'string' || typeof value === 'number') {
            const s = String(value).replace(/\s+/g, ' ').replace(/^[\s\-"“”']+|[\s"“”']+$/g, '').trim();
            if (!s || s === '[object Object]' || s.indexOf('[object Object]') >= 0) return [];
            if (!/[a-z]/i.test(s) || (s.match(/[a-z]/gi) || []).length < 3) return [];
            if (/^(post your reply|relevant|view quotes|following|show more|reply|ad)$/i.test(s)) return [];
            return [s];
          }
          if (Array.isArray(value)) return value.flatMap((v) => noteLine(v, depth + 1));
          if (typeof value === 'object') {
            const prefer = ['text', 'note', 'sentence', 'content', 'line', 'quote', 'body', 'message', 'caption'];
            for (const key of prefer) {
              if (value[key] != null) {
                const hit = noteLine(value[key], depth + 1);
                if (hit.length) return hit;
              }
            }
            const rest = Object.keys(value).flatMap((k) => noteLine(value[k], depth + 1));
            const sentences = rest.filter((line) => line.split(/\s+/).length >= 3);
            return sentences.length ? sentences : rest;
          }
          return [];
        }
        const text = modelText(result);
        let notes = [];
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed && parsed.notes != null) notes = noteLine(parsed.notes, 0);
            else if (Array.isArray(parsed)) notes = noteLine(parsed, 0);
          } catch (e) {}
        }
        if (!notes.length) notes = noteLine(text.split(/\n/), 0);
        const seen = {};
        notes = notes.filter((line) => {
          const key = line.toLowerCase();
          if (seen[key]) return false;
          seen[key] = 1;
          return true;
        });
        return new Response(JSON.stringify({ ok: true, notes }), { status: 200, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 180) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
    }
    if (path === '/whale-read' && request.method === 'POST') {
      try {
        const body = await request.json();
        const image = String(body.image || '').replace(/^data:image\/\w+;base64,/, '').trim();
        if (image.length < 40) throw new Error('No image');
        if (!env.AI) throw new Error('AI is not on this worker');
        const shot = await readWhaleShot(env, image);
        return new Response(JSON.stringify({ ok: true, ...shot }), { status: 200, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 180), raw: e && e.raw ? String(e.raw).slice(0, 700) : '' }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
    }
    return env.ENGINE.get(env.ENGINE.idFromName('main')).fetch(stub(request));
  },
  async scheduled(event, env, ctx) {
    const stubId = env.ENGINE.get(env.ENGINE.idFromName('main'));
    ctx.waitUntil(stubId.fetch(new Request('https://ohlcv.local/status')));
    ctx.waitUntil(stubId.fetch(new Request('https://ohlcv.local/helius?sync=1')));
    ctx.waitUntil(stubId.fetch(new Request('https://ohlcv.local/oldcoins?scan=1')));
    ctx.waitUntil(stubId.fetch(new Request('https://ohlcv.local/tier-hist?tick=1')));
    ctx.waitUntil(stubId.fetch(new Request('https://ohlcv.local/coinstats-sells?tick=1')));
  }
};

export { MemoryStore, Engine, json };
