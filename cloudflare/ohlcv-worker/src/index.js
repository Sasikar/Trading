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
    if (this._alarmCut) return;
    this._alarmCut = true;
    try { await this.ctx.storage.deleteAlarm(); } catch (e) {}
    try { if (this.btcFeed) { this.btcFeed.close(); this.btcFeed = null; } } catch (e2) {}
  }
  async alarm() {
    try { await this.ctx.storage.deleteAlarm(); } catch (e) {}
    try { if (this.btcFeed) { this.btcFeed.close(); this.btcFeed = null; } } catch (e2) {}
  }
  async openBtcFeed() {
    if (this.btcFeed && this.btcFeed.readyState === 1) return;
    const resp = await fetch('https://ws-feed.exchange.coinbase.com', { headers: { Upgrade: 'websocket' } });
    const ws = resp && resp.webSocket;
    if (!ws) return;
    ws.accept();
    this.btcFeed = ws;
    const self = this;
    ws.addEventListener('message', (ev) => {
      let msg = null;
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch (e) { return; }
      const px = Number(msg && msg.price);
      if (!(msg && msg.type === 'ticker' && px > 0)) return;
      self.ctx.waitUntil(self.engine.checkBtcPoints(null, px).catch(() => {}));
    });
    ws.addEventListener('close', () => { if (self.btcFeed === ws) self.btcFeed = null; });
    ws.addEventListener('error', () => { try { ws.close(); } catch (e) {} });
    ws.send(JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD'], channels: ['ticker'] }));
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
      if (wantSync) sync = { skipped: true, paused: true };
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
    return new Response(JSON.stringify({ ok: true, ingested: 0, paused: true }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
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
    const koinlyCsv = {
      '/koinly/CATE-fix-INR.csv': 'Date,Rate\n2026-09-15 23:02:12,5.9861\n2026-09-16 07:34:33,5.9894\n2026-09-16 10:19:42,5.9894\n2026-09-16 10:23:46,5.9894\n2026-09-16 11:41:02,5.9894\n2026-09-16 11:41:42,6.6264\n2026-10-14 13:33:47,6.0259\n',
      '/koinly/CATE-fix-USDT.csv': 'Date,Rate\n2026-09-15 23:02:12,0.06246033\n2026-09-16 11:41:42,0.06910283\n2026-10-14 13:33:47,0.06346599\n',
      '/koinly/PAID-fix-USDT.csv': 'Date,Rate\n2026-09-16 11:41:42,0.00981792\n',
      '/koinly/CATE-real-59817074-USDT.csv': 'Date,Rate\n2026-09-15 23:02:12,0.062460\n2026-09-16 07:34:33,0.062460\n2026-09-16 10:19:42,0.062460\n2026-09-16 10:23:46,0.062460\n2026-09-16 11:41:02,0.062460\n2026-09-16 11:41:42,0.069332\n',
      '/koinly/PAID-real-60806380-USDT.csv': 'Date,Rate\n2026-09-16 11:41:42,0.009828\n2026-09-16 13:50:49,0.009828\n2026-09-16 15:01:04,0.009828\n',
  '/koinly/CATE-1532-USDT.csv': 'Date,Rate\n2026-09-16 11:41:43,0.00000001\n2026-09-16 23:45:41,0.00000001\n2026-09-17 15:50:43,0.00000001\n2026-09-18 07:51:07,0.00000001\n2026-09-18 23:53:42,0.00000001\n2026-09-19 15:57:02,0.00000001\n2026-09-20 07:57:18,0.00000001\n2026-09-20 23:59:51,0.00000001\n2026-09-21 01:28:34,0.00000001\n2026-09-21 01:44:36,0.00000001\n2026-09-21 17:49:09,0.00000001\n2026-09-22 09:49:39,0.00000001\n2026-09-23 01:54:18,0.00000001\n2026-09-23 17:59:06,0.00000001\n2026-09-24 10:02:12,0.00000001\n2026-09-25 02:04:26,0.00000001\n2026-09-25 18:06:05,0.00000001\n2026-09-26 10:08:49,0.00000001\n2026-09-27 02:11:15,0.00000001\n2026-09-27 18:11:23,0.00000001\n2026-09-28 10:12:22,0.00000001\n2026-09-29 02:12:37,0.00000001\n2026-09-29 18:18:06,0.00000001\n2026-09-29 22:06:12,0.00000001\n2026-09-30 14:07:56,0.00000001\n2026-10-01 06:10:51,0.00000001\n2026-10-01 22:12:46,0.00000001\n2026-10-02 14:17:03,0.00000001\n2026-10-03 06:19:35,0.00000001\n2026-10-03 22:21:41,0.00000001\n2026-10-04 14:24:35,0.00000001\n2026-10-05 06:26:43,0.00000001\n2026-10-05 22:29:40,0.00000001\n2026-10-06 17:40:32,0.00000001\n2026-10-06 20:37:50,0.00000001\n2026-10-07 12:41:07,0.00000001\n2026-10-08 04:43:14,0.00000001\n2026-10-08 20:47:47,0.00000001\n2026-10-08 21:36:35,0.00000001\n2026-10-09 13:40:35,0.00000001\n',
  '/koinly/CATE-3619-USDT.csv': 'Date,Rate\n2026-09-16 11:41:44,0.00000001\n2026-09-16 23:48:27,0.00000001\n2026-09-17 15:54:20,0.00000001\n2026-09-18 07:53:51,0.00000001\n2026-09-18 23:57:20,0.00000001\n2026-09-19 15:59:49,0.00000001\n2026-09-20 08:00:01,0.00000001\n2026-09-21 00:02:42,0.00000001\n2026-09-21 01:31:22,0.00000001\n2026-09-21 01:47:20,0.00000001\n2026-09-21 17:51:55,0.00000001\n2026-09-22 09:52:28,0.00000001\n2026-09-23 01:57:03,0.00000001\n2026-09-23 18:01:49,0.00000001\n2026-09-24 10:04:52,0.00000001\n2026-09-25 02:07:47,0.00000001\n2026-09-25 18:08:52,0.00000001\n2026-09-26 10:11:32,0.00000001\n2026-09-27 02:14:01,0.00000001\n2026-09-27 18:14:09,0.00000001\n2026-09-28 10:15:08,0.00000001\n2026-09-29 02:15:26,0.00000001\n2026-09-29 18:20:54,0.00000001\n2026-09-29 22:08:59,0.00000001\n2026-09-30 14:10:45,0.00000001\n2026-10-01 06:13:36,0.00000001\n2026-10-01 22:15:36,0.00000001\n2026-10-02 14:19:54,0.00000001\n2026-10-03 06:22:21,0.00000001\n2026-10-03 22:24:27,0.00000001\n2026-10-04 14:27:29,0.00000001\n2026-10-05 06:29:29,0.00000001\n2026-10-05 22:32:30,0.00000001\n2026-10-06 17:43:21,0.00000001\n2026-10-06 20:40:39,0.00000001\n2026-10-07 12:43:56,0.00000001\n2026-10-08 04:46:02,0.00000001\n2026-10-08 20:50:38,0.00000001\n2026-10-08 21:39:25,0.00000001\n2026-10-09 13:43:25,0.00000001\n',
  '/koinly/CATE-4662-USDT.csv': 'Date,Rate\n2026-09-16 11:41:44,0.00000001\n2026-09-16 23:49:17,0.00000001\n2026-09-17 15:55:29,0.00000001\n2026-09-18 07:54:42,0.00000001\n2026-09-18 23:58:58,0.00000001\n2026-09-19 16:00:42,0.00000001\n2026-09-20 08:00:50,0.00000001\n2026-09-21 00:03:35,0.00000001\n2026-09-21 01:32:16,0.00000001\n2026-09-21 01:48:12,0.00000001\n2026-09-21 17:52:48,0.00000001\n2026-09-22 09:53:20,0.00000001\n2026-09-23 01:57:52,0.00000001\n2026-09-23 18:02:39,0.00000001\n2026-09-24 10:05:42,0.00000001\n2026-09-25 02:08:54,0.00000001\n2026-09-25 18:09:44,0.00000001\n2026-09-26 10:12:23,0.00000001\n2026-09-27 02:14:52,0.00000001\n2026-09-27 18:15:01,0.00000001\n2026-09-28 10:15:59,0.00000001\n2026-09-29 02:16:20,0.00000001\n2026-09-29 18:21:48,0.00000001\n2026-09-29 22:09:51,0.00000001\n2026-09-30 14:11:43,0.00000001\n2026-10-01 06:14:28,0.00000001\n2026-10-01 22:16:32,0.00000001\n2026-10-02 14:20:49,0.00000001\n2026-10-03 06:23:12,0.00000001\n2026-10-03 22:25:19,0.00000001\n2026-10-04 14:28:26,0.00000001\n2026-10-05 06:30:22,0.00000001\n2026-10-05 22:33:23,0.00000001\n2026-10-06 17:44:15,0.00000001\n2026-10-06 20:41:31,0.00000001\n2026-10-07 12:44:49,0.00000001\n2026-10-08 04:46:55,0.00000001\n2026-10-08 20:51:32,0.00000001\n2026-10-08 21:40:18,0.00000001\n2026-10-09 13:44:18,0.00000001\n'
    };
    if (koinlyCsv[path]) {
      const name = path.slice(path.lastIndexOf('/') + 1);
      return new Response(koinlyCsv[path], {
        status: 200,
        headers: {
          ...CORS,
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="' + name + '"',
          'cache-control': 'no-store'
        }
      });
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
          return new Response(JSON.stringify({ ok: true, paused: true }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
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
      if (path === '/solchain-wallets' || path === '/api/solchain-wallets') {
        const clean = (list) => {
          const out = [];
          (Array.isArray(list) ? list : []).forEach((row) => {
            const address = String((row && row.address) || '').trim();
            if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) || out.some((item) => item.address === address)) return;
            const name = String((row && row.name) || '').trim().slice(0, 40);
            out.push({ address, name, at: Number(row && row.at) || Date.now() });
          });
          return out;
        };
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const wallets = clean(body.wallets);
          this.store.setMeta('solchain_wallets', JSON.stringify(wallets));
          return new Response(JSON.stringify({ ok: true, wallets }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
        let wallets = [];
        try { wallets = clean(JSON.parse(this.store.getMeta('solchain_wallets') || '[]')); } catch (e) { wallets = []; }
        return new Response(JSON.stringify({ ok: true, wallets }), { status: 200, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
      }
      if (path === '/btc' || path === '/api/btc') {
        try {
          if (request.method === 'POST') {
            const patch = await request.json().catch(() => ({}));
            const saved = this.engine.btcState();
            if (patch && patch.step != null) {
              let step = Math.round(Number(patch.step) / 100) * 100;
              if (!isFinite(step) || step < 100) step = 200;
              if (step > 5000) step = 5000;
              saved.step = step;
            }
            if (patch && patch.on != null) saved.on = false;
            this.engine.saveBtc(saved);
          }
          const data = this.engine.btcView(this.engine.btcState(), '');
          data.paused = true;
          return new Response(JSON.stringify(data), { status: 200, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 180) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
      }
      if (path === '/memes' || path === '/api/memes') {
        try {
          if (request.method === 'POST') {
            const patch = await request.json().catch(() => ({}));
            const saved = this.engine.memeState();
            if (patch && patch.points != null) {
              let points = Math.round(Number(patch.points));
              if (!isFinite(points) || points < 1) points = 2;
              if (points > 20) points = 20;
              saved.points = points;
            }
            if (patch && patch.on != null) saved.on = false;
            this.engine.saveMeme(saved);
          }
          const data = this.engine.memeView(this.engine.memeState(), '', 0);
          data.paused = true;
          return new Response(JSON.stringify(data), { status: 200, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 180) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
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
          return new Response(JSON.stringify({ ok: true, paused: true }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
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
          return new Response(JSON.stringify({ ok: true, paused: true, coins: readOldCoins(this.store) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
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
      const bare = after.match(/(\d+(?:\.\d+)?)(?!\s*[KMB]|\.\d)/i);
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

async function readTopHolders(mint) {
  mint = String(mint || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw new Error('Pick a Solana coin');
  const reportRes = await fetch('https://api.rugcheck.xyz/v1/tokens/' + mint + '/report', {
    headers: { accept: 'application/json', 'user-agent': 'trading-ohlcv' }
  });
  if (!reportRes.ok) throw new Error('Holder list is not available for that coin');
  const report = await reportRes.json();
  const list = Array.isArray(report.topHolders) ? report.topHolders : [];
  const pools = {};
  (Array.isArray(report.markets) ? report.markets : []).forEach((m) => {
    if (!m) return;
    if (m.pubkey) pools[m.pubkey] = 1;
    if (m.liquidityAAccount && m.liquidityAAccount.owner) pools[m.liquidityAAccount.owner] = 1;
    if (m.liquidityBAccount && m.liquidityBAccount.owner) pools[m.liquidityBAccount.owner] = 1;
  });
  let price = 0;
  let pair = '';
  let symbol = (report.tokenMeta && (report.tokenMeta.symbol || report.tokenMeta.name)) || '';
  try {
    const px = await fetch('https://api.dexscreener.com/tokens/v1/solana/' + mint, { headers: { accept: 'application/json' } });
    if (px.ok) {
      const pairs = await px.json();
      const best = (Array.isArray(pairs) ? pairs : []).slice().sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0))[0];
      if (best) {
        price = Number(best.priceUsd) || 0;
        pair = best.pairAddress || '';
        symbol = symbol || (best.baseToken && best.baseToken.symbol) || '';
      }
    }
  } catch (e) {}
  const rows = list.slice(0, 10).map((h) => {
    const owner = String(h.owner || h.address || '').trim();
    const n = Number(h.uiAmount);
    const pct = Number(h.pct);
    const usd = price && isFinite(n) ? price * n : null;
    return {
      addr: owner,
      pct: isFinite(pct) ? Math.round(pct * 100) / 100 : null,
      n: isFinite(n) ? n : null,
      value: usd,
      pool: !!(pools[owner] || (pair && owner === pair))
    };
  }).filter((row) => row.addr && row.n != null);
  if (rows.length < 3) throw new Error('That coin has no holder list yet');
  return { coin: String(symbol || '').slice(0, 40), mint, price, rows };
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

async function healthPageText(url) {
  let parsed;
  try { parsed = new URL(url); } catch (e) { throw new Error('That link is not valid'); }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('That link is not valid');
  const href = parsed.toString();
  const host = parsed.hostname.replace(/^www\./, '');
  const pull = async (target, accept) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      return await fetch(target, { signal: ctrl.signal, redirect: 'follow', headers: { accept: accept || 'text/html', 'user-agent': 'Mozilla/5.0' } });
    } finally { clearTimeout(timer); }
  };
  if (/youtu\.be$|youtube\.com$|youtube-nocookie\.com$/i.test(host)) {
    try {
      const page = await pull(href, 'text/html');
      if (page.ok) {
        const html = (await page.text()).slice(0, 400000);
        const raw = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
        if (raw) {
          const desc = JSON.parse('"' + raw[1] + '"').replace(/\s+/g, ' ').trim();
          if (desc.length > 40) return { text: desc.slice(0, 1800), watched: false, titleOnly: false };
        }
      }
    } catch (e) {}
    const oe = await pull('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(href), 'application/json');
    if (!oe.ok) throw new Error('Could not read that video link');
    const data = await oe.json();
    const title = String(data.title || '').replace(/\s+/g, ' ').trim();
    if (!title) throw new Error('That video has no readable title');
    return { text: title, watched: false, titleOnly: true };
  }
  const res = await pull(href, 'text/html');
  if (!res.ok) throw new Error('Could not open that link');
  const html = (await res.text()).slice(0, 250000);
  const pick = (re) => {
    const m = html.match(re);
    return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  };
  const text = [
    pick(/<title[^>]*>([\s\S]*?)<\/title>/i),
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i),
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i)
  ].filter(Boolean).join('. ').slice(0, 1800);
  if (text.length < 8) throw new Error('That link has no readable text');
  return { text, watched: false, titleOnly: false };
}

async function transcribeHealth(env, audio) {
  const clean = String(audio || '').replace(/^data:audio\/[\w.+-]+;base64,/, '').trim();
  if (clean.length < 80) throw new Error('No speech in that video');
  const models = ['@cf/openai/whisper-large-v3-turbo', '@cf/openai/whisper'];
  let last = 'Could not transcribe that video';
  for (const model of models) {
    try {
      const result = await env.AI.run(model, { audio: clean, task: 'transcribe' });
      const spoken = String((result && (result.text || result.transcription)) || whaleModelText(result) || '').replace(/\s+/g, ' ').trim();
      if (spoken.length > 8) return spoken.slice(0, 8000);
      last = 'No speech heard in that video';
    } catch (err) {
      last = String(err && err.message ? err.message : err).slice(0, 160);
    }
  }
  throw new Error(last);
}

async function readHealthTips(env, body) {
  const allowed = (Array.isArray(body.topics) ? body.topics : []).map((t) => ({
    id: String(t && t.id || '').slice(0, 40),
    name: String(t && t.name || '').replace(/\s+/g, ' ').trim().slice(0, 24)
  })).filter((t) => t.id && t.name).slice(0, 24);
  if (!allowed.length) throw new Error('Add a health topic first');
  if (!env.AI) throw new Error('AI is not on this worker');
  const image = String(body.image || '').replace(/^data:image\/\w+;base64,/, '').trim();
  const url = String(body.url || '').trim();
  const spoken = String(body.audio || '').trim();
  const pasted = String(body.text || '').trim();
  let source = null;
  if (spoken) source = { text: await transcribeHealth(env, spoken), titleOnly: false };
  else if (pasted) source = { text: pasted.slice(0, 8000), titleOnly: false };
  else if (url) source = await healthPageText(url);
  if (!image && !source) throw new Error('Add a photo, video, or link');
  const menu = allowed.map((t) => t.id + '=' + t.name).join(', ');
  const prompt = (source
    ? 'Source text from a health video or article: ' + source.text + '\n'
    : 'Read this health image. It may be a tip, a lab test, or a screenshot.\n') +
    'File only tips or tests that are actually there. Topics: ' + menu + '. Return JSON only: {"items":[{"tab":"foods","text":"one short tip"}]}. tab must be one of those ids. Do not invent advice. If nothing useful is readable, return {"items":[]}.';
  const model = image ? '@cf/meta/llama-3.2-11b-vision-instruct' : '@cf/meta/llama-3.1-8b-instruct';
  const dataUrl = image ? 'data:image/jpeg;base64,' + image : '';
  const attempts = image
    ? [
      {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }],
        max_tokens: 900
      },
      {
        messages: [
          { role: 'system', content: 'You file health tips. Reply with JSON only.' },
          { role: 'user', content: prompt }
        ],
        image: dataUrl,
        max_tokens: 900
      }
    ]
    : [{
      messages: [
        { role: 'system', content: 'You file health tips. Reply with JSON only.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 700
    }];
  let result;
  let last = 'Could not read that';
  for (const input of attempts) {
    try {
      result = await env.AI.run(model, input);
      const got = whaleModelText(result);
      if (got && got.length > 2) { last = ''; break; }
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      last = msg.slice(0, 180);
      if (/5016|submit the prompt|hereby agree/i.test(msg)) {
        try { await env.AI.run(model, { prompt: 'agree' }); } catch (e) {}
        try {
          result = await env.AI.run(model, input);
          last = '';
          break;
        } catch (again) {
          last = String(again && again.message ? again.message : again).slice(0, 180);
        }
      }
    }
  }
  if (last) throw new Error(/3030|no user-supplied/i.test(last) ? 'The photo could not be read. Try a smaller image.' : last);
  const text = whaleModelText(result);
  const parsed = looseObject(text) || {};
  const list = parsed.items || parsed.tips || parsed.notes || [];
  const ids = {};
  allowed.forEach((t) => { ids[t.id.toLowerCase()] = t.id; ids[t.name.toLowerCase()] = t.id; });
  const seen = {};
  const items = (Array.isArray(list) ? list : []).map((row) => {
    if (!row || typeof row !== 'object') return null;
    const key = String(row.tab || row.topic || '').toLowerCase().trim();
    const tab = ids[key];
    const tip = String(row.text || row.tip || row.note || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!tab || tip.length < 3) return null;
    const mark = tab + '|' + tip.toLowerCase();
    if (seen[mark]) return null;
    seen[mark] = 1;
    return { tab, text: tip, url: url || '' };
  }).filter(Boolean).slice(0, 12);
  return { items, titleOnly: !!(source && source.titleOnly) };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    const koinlyCsv = {
      '/koinly/CATE-fix-INR.csv': 'Date,Rate\n2026-09-15 23:02:12,5.9861\n2026-09-16 07:34:33,5.9894\n2026-09-16 10:19:42,5.9894\n2026-09-16 10:23:46,5.9894\n2026-09-16 11:41:02,5.9894\n2026-09-16 11:41:42,6.6264\n2026-10-14 13:33:47,6.0259\n',
      '/koinly/CATE-fix-USDT.csv': 'Date,Rate\n2026-09-15 23:02:12,0.06246033\n2026-09-16 11:41:42,0.06910283\n2026-10-14 13:33:47,0.06346599\n',
      '/koinly/PAID-fix-USDT.csv': 'Date,Rate\n2026-09-16 11:41:42,0.00981792\n',
      '/koinly/CATE-real-59817074-USDT.csv': 'Date,Rate\n2026-09-15 23:02:12,0.062460\n2026-09-16 07:34:33,0.062460\n2026-09-16 10:19:42,0.062460\n2026-09-16 10:23:46,0.062460\n2026-09-16 11:41:02,0.062460\n2026-09-16 11:41:42,0.069332\n',
      '/koinly/PAID-real-60806380-USDT.csv': 'Date,Rate\n2026-09-16 11:41:42,0.009828\n2026-09-16 13:50:49,0.009828\n2026-09-16 15:01:04,0.009828\n',
  '/koinly/CATE-1532-USDT.csv': 'Date,Rate\n2026-09-16 11:41:43,0.00000001\n2026-09-16 23:45:41,0.00000001\n2026-09-17 15:50:43,0.00000001\n2026-09-18 07:51:07,0.00000001\n2026-09-18 23:53:42,0.00000001\n2026-09-19 15:57:02,0.00000001\n2026-09-20 07:57:18,0.00000001\n2026-09-20 23:59:51,0.00000001\n2026-09-21 01:28:34,0.00000001\n2026-09-21 01:44:36,0.00000001\n2026-09-21 17:49:09,0.00000001\n2026-09-22 09:49:39,0.00000001\n2026-09-23 01:54:18,0.00000001\n2026-09-23 17:59:06,0.00000001\n2026-09-24 10:02:12,0.00000001\n2026-09-25 02:04:26,0.00000001\n2026-09-25 18:06:05,0.00000001\n2026-09-26 10:08:49,0.00000001\n2026-09-27 02:11:15,0.00000001\n2026-09-27 18:11:23,0.00000001\n2026-09-28 10:12:22,0.00000001\n2026-09-29 02:12:37,0.00000001\n2026-09-29 18:18:06,0.00000001\n2026-09-29 22:06:12,0.00000001\n2026-09-30 14:07:56,0.00000001\n2026-10-01 06:10:51,0.00000001\n2026-10-01 22:12:46,0.00000001\n2026-10-02 14:17:03,0.00000001\n2026-10-03 06:19:35,0.00000001\n2026-10-03 22:21:41,0.00000001\n2026-10-04 14:24:35,0.00000001\n2026-10-05 06:26:43,0.00000001\n2026-10-05 22:29:40,0.00000001\n2026-10-06 17:40:32,0.00000001\n2026-10-06 20:37:50,0.00000001\n2026-10-07 12:41:07,0.00000001\n2026-10-08 04:43:14,0.00000001\n2026-10-08 20:47:47,0.00000001\n2026-10-08 21:36:35,0.00000001\n2026-10-09 13:40:35,0.00000001\n',
  '/koinly/CATE-3619-USDT.csv': 'Date,Rate\n2026-09-16 11:41:44,0.00000001\n2026-09-16 23:48:27,0.00000001\n2026-09-17 15:54:20,0.00000001\n2026-09-18 07:53:51,0.00000001\n2026-09-18 23:57:20,0.00000001\n2026-09-19 15:59:49,0.00000001\n2026-09-20 08:00:01,0.00000001\n2026-09-21 00:02:42,0.00000001\n2026-09-21 01:31:22,0.00000001\n2026-09-21 01:47:20,0.00000001\n2026-09-21 17:51:55,0.00000001\n2026-09-22 09:52:28,0.00000001\n2026-09-23 01:57:03,0.00000001\n2026-09-23 18:01:49,0.00000001\n2026-09-24 10:04:52,0.00000001\n2026-09-25 02:07:47,0.00000001\n2026-09-25 18:08:52,0.00000001\n2026-09-26 10:11:32,0.00000001\n2026-09-27 02:14:01,0.00000001\n2026-09-27 18:14:09,0.00000001\n2026-09-28 10:15:08,0.00000001\n2026-09-29 02:15:26,0.00000001\n2026-09-29 18:20:54,0.00000001\n2026-09-29 22:08:59,0.00000001\n2026-09-30 14:10:45,0.00000001\n2026-10-01 06:13:36,0.00000001\n2026-10-01 22:15:36,0.00000001\n2026-10-02 14:19:54,0.00000001\n2026-10-03 06:22:21,0.00000001\n2026-10-03 22:24:27,0.00000001\n2026-10-04 14:27:29,0.00000001\n2026-10-05 06:29:29,0.00000001\n2026-10-05 22:32:30,0.00000001\n2026-10-06 17:43:21,0.00000001\n2026-10-06 20:40:39,0.00000001\n2026-10-07 12:43:56,0.00000001\n2026-10-08 04:46:02,0.00000001\n2026-10-08 20:50:38,0.00000001\n2026-10-08 21:39:25,0.00000001\n2026-10-09 13:43:25,0.00000001\n',
  '/koinly/CATE-4662-USDT.csv': 'Date,Rate\n2026-09-16 11:41:44,0.00000001\n2026-09-16 23:49:17,0.00000001\n2026-09-17 15:55:29,0.00000001\n2026-09-18 07:54:42,0.00000001\n2026-09-18 23:58:58,0.00000001\n2026-09-19 16:00:42,0.00000001\n2026-09-20 08:00:50,0.00000001\n2026-09-21 00:03:35,0.00000001\n2026-09-21 01:32:16,0.00000001\n2026-09-21 01:48:12,0.00000001\n2026-09-21 17:52:48,0.00000001\n2026-09-22 09:53:20,0.00000001\n2026-09-23 01:57:52,0.00000001\n2026-09-23 18:02:39,0.00000001\n2026-09-24 10:05:42,0.00000001\n2026-09-25 02:08:54,0.00000001\n2026-09-25 18:09:44,0.00000001\n2026-09-26 10:12:23,0.00000001\n2026-09-27 02:14:52,0.00000001\n2026-09-27 18:15:01,0.00000001\n2026-09-28 10:15:59,0.00000001\n2026-09-29 02:16:20,0.00000001\n2026-09-29 18:21:48,0.00000001\n2026-09-29 22:09:51,0.00000001\n2026-09-30 14:11:43,0.00000001\n2026-10-01 06:14:28,0.00000001\n2026-10-01 22:16:32,0.00000001\n2026-10-02 14:20:49,0.00000001\n2026-10-03 06:23:12,0.00000001\n2026-10-03 22:25:19,0.00000001\n2026-10-04 14:28:26,0.00000001\n2026-10-05 06:30:22,0.00000001\n2026-10-05 22:33:23,0.00000001\n2026-10-06 17:44:15,0.00000001\n2026-10-06 20:41:31,0.00000001\n2026-10-07 12:44:49,0.00000001\n2026-10-08 04:46:55,0.00000001\n2026-10-08 20:51:32,0.00000001\n2026-10-08 21:40:18,0.00000001\n2026-10-09 13:44:18,0.00000001\n'
    };
    if (koinlyCsv[path]) {
      const name = path.slice(path.lastIndexOf('/') + 1);
      return new Response(koinlyCsv[path], {
        status: 200,
        headers: {
          ...CORS,
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="' + name + '"',
          'cache-control': 'no-store'
        }
      });
    }
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
    if (path === '/health-read' && request.method === 'POST') {
      try {
        const body = await request.json();
        const data = await readHealthTips(env, body);
        return new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 180) }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }
    }
    if (path === '/whale-holders' && request.method === 'GET') {
      try {
        const mint = new URL(request.url).searchParams.get('mint') || '';
        const shot = await readTopHolders(mint);
        return new Response(JSON.stringify({ ok: true, ...shot }), { status: 200, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
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
  async scheduled() {
    return;
  }
};

export { MemoryStore, Engine, json };
