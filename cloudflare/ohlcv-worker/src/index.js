/**
 * API-only Worker. Does NOT host GitHub Pages. No login gate.
 * GitHub Pages (sasikar.github.io/Trading) GETs this for breakout cards.
 */
import { Engine, MemoryStore, handleApi, CORS, json } from './engine.js';

function storeFromSql(sql) {
  try {
    const has = [
      ...sql.exec("SELECT 1 AS n FROM sqlite_master WHERE type='table' AND name='meta' LIMIT 1")
    ];
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
  } catch (e) {
    /* Durable Object write quota: keep serving reads. */
  }

  const one = (q, ...b) => {
    try {
      const it = sql.exec(q, ...b);
      for (const row of it) return row;
    } catch (e) {}
    return null;
  };
  const all = (q, ...b) => {
    try {
      return [...sql.exec(q, ...b)];
    } catch (e) {
      return [];
    }
  };
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
      try {
        sql.exec('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', k, s);
      } catch (e) {}
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
      const prev = tickMem.get(k);
      if (
        prev &&
        prev.price === tick.price &&
        prev.m5 === tick.m5 &&
        prev.h1 === tick.h1 &&
        prev.h6 === tick.h6 &&
        prev.liq === tick.liq &&
        prev.vol5m === tick.vol5m
      ) {
        tickMem.set(k, tick);
        return;
      }
      tickMem.set(k, tick);
      sql.exec(
        `INSERT OR REPLACE INTO ticks
         (ca,t,price,vol5m,vol1h,vol24h,buys5m,sells5m,liq,m5,h1,h6,h24,pairAddress,dexUrl,chain,name)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        k,
        tick.t,
        tick.price,
        tick.vol5m,
        tick.vol1h,
        tick.vol24h,
        tick.buys5m,
        tick.sells5m,
        tick.liq,
        tick.m5,
        tick.h1,
        tick.h6,
        tick.h24,
        tick.pairAddress || '',
        tick.dexUrl || '',
        tick.chain || '',
        tick.name || ''
      );
    },
    allTicks() {
      return all('SELECT * FROM ticks');
    },
    setWatch(rows) {
      const j = JSON.stringify(rows || []);
      if (j === watchJson) return;
      watchJson = j;
      sql.exec('DELETE FROM watch');
      for (const r of rows || []) {
        sql.exec(
          'INSERT OR REPLACE INTO watch (ca, chain, name, poolAddress) VALUES (?,?,?,?)',
          r.ca,
          r.chain,
          r.name || '',
          r.poolAddress || ''
        );
      }
    },
    getWatch() {
      return all('SELECT ca, chain, name, poolAddress FROM watch');
    },
    openBar(ca, tf) {
      const k = ca.toLowerCase() + '|' + tf;
      if (openMem.has(k)) return openMem.get(k);
      const r = one('SELECT * FROM open_bar WHERE ca = ? AND tf = ?', ca.toLowerCase(), tf) || undefined;
      if (r) openMem.set(k, r);
      return r;
    },
    setOpenBar(ca, tf, bar) {
      openMem.set(ca.toLowerCase() + '|' + tf, bar);
    },
    closeBar(ca, tf, bar) {
      const k = ca.toLowerCase() + '|' + tf;
      openMem.delete(k);
      sql.exec(
        `INSERT OR REPLACE INTO ohlcv (ca,tf,t,o,h,l,c,vol,buys,sells,n)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ca.toLowerCase(),
        tf,
        bar.t,
        bar.o,
        bar.h,
        bar.l,
        bar.c,
        bar.vol,
        bar.buys,
        bar.sells,
        bar.n
      );
      sql.exec('DELETE FROM open_bar WHERE ca = ? AND tf = ?', ca.toLowerCase(), tf);
    },
    insertBar(ca, tf, bar) {
      const r = one(
        'SELECT t FROM ohlcv WHERE ca = ? AND tf = ? AND t = ?',
        ca.toLowerCase(),
        tf,
        bar.t
      );
      if (r) return false;
      sql.exec(
        `INSERT OR REPLACE INTO ohlcv (ca,tf,t,o,h,l,c,vol,buys,sells,n)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ca.toLowerCase(),
        tf,
        bar.t,
        bar.o,
        bar.h,
        bar.l,
        bar.c,
        bar.vol || 0,
        bar.buys || 0,
        bar.sells || 0,
        bar.n || 1
      );
      return true;
    },
    flushOpens(now) {
      now = now || Date.now();
      if (now - lastOpenFlush < 5 * 60e3) return;
      lastOpenFlush = now;
      for (const [k, bar] of openMem) {
        const i = k.indexOf('|');
        const tf = k.slice(i + 1);
        if (tf === '1d' || tf === '1w' || tf === '1M') continue;
        sql.exec(
          `INSERT OR REPLACE INTO open_bar (ca,tf,t,o,h,l,c,vol,buys,sells,n)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          k.slice(0, i),
          k.slice(i + 1),
          bar.t,
          bar.o,
          bar.h,
          bar.l,
          bar.c,
          bar.vol,
          bar.buys,
          bar.sells,
          bar.n
        );
      }
    },
    bars(ca, tf, limit) {
      return all(
        'SELECT * FROM ohlcv WHERE ca = ? AND tf = ? ORDER BY t DESC LIMIT ?',
        ca.toLowerCase(),
        tf,
        limit || 40
      ).reverse();
    },
    prune(now) {
      sql.exec("DELETE FROM ohlcv WHERE tf = '1m' AND t < ?", now - 7 * 86400e3);
      sql.exec(
        "DELETE FROM ohlcv WHERE tf IN ('5m','10m','15m','30m') AND t < ?",
        now - 30 * 86400e3
      );
      sql.exec(
        "DELETE FROM ohlcv WHERE tf IN ('1d','1w','1M') AND t < ?",
        now - 730 * 86400e3
      );
    },
    getAlert(key) {
      const r = one('SELECT t FROM alerts WHERE k = ?', key);
      return r ? r.t : 0;
    },
    setAlert(key, t) {
      const r = one('SELECT t FROM alerts WHERE k = ?', key);
      if (r && r.t === t) return;
      sql.exec('INSERT OR REPLACE INTO alerts (k, t) VALUES (?, ?)', key, t);
    }
  };
}

