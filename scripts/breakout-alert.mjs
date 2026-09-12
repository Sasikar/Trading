#!/usr/bin/env node
/**
 * Breakout alert scanner for saved CAs (data/ca-recents.json).
 * Sends ntfy when a NEW/held fresh breakout appears.
 * No Cloudflare — run via GitHub Actions cron.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RECENTS = path.join(ROOT, 'data', 'ca-recents.json');
const STATE = path.join(ROOT, 'data', 'breakout-alert-state.json');
const NTFY_TOPIC = process.env.NTFY_TOPIC || 'MyTradingMemeBreakout44';
const NTFY_URL = process.env.NTFY_URL || `https://ntfy.sh/${NTFY_TOPIC}`;
const TFS = (process.env.BREAKOUT_TFS || '4h,1d').split(',').map(s => s.trim()).filter(Boolean);
const SLEEP_MS = Number(process.env.BREAKOUT_SLEEP_MS || 400);

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function loadJSON(p, fallback){
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJSON(p, obj){
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

async function fetchJSON(url, tries = 3){
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'TradingBreakoutAlert/1.0' },
        cache: 'no-store'
      });
      if (r.status === 429) {
        await sleep(1500 * (i + 1));
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      last = e;
      await sleep(500 * (i + 1));
    }
  }
  throw last || new Error('fetch failed');
}

async function resolvePool(chain, ca){
  const net = chain === 'sol' || chain === 'solana' ? 'solana' : 'eth';
  const url = `https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${encodeURIComponent(ca)}/pools?page=1`;
  const j = await fetchJSON(url);
  const rows = (j && j.data) || [];
  if (!rows.length) throw new Error('no pools');
  // pick highest reserve / liquidity-ish
  rows.sort((a, b) => {
    const ra = Number(a.attributes?.reserve_in_usd || a.attributes?.volume_usd?.h24 || 0);
    const rb = Number(b.attributes?.reserve_in_usd || b.attributes?.volume_usd?.h24 || 0);
    return rb - ra;
  });
  const top = rows[0];
  return {
    network: net,
    address: top.attributes?.address || top.id?.split('_').pop(),
    name: top.attributes?.name || ca.slice(0, 8),
    base: top.attributes?.name?.split(' / ')[0] || ca.slice(0, 8)
  };
}

async function fetchOHLCV(network, poolAddress, tf){
  // GT: day, hour, minute — map 4h/1d/1w
  const map = {
    '4h': { timeframe: 'hour', aggregate: 4 },
    '1d': { timeframe: 'day', aggregate: 1 },
    '1w': { timeframe: 'day', aggregate: 7 },
    '1h': { timeframe: 'hour', aggregate: 1 }
  };
  const m = map[tf] || map['4h'];
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}/ohlcv/${m.timeframe}?aggregate=${m.aggregate}&limit=100&currency=usd`;
  const j = await fetchJSON(url);
  // list is [ts, o, h, l, c, vol] sometimes newest first
  let list = j?.data?.attributes?.ohlcv_list || [];
  list = list.map(r => [Number(r[0]) * (String(r[0]).length < 13 ? 1000 : 1), +r[1], +r[2], +r[3], +r[4], +r[5]])
    .filter(k => isFinite(k[4]) && k[4] > 0)
    .sort((a, b) => a[0] - b[0]);
  return list;
}

/** Same idea as site coinBreakoutAge — first held close above prior range high */
function breakoutInfo(kl){
  const n = kl.length;
  if (n < 25) return { age: 99, fresh: false, held: false, level: null };
  const closes = kl.map(k => +k[4]);
  const highs = kl.map(k => +k[2]);
  let rh = -Infinity;
  for (let i = n - 22; i <= n - 3; i++) if (i >= 0) rh = Math.max(rh, highs[i]);
  if (!isFinite(rh)) rh = highs[n - 3];
  const c0 = closes[n - 1];
  const heldRolling = c0 >= rh * 0.997;
  let firstIdx = null, breakLevel = null;
  const lookStart = Math.max(22, n - 20);
  for (let i = lookStart; i < n; i++) {
    let prevH = -Infinity;
    for (let j = i - 21; j <= i - 2; j++) if (j >= 0) prevH = Math.max(prevH, highs[j]);
    if (!isFinite(prevH)) continue;
    if (closes[i] > prevH && c0 >= prevH * 0.997) {
      if (firstIdx == null) { firstIdx = i; breakLevel = prevH; }
    }
  }
  const age = firstIdx != null ? (n - 1 - firstIdx) : 99;
  const fresh = heldRolling && firstIdx != null && age <= 2;
  return { age, fresh, held: heldRolling, level: breakLevel != null ? breakLevel : rh, firstIdx };
}

