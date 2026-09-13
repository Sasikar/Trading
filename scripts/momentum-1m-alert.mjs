#!/usr/bin/env node
/**
 * 1M MOMENTUM BREAKOUT — independent detector
 * Does NOT modify breakout-alert.mjs / CA frozen engine.
 *
 * Shortlist: data/ca-recents.json (saved CAs)
 * Data: GeckoTerminal pool OHLCV (1m)
 * Alerts: ntfy via process.env.NTFY_TOPIC (required for prod; never hardcode topic)
 * State: data/momentum-1m-state.json
 *
 * GitHub Actions min schedule is 5m; logic still uses 1m candles when it runs.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RECENTS = path.join(ROOT, 'data', 'ca-recents.json');
const STATE = path.join(ROOT, 'data', 'momentum-1m-state.json');

// ---- configurable thresholds ----
const CFG = {
  maxCandidates: 25,
  minLiqUsd: 15000,
  scoreThreshold: 62,
  cooldownMs: 20 * 60 * 1000, // 20 min base
  strongScoreBump: 12, // re-alert if score >= last + this
  maxExtendRet5: 0.22, // 5m return already >22% => EXTENDED suppress early
  lookback1m: 30,
  sleepMs: 1800, // GT free tier; pool cache cuts discovery calls
  weights: {
    priceAccel: 25,
    volExpand: 25,
    structure: 20,
    buyPressure: 15, // optional; 0 if no flow data
    liquidity: 10,
    confirm3m: 5
  }
};

const NTFY_TOPIC = (process.env.NTFY_TOPIC || '').trim();
let httpRequests = 0;
let httpPool = 0;
let httpOhlcv = 0;

const NTFY_URL = NTFY_TOPIC ? `https://ntfy.sh/${encodeURIComponent(NTFY_TOPIC)}` : '';

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function loadJSON(p, fb){ try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return fb; } }
function saveJSON(p, o){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p, JSON.stringify(o,null,2)+'\n'); }

async function fetchJSON(url, tries=3, kind='other'){
  let last;
  for (let i=0;i<tries;i++){
    try{
      httpRequests++;
      if (kind==='pool') httpPool++;
      else if (kind==='ohlcv') httpOhlcv++;
      const r = await fetch(url, {
        headers: { Accept:'application/json', 'User-Agent':'TradingMomentum1m/1.0' },
        cache: 'no-store'
      });
      if (r.status === 429) {
        const body = await r.text().catch(()=> '');
        await sleep(3000*(i+1));
        last = new Error('HTTP 429 rate limit '+body.slice(0,80));
        continue;
      }
      if (!r.ok) {
        const body = await r.text().catch(()=> '');
        throw new Error(`HTTP ${r.status} ${body.slice(0,100)}`);
      }
      return await r.json();
    }catch(e){ last=e; await sleep(600*(i+1)); }
  }
  throw last;
}

async function resolvePool(chain, ca){
  const net = (chain==='sol'||chain==='solana') ? 'solana' : 'eth';
  const url = `https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${encodeURIComponent(ca)}/pools?page=1`;
  const j = await fetchJSON(url, 3, 'pool');
  const rows = j?.data || [];
  if (!rows.length) throw new Error('no pools');
  rows.sort((a,b)=>{
    const ra = Number(a.attributes?.reserve_in_usd || a.attributes?.volume_usd?.h24 || 0);
    const rb = Number(b.attributes?.reserve_in_usd || b.attributes?.volume_usd?.h24 || 0);
    return rb - ra;
  });
  const top = rows[0];
  const liq = Number(top.attributes?.reserve_in_usd || 0);
  return {
    network: net,
    address: top.attributes?.address || String(top.id||'').split('_').pop(),
    name: top.attributes?.name || ca.slice(0,8),
    base: (top.attributes?.name||'').split(' / ')[0] || ca.slice(0,8),
    liq
  };
}

/** 1m OHLCV: [ts_ms, o,h,l,c,vol] oldest→newest */
async function fetchOHLCV1m(network, poolAddress, limit=40){
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}/ohlcv/minute?aggregate=1&limit=${limit}&currency=usd`;
  const j = await fetchJSON(url, 3, 'ohlcv');
  let list = j?.data?.attributes?.ohlcv_list || [];
  list = list.map(r => {
    let ts = Number(r[0]);
    if (String(r[0]).length < 13) ts *= 1000;
    return [ts, +r[1], +r[2], +r[3], +r[4], +r[5]];
  }).filter(k => isFinite(k[4]) && k[4] > 0)
    .sort((a,b)=>a[0]-b[0]);
  return list;
}

function median(arr){
  const a = arr.filter(x => isFinite(x)).slice().sort((x,y)=>x-y);
  if (!a.length) return 0;
  const m = Math.floor(a.length/2);
  return a.length % 2 ? a[m] : (a[m-1]+a[m])/2;
}

function pct(a,b){ return b ? (a-b)/b : 0; }

/**
 * EARLY BREAKOUT SCORE 0–100
 *
 * Price accel (25): 1m ret vs recent |1m ret| median baseline; bonus if near/above local high
 * Vol expand (25): 1m vol / median(prior 1m vols)  → map to 0–25
 * Structure (20): consecutive green, HH, break local resistance
 * Buy pressure (15): optional; 0 if no flow (GT OHLCV has no buy/sell split)
 * Liquidity (10): soft score from liq
 * 3m confirm (5): 3m return positive + accelerating
 */
function scoreCandle(kl, liq){
  const n = kl.length;
  if (n < 12) return { score:0, reasons:[], state:'NORMAL', detail:{} };

  // last bar may be forming — mark incomplete if < 50s old
  const now = Date.now();
  const last = kl[n-1];
  const forming = (now - last[0]) < 55_000;

  const closes = kl.map(k=>k[4]);
  const highs = kl.map(k=>k[2]);
  const lows = kl.map(k=>k[3]);
  const vols = kl.map(k=>k[5]||0);

  const c0 = closes[n-1], c1 = closes[n-2];
  const ret1 = pct(c0, c1);
  const ret3 = n>=4 ? pct(c0, closes[n-4]) : ret1;
  const ret5 = n>=6 ? pct(c0, closes[n-6]) : ret3;

  const priorRets = [];
  for (let i=n-12;i<n-1;i++) if (i>0) priorRets.push(Math.abs(pct(closes[i], closes[i-1])));
  const volBase = median(priorRets) || 0.004;
  const priceZ = volBase > 0 ? ret1 / volBase : 0;

  // volume: exclude current from baseline
  const priorVols = vols.slice(Math.max(0,n-16), n-1);
  const volMed = median(priorVols) || 1e-12;
  const volX = vols[n-1] / volMed;

  // local resistance = max high of bars n-12 .. n-3
  let resist = -Infinity;
  for (let i=n-12;i<=n-3;i++) if (i>=0) resist = Math.max(resist, highs[i]);
  const breakout = isFinite(resist) && c0 > resist;
  const nearHigh = isFinite(resist) && c0 >= resist * 0.995;

  let greens = 0;
  for (let i=n-1;i>=Math.max(0,n-4);i--) {
    if (closes[i] > closes[i-1]) greens++; else break;
  }
  const hh = highs[n-1] >= Math.max(...highs.slice(n-6,n-1));
  const hl = lows[n-1] >= Math.min(...lows.slice(n-4,n-1)) * 0.998;

  // RECLAIM: recent 1m dump then recovery above mid of dump range
  let reclaim = false;
  let flushRet = 0;
  if (n >= 5) {
    const mid = closes[n-3];
    const lowFlush = Math.min(lows[n-3], lows[n-2], lows[n-1]);
    flushRet = pct(lowFlush, closes[n-4] || mid);
    const recovered = c0 >= (closes[n-4] || mid) * 0.998 && ret1 > 0 && flushRet < -0.015;
    reclaim = recovered && volX >= 1.5;
  }

  // scores
  let sPrice = 0;
  if (priceZ >= 2.5) sPrice = 25;
  else if (priceZ >= 1.8) sPrice = 18;
  else if (priceZ >= 1.2) sPrice = 12;
  else if (ret1 > 0.008) sPrice = 6;
  if (nearHigh || breakout) sPrice = Math.min(25, sPrice + 4);

  let sVol = 0;
  if (volX >= 4) sVol = 25;
  else if (volX >= 2.5) sVol = 18;
  else if (volX >= 1.8) sVol = 12;
  else if (volX >= 1.3) sVol = 6;

  let sStruct = 0;
  if (breakout) sStruct += 10;
  if (greens >= 2) sStruct += 5;
  if (hh) sStruct += 3;
  if (hl) sStruct += 2;
  sStruct = Math.min(20, sStruct);

  const sBuy = 0; // no reliable buy/sell split on GT OHLCV

  let sLiq = 0;
  if (liq >= 500000) sLiq = 10;
  else if (liq >= 100000) sLiq = 8;
  else if (liq >= 50000) sLiq = 6;
  else if (liq >= CFG.minLiqUsd) sLiq = 4;

  let s3 = 0;
  if (ret3 > 0.02 && ret1 > 0) s3 = 5;
  else if (ret3 > 0.01) s3 = 3;

  let score = sPrice + sVol + sStruct + sBuy + sLiq + s3;

  // anti-extension: already vertical on 5m
  let extended = ret5 >= CFG.maxExtendRet5 && !reclaim;
  if (extended) score = Math.min(score, CFG.scoreThreshold - 5);

  const reasons = [];
  if (sPrice >= 12) reasons.push('price accel');
  if (sVol >= 12) reasons.push('vol expand '+volX.toFixed(1)+'x');
  if (breakout) reasons.push('resistance break');
  if (reclaim) reasons.push('reclaim after flush');
  if (greens >= 2) reasons.push(greens+' green 1m');
  if (extended) reasons.push('extended (suppressed)');

  let state = 'NORMAL';
  if (reclaim && score >= CFG.scoreThreshold - 5) state = 'RETEST/RECLAIM';
  else if (extended) state = 'EXTENDED';
  else if (score >= CFG.scoreThreshold) state = 'EARLY_BREAKOUT';
  else if (score >= CFG.scoreThreshold - 12) state = 'WATCH';

  return {
    score: Math.round(score),
    state,
    forming,
    reclaim,
    extended,
    reasons,
    detail: {
      price: c0,
      ret1: +(ret1*100).toFixed(2),
      ret3: +(ret3*100).toFixed(2),
      ret5: +(ret5*100).toFixed(2),
      volX: +volX.toFixed(2),
      liq: Math.round(liq),
      breakout,
      greens,
      flushRet: +(flushRet*100).toFixed(2)
    }
  };
}

async function sendNtfy(title, body, priority='high'){
  if (!NTFY_URL) {
    console.warn('NTFY_TOPIC not set — skip send:', title);
    return { skipped: true };
  }
  let last;
  for (let i=0;i<3;i++){
    try{
      const r = await fetch(NTFY_URL, {
        method: 'POST',
        headers: {
          'Title': title.slice(0, 90),
          'Priority': priority,
          'Tags': 'chart_with_upwards_trend,zap'
        },
        body
      });
      if (r.status >= 500) { await sleep(500*(2**i)); continue; }
      if (!r.ok) throw new Error('ntfy HTTP '+r.status);
      return await r.json().catch(()=>({}));
    }catch(e){ last=e; await sleep(400*(i+1)); }
  }
  console.error('ntfy failed', last);
  return { error: String(last) };
}

function alertKey(item, kind){
  return `${item.chain}|${item.ca}|${kind}`;
}

async function main(){
  const recentsDoc = loadJSON(RECENTS, { items: [] });
  let items = Array.isArray(recentsDoc) ? recentsDoc : (recentsDoc.items || []);
  // shortlist: most recently used, cap
  items = items.slice().sort((a,b)=>(b.t||0)-(a.t||0)).slice(0, CFG.maxCandidates);

  const state = loadJSON(STATE, { tokens: {}, updated: null });
  if (!state.tokens) state.tokens = {};

  const runStarted = Date.now();
  httpRequests = 0; httpPool = 0; httpOhlcv = 0;
  console.log(`1M momentum · candidates=${items.length} · topic=${NTFY_TOPIC ? '(from secret)' : 'MISSING'} · threshold=${CFG.scoreThreshold}`);


  let sent = 0;
  const findings = [];
  const scoreboard = [];
  const errors = [];
  let rateLimited = false;
  const healthBase = NTFY_TOPIC ? 'OK' : 'NO_TOPIC';

  for (const item of items) {
    const name = item.name || item.base || (item.ca||'').slice(0,6);
    const key = `${item.chain}|${item.ca}`;
    let tokState = state.tokens[key] || { lastAlert: 0, lastScore: 0, lastState: 'NORMAL', lastKind: '' };

    try {
      let pool;
      if (tokState.poolAddress && tokState.poolNetwork && (Date.now()-(tokState.poolCachedAt||0) < 6*3600e3)) {
        pool = { network: tokState.poolNetwork, address: tokState.poolAddress, liq: tokState.poolLiq||0, name: name, base: name };
      } else {
        pool = await resolvePool(item.chain, item.ca);
        await sleep(CFG.sleepMs);
        tokState.poolAddress = pool.address;
        tokState.poolNetwork = pool.network;
        tokState.poolLiq = pool.liq;
        tokState.poolCachedAt = Date.now();
      }
      if (pool.liq && pool.liq < CFG.minLiqUsd) {
        console.log(`${name}: liq $${Math.round(pool.liq)} < min — skip`);
        state.tokens[key] = tokState;
        continue;
      }
      const kl = await fetchOHLCV1m(pool.network, pool.address, CFG.lookback1m + 5);
      await sleep(CFG.sleepMs);
      if (kl.length < 12) {
        console.log(`${name}: insufficient 1m history`);
        continue;
      }

      const scored = scoreCandle(kl, pool.liq);
      console.log(`${name}: score=${scored.score} state=${scored.state} ret1=${scored.detail.ret1}% vol=${scored.detail.volX}x forming=${scored.forming}`);
      scoreboard.push({
        name,
        chain: item.chain,
        ca: item.ca,
        score: scored.score,
        state: scored.state,
        reason: (scored.reasons||[]).slice(0,3).join(' + ') || '—',
        ret1: scored.detail.ret1,
        volX: scored.detail.volX,
        forming: !!scored.forming
      });

      const now = Date.now();
      const inCooldown = (now - (tokState.lastAlert||0)) < CFG.cooldownMs;
      const stronger = scored.score >= (tokState.lastScore||0) + CFG.strongScoreBump;
      const kind = scored.reclaim ? 'RECLAIM' : 'EARLY';
      const isAlertState = scored.state === 'EARLY_BREAKOUT' || scored.state === 'RETEST/RECLAIM';

      let shouldSend = false;
      if (isAlertState && scored.score >= CFG.scoreThreshold) {
        if (!inCooldown) shouldSend = true;
        else if (stronger && kind !== tokState.lastKind) shouldSend = true;
        else if (scored.reclaim && tokState.lastKind !== 'RECLAIM') shouldSend = true;
      }

      if (shouldSend) {
        const title = scored.reclaim
          ? `🔄 1M RECLAIM — ${name}`
          : `🚀 1M BREAKOUT — ${name}`;
        const body = [
          `${name} (${(item.chain==='solana'||item.chain==='sol')?'SOL':'ETH'})`,
          `Price: $${scored.detail.price < 0.01 ? scored.detail.price.toPrecision(4) : scored.detail.price.toFixed(4)}`,
          `1m: ${scored.detail.ret1>=0?'+':''}${scored.detail.ret1}% · 3m: ${scored.detail.ret3>=0?'+':''}${scored.detail.ret3}%`,
          `Vol: ${scored.detail.volX}x baseline · Liq: $${scored.detail.liq.toLocaleString()}`,
          `Structure: ${scored.detail.breakout?'NEW HIGH / BREAK':'accel'}`,
          `Score: ${scored.score}/100${scored.forming?' · (forming 1m)':''}`,
          `Reason: ${scored.reasons.slice(0,4).join(' + ')||'momentum'}`,
          `https://sasikar.github.io/Trading/index.html?tab=breakouts`
        ].join('\n');

        const oldestTs = kl[0][0];
        const newestTs = kl[kl.length-1][0];
        const lagSec = Math.max(0, Math.round((now - newestTs)/1000));
        console.log(`ALERT_META ${name} oldest1m=${new Date(oldestTs).toISOString()} newest1m=${new Date(newestTs).toISOString()} lag_vs_newest_candle_sec=${lagSec} forming=${scored.forming}`);
        const res = await sendNtfy(title, body, 'high');
        if (!res.error) {
          sent++;
          findings.push(`${name} ${kind} ${scored.score}`);
          tokState.lastAlert = now;
          tokState.lastScore = scored.score;
          tokState.lastState = scored.state;
          tokState.lastKind = kind;
          tokState.lastAlertLagSec = lagSec;
          tokState.lastNewestCandle = newestTs;
          console.log(`ALERT ${name} ${kind}`);
        }
      }

      tokState.lastScore = Math.max(tokState.lastScore||0, scored.score);
      tokState.lastState = scored.state;
      tokState.updated = now;
      state.tokens[key] = tokState;
    } catch (e) {
      const em = (e && e.message) ? e.message : String(e);
      console.warn(`${name} fail:`, em);
      errors.push({ name, error: em.slice(0,120) });
      if (/429|rate limit/i.test(em)) rateLimited = true;
    }
  }

  // prune token state to current universe + recent
  const keep = new Set(items.map(i => `${i.chain}|${i.ca}`));
  for (const k of Object.keys(state.tokens)) {
    if (!keep.has(k) && (Date.now() - (state.tokens[k].updated||0) > 7*864e5)) delete state.tokens[k];
  }
  state.updated = new Date().toISOString();
  state.lastFindings = findings;
  state.lastHttp = { pool: httpPool, ohlcv: httpOhlcv, total: httpRequests, at: new Date().toISOString() };
  state.cfg = { scoreThreshold: CFG.scoreThreshold, minLiqUsd: CFG.minLiqUsd, cooldownMs: CFG.cooldownMs };

  const topScores = scoreboard.slice().sort((a,b)=>b.score-a.score).slice(0,8);
  let health = healthBase;
  if (rateLimited) health = 'RATE_LIMITED';
  else if (errors.length && scoreboard.length===0) health = 'ERROR';
  else if (!items.length) health = 'NO_CANDIDATES';

  // last alert from token states
  let lastAlert = state.lastAlert || null;
  if (findings.length) {
    const top = scoreboard.find(s => findings.some(f => f.startsWith(s.name))) || scoreboard[0];
    if (top) {
      lastAlert = {
        name: top.name,
        score: top.score,
        state: top.state,
        reason: top.reason,
        at: new Date().toISOString(),
        kind: findings.find(f => f.startsWith(top.name)) || findings[0]
      };
    }
  }
  state.lastAlert = lastAlert;
  state.ui = {
    lastScan: new Date().toISOString(),
    candidates: items.length,
    scanned: scoreboard.length,
    errorCount: errors.length,
    alertsThisRun: sent,
    health,
    topScores,
    errors: errors.slice(0,5),
    threshold: CFG.scoreThreshold,
    http: state.lastHttp
  };
  saveJSON(STATE, state);
  const elapsed = ((Date.now() - runStarted)/1000).toFixed(1);
  const rpm = elapsed > 0 ? (httpRequests / (elapsed/60)).toFixed(1) : '0';
  console.log(`HTTP_STATS pool=${httpPool} ohlcv=${httpOhlcv} total=${httpRequests} elapsed_sec=${elapsed} theoretical_rpm=${rpm}`);
  console.log(`Done. alerts=${sent} findings=${findings.length}`);

}

main().catch(e => { console.error(e); process.exit(1); });
