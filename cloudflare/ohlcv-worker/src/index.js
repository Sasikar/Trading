/**
 * API-only Worker. Does NOT host GitHub Pages. No login gate.
 * GitHub Pages (sasikar.github.io/Trading) GETs this for breakout cards.
 */
import { Engine, MemoryStore, handleApi, CORS, json } from './engine.js';

function storeFromSql(sql) {
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

  const one = (q, ...b) => {
    const it = sql.exec(q, ...b);
    for (const row of it) return row;
    return null;
  };
  const all = (q, ...b) => [...sql.exec(q, ...b)];

  return {
    getMeta(k) {
      const r = one('SELECT v FROM meta WHERE k = ?', k);
      return r ? r.v : undefined;
    },
    setMeta(k, v) {
      sql.exec('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', k, String(v ?? ''));
    },
    getTick(ca) {
      const r = one('SELECT * FROM ticks WHERE ca = ?', ca.toLowerCase());
      return r || undefined;
    },
    setTick(ca, tick) {
      sql.exec(
        `INSERT OR REPLACE INTO ticks
         (ca,t,price,vol5m,vol1h,vol24h,buys5m,sells5m,liq,m5,h1,h6,h24,pairAddress,dexUrl,chain,name)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ca.toLowerCase(),
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
      return one('SELECT * FROM open_bar WHERE ca = ? AND tf = ?', ca.toLowerCase(), tf) || undefined;
    },
    setOpenBar(ca, tf, bar) {
      sql.exec(
        `INSERT OR REPLACE INTO open_bar (ca,tf,t,o,h,l,c,vol,buys,sells,n)
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
    },
    closeBar(ca, tf, bar) {
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
    },
    getAlert(key) {
      const r = one('SELECT t FROM alerts WHERE k = ?', key);
      return r ? r.t : 0;
    },
    setAlert(key, t) {
      sql.exec('INSERT OR REPLACE INTO alerts (k, t) VALUES (?, ?)', key, t);
    }
  };
}

export class OhlcvEngine {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.store = storeFromSql(this.sql);
    this.engine = new Engine(this.store, env);
  }

  async ensureAlarm() {
    const next = await this.ctx.storage.getAlarm();
    if (!next) await this.ctx.storage.setAlarm(Date.now() + 5000);
  }

  async alarm() {
    try {
      await this.engine.tick('auto');
    } catch (e) {
      this.engine.lastErr = String(e && e.message ? e.message : e);
    }
    await this.ctx.storage.setAlarm(Date.now() + 20000);
  }

  async fetch(request) {
    await this.ensureAlarm();
    const out = await handleApi(this.engine, request);
    return new Response(out.body, { status: out.status, headers: out.headers });
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
    // Kick the Durable Object alarm. Do NOT force a full Dex poll — alarm
    // already polls saved CAs ~60s and the focus coin ~20s. A cron /run
    // doubled Dex traffic and made 18 coins look rate-limited.
    const id = env.ENGINE.idFromName('main');
    ctx.waitUntil(env.ENGINE.get(id).fetch(new Request('https://ohlcv.local/status')));
  }
};

export { MemoryStore, Engine, json };