function alertKey(item, tf, brk){
  // one alert per coin+tf+firstBreak index window
  return `${item.chain}|${item.ca}|${tf}|age0-${brk.firstIdx != null ? brk.firstIdx : 'x'}`;
}

async function sendNtfy(title, message){
  const body = `${title}\n${message}`;
  const r = await fetch(NTFY_URL, {
    method: 'POST',
    headers: {
      'Title': title.slice(0, 80),
      'Priority': 'high',
      'Tags': 'chart_with_upwards_trend,moneybag'
    },
    body
  });
  if (!r.ok) throw new Error(`ntfy HTTP ${r.status}`);
  return r.json().catch(() => ({}));
}

async function main(){
  const recentsDoc = loadJSON(RECENTS, { items: [] });
  const items = Array.isArray(recentsDoc) ? recentsDoc : (recentsDoc.items || []);
  const state = loadJSON(STATE, { sent: {}, updated: null });
  if (!state.sent || typeof state.sent !== 'object') state.sent = {};

  console.log(`CAs: ${items.length} · TFs: ${TFS.join(',')} · ntfy: ${NTFY_TOPIC}`);
  if (!items.length) {
    console.log('No saved CAs — nothing to scan');
    return;
  }

  let sentCount = 0;
  const findings = [];

  for (const item of items) {
    const chain = item.chain || 'solana';
    const ca = item.ca;
    const name = item.name || item.base || ca.slice(0, 8);
    let pool;
    try {
      pool = await resolvePool(chain, ca);
      await sleep(SLEEP_MS);
    } catch (e) {
      console.warn(`resolve fail ${name}:`, e.message || e);
      continue;
    }

    for (const tf of TFS) {
      try {
        const klRaw = await fetchOHLCV(pool.network, pool.address, tf);
        await sleep(SLEEP_MS);
        // drop forming candle
        const kl = klRaw.length > 2 ? klRaw.slice(0, -1) : klRaw;
        const brk = breakoutInfo(kl);
        const interesting = brk.fresh && brk.held && brk.age != null && brk.age <= 2;
        if (!interesting) {
          console.log(`${name} ${tf}: no fresh breakout (age=${brk.age}, fresh=${brk.fresh})`);
          continue;
        }
        const key = alertKey(item, tf, brk);
        // Only ping on age 0 (true NEW) or first time we see this breakout run
        const isNew = brk.age === 0 || !state.sent[key];
        if (!isNew) {
          console.log(`${name} ${tf}: already alerted ${key}`);
          continue;
        }
        // Prefer age 0; still alert age 1-2 once if never sent
        if (brk.age > 2) continue;

        const title = `🚀 ${name} · ${tf.toUpperCase()} breakout`;
        const msg = [
          `${name} (${chain === 'solana' || chain === 'sol' ? 'SOL' : 'ETH'})`,
          `TF: ${tf.toUpperCase()}`,
          `Event: ${brk.age === 0 ? 'NEW BREAKOUT' : 'BREAKOUT HELD'} · age ${brk.age} · Fresh YES`,
          `CA: ${ca}`,
          `Site: https://sasikar.github.io/Trading/index.html?tab=breakouts`
        ].join('\n');

        await sendNtfy(title, msg);
        state.sent[key] = { t: Date.now(), name, tf, age: brk.age };
        sentCount++;
        findings.push(`${name} ${tf} age ${brk.age}`);
        console.log(`ALERT sent: ${name} ${tf}`);
        await sleep(300);
      } catch (e) {
        console.warn(`scan fail ${name} ${tf}:`, e.message || e);
      }
    }
  }

  // prune very old keys (keep last 200)
  const entries = Object.entries(state.sent).sort((a, b) => (b[1].t || 0) - (a[1].t || 0)).slice(0, 200);
  state.sent = Object.fromEntries(entries);
  state.updated = new Date().toISOString();
  state.lastFindings = findings;
  saveJSON(STATE, state);

  console.log(`Done. Alerts sent: ${sentCount}. Findings: ${findings.length}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