export class OhlcvEngine {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

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
    /* A past/stuck alarm still returns a timestamp, so `if (!next)` never re-arms. */
    if (!next || next <= now + 2000) {
      await this.ctx.storage.setAlarm(now + 4000);
    }
  }

  async alarm() {
    try {
      this.boot();
      await this.engine.tick('auto');
    } catch (e) {
      try {
        if (this.engine) this.engine.lastErr = String(e && e.message ? e.message : e);
      } catch (e2) {}
    }
    try {
      await this.ctx.storage.setAlarm(Date.now() + 60000);
    } catch (e3) {}
  }

  async fetch(request) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (path === '/health' || path === '/api/health') {
      return new Response(
        JSON.stringify({ ok: true, engine: 'ohlcv', ts: new Date().toISOString() }),
        { status: 200, headers: { ...CORS, 'content-type': 'application/json' } }
      );
    }
    try {
      this.boot();
      if (path !== '/holders' && path !== '/api/holders') {
        try {
          await this.ensureAlarm();
        } catch (e) {}
      }
      const out = await handleApi(this.engine, request);
      return new Response(out.body, { status: out.status, headers: out.headers });
    } catch (e) {
      const msg = String(e && e.stack ? e.stack : e);
      return new Response(JSON.stringify({ ok: false, error: msg }), {
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' }
      });
    }
  }
}

function stub(request) {
  const id = 'https://ohlcv.local' + new URL(request.url).pathname + new URL(request.url).search;
  return new Request(id, request);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const id = env.ENGINE.idFromName('main');
    const stubReq = stub(request);
    return env.ENGINE.get(id).fetch(stubReq);
  },
  async scheduled(event, env, ctx) {
    // Kick the Durable Object alarm. Alarm polls saved CAs ~60s.
    const id = env.ENGINE.idFromName('main');
    ctx.waitUntil(env.ENGINE.get(id).fetch(new Request('https://ohlcv.local/status')));
  }
};

export { MemoryStore, Engine, json };
