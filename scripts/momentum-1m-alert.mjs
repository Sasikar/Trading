#!/usr/bin/env node
/**
 * LIVE MOMENTUM — DexScreener 5m/1h detector (no GeckoTerminal).
 * Shortlist: data/ca-recents.json
 * Alerts: ntfy (defaults to the topic already in use)
 * State: data/momentum-1m-state.json  (kept for the existing status panel)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  NTFY_DEFAULT_TOPIC,
  fetchDexPairsForCas,
  pickBestPair,
  momentumScore,
  sendNtfy,
  chainIdOf
} from './dex-breakout-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RECENTS = path.join(ROOT, 'data', 'ca-recents.json');
const STATE = path.join(ROOT, 'data', 'momentum-1m-state.json');

const CFG = {
  maxCandidates: 30,
  minLiqUsd: 15000,
  scoreThreshold: 62,
  cooldownMs: 20 * 60 * 1000,
  strongScoreBump: 12
};

const NTFY_TOPIC = (process.env.NTFY_TOPIC || NTFY_DEFAULT_TOPIC).trim();

function loadJSON(p, fb) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fb;
  }
}
function saveJSON(p, o) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
}

async function publishStateToGitHub(stateObj) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const repo = process.env.GITHUB_REPOSITORY || 'Sasikar/Trading';
  saveJSON(STATE, stateObj);
  if (!token) {
    console.warn('No GITHUB_TOKEN — state saved locally only');
    return false;
  }
  const rel = 'data/momentum-1m-state.json';
  const url = `https://api.github.com/repos/${repo}/contents/${rel}`;
  const bodyContent = Buffer.from(JSON.stringify(stateObj, null, 2) + '\n').toString('base64');
  let sha = null;
  try {
    const gr = await fetch(url + '?ref=master', {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
      cache: 'no-store'
    });
    if (gr.ok) sha = (await gr.json()).sha;
  } catch (e) {
    console.warn('GET state', e.message || e);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const payload = {
        message: 'chore: 1m momentum state ' + new Date().toISOString().slice(0, 16) + 'Z',
        content: bodyContent,
        branch: 'master'
      };
      if (sha) payload.sha = sha;
      const pr = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (pr.status === 409 || pr.status === 422) {
        const gr2 = await fetch(url + '?ref=master', {
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
          cache: 'no-store'
        });
        if (gr2.ok) sha = (await gr2.json()).sha;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      if (!pr.ok) throw new Error('PUT ' + pr.status + ' ' + (await pr.text()).slice(0, 150));
      console.log('STATE_PUBLISHED via Contents API → ' + rel);
      return true;
    } catch (e) {
      console.warn('publish attempt', attempt + 1, e.message || e);
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  console.error('STATE_PUBLISH_FAILED after retries');
  return false;
}

async function main() {
  const recentsDoc = loadJSON(RECENTS, { items: [] });
  let items = Array.isArray(recentsDoc) ? recentsDoc : recentsDoc.items || [];
  items = items
    .slice()
    .sort((a, b) => (b.t || 0) - (a.t || 0))
    .slice(0, CFG.maxCandidates);

  const state = loadJSON(STATE, { tokens: {}, updated: null });
  if (!state.tokens) state.tokens = {};

  const runStarted = Date.now();
  console.log(`MOMENTUM DexScreener · candidates=${items.length} · topic=${NTFY_TOPIC} · threshold=${CFG.scoreThreshold}`);

  let sent = 0;
  const findings = [];
  const scoreboard = [];
  const errors = [];
  let rateLimited = false;

  let pairs = [];
  try {
    pairs = await fetchDexPairsForCas(items.map((i) => i.ca));
    console.log('DexScreener pairs:', pairs.length);
  } catch (e) {
    const em = e && e.message ? e.message : String(e);
    console.error('DexScreener batch failed', em);
    if (/429|rate limit/i.test(em)) rateLimited = true;
    errors.push({ name: 'batch', error: em.slice(0, 120) });
  }

  for (const item of items) {
    const name = item.name || item.base || (item.ca || '').slice(0, 6);
    const key = `${item.chain}|${item.ca}`;
    const tokState = state.tokens[key] || {
      lastAlert: 0,
      lastScore: 0,
      lastState: 'NORMAL',
      lastKind: '',
      lastPrice: 0
    };
    try {
      const pair = pickBestPair(pairs, item.chain, item.ca);
      if (!pair) {
        errors.push({ name, error: 'no DexScreener pair' });
        continue;
      }
      const liq = +(pair.liquidity && pair.liquidity.usd) || 0;
      if (liq && liq < CFG.minLiqUsd) {
        console.log(`${name}: liq $${Math.round(liq)} < min — skip`);
        state.tokens[key] = tokState;
        continue;
      }
      const prev = tokState.lastPrice ? { price: tokState.lastPrice, t: tokState.updated } : null;
      const scored = momentumScore(pair, prev);
      console.log(
        `${name}: score=${scored.score} state=${scored.state} 5m=${scored.detail.m5}% vol=${scored.detail.volX}x buy=${scored.detail.buyR}`
      );
      scoreboard.push({
        name,
        chain: item.chain,
        ca: item.ca,
        score: scored.score,
        state: scored.state,
        reason: (scored.reasons || []).slice(0, 3).join(' + ') || '—',
        ret1: scored.detail.m5,
        volX: scored.detail.volX,
        forming: false
      });

      const now = Date.now();
      const inCooldown = now - (tokState.lastAlert || 0) < CFG.cooldownMs;
      const stronger = scored.score >= (tokState.lastScore || 0) + CFG.strongScoreBump;
      const kind = scored.reclaim ? 'RECLAIM' : 'EARLY';
      const isAlertState = scored.state === 'EARLY_BREAKOUT' || scored.state === 'RETEST/RECLAIM';

      let shouldSend = false;
      if (isAlertState && scored.score >= CFG.scoreThreshold) {
        if (!inCooldown) shouldSend = true;
        else if (stronger && kind !== tokState.lastKind) shouldSend = true;
        else if (scored.reclaim && tokState.lastKind !== 'RECLAIM') shouldSend = true;
      }

      if (shouldSend) {
        const title = scored.reclaim ? `🔄 5M RECLAIM — ${name}` : `🚀 5M BREAKOUT — ${name}`;
        const body = [
          `${name} (${chainIdOf(item.chain) === 'solana' ? 'SOL' : 'ETH'})`,
          `Price: $${scored.detail.price < 0.01 ? scored.detail.price.toPrecision(4) : scored.detail.price.toFixed(4)}`,
          `5m: ${scored.detail.m5 >= 0 ? '+' : ''}${scored.detail.m5}% · 1h: ${scored.detail.h1 >= 0 ? '+' : ''}${scored.detail.h1}%`,
          `Vol: ${scored.detail.volX}x · Buys: ${Math.round(scored.detail.buyR * 100)}% · Liq: $${Math.round(scored.detail.liq).toLocaleString()}`,
          `Score: ${scored.score}/100 · DexScreener`,
          `Reason: ${scored.reasons.slice(0, 4).join(' + ') || 'momentum'}`,
          pair.url || '',
          `https://sasikar.github.io/Trading/index.html?tab=breakouts`
        ].join('\n');
        try {
          await sendNtfy(NTFY_TOPIC, title, body, 'chart_with_upwards_trend,zap');
          sent++;
          findings.push(`${name} ${kind} ${scored.score}`);
          tokState.lastAlert = now;
          tokState.lastKind = kind;
          console.log(`ALERT ${name} ${kind}`);
        } catch (e) {
          console.warn('ntfy', e.message || e);
        }
      }

      tokState.lastScore = scored.score;
      tokState.lastState = scored.state;
      tokState.lastPrice = scored.detail.price;
      tokState.poolAddress = pair.pairAddress;
      tokState.poolNetwork = chainIdOf(item.chain);
      tokState.poolLiq = liq;
      tokState.updated = now;
      state.tokens[key] = tokState;
    } catch (e) {
      const em = e && e.message ? e.message : String(e);
      console.warn(`${name} fail:`, em);
      errors.push({ name, error: em.slice(0, 120) });
      if (/429|rate limit/i.test(em)) rateLimited = true;
    }
  }

  const keep = new Set(items.map((i) => `${i.chain}|${i.ca}`));
  for (const k of Object.keys(state.tokens)) {
    if (!keep.has(k) && Date.now() - (state.tokens[k].updated || 0) > 7 * 864e5) delete state.tokens[k];
  }
  state.updated = new Date().toISOString();
  state.lastFindings = findings;
  state.lastHttp = { pool: 0, ohlcv: 0, total: 1, source: 'dexscreener', at: new Date().toISOString() };
  state.cfg = { scoreThreshold: CFG.scoreThreshold, minLiqUsd: CFG.minLiqUsd, cooldownMs: CFG.cooldownMs };
  state.source = 'dexscreener';

  const topScores = scoreboard.slice().sort((a, b) => b.score - a.score).slice(0, 8);
  let health = 'OK';
  if (rateLimited) health = 'RATE_LIMITED';
  else if (errors.length && scoreboard.length === 0) health = 'ERROR';
  else if (!items.length) health = 'NO_CANDIDATES';

  let lastAlert = state.lastAlert || null;
  if (findings.length) {
    const top = scoreboard.find((s) => findings.some((f) => f.startsWith(s.name))) || scoreboard[0];
    if (top) {
      lastAlert = {
        name: top.name,
        score: top.score,
        state: top.state,
        reason: top.reason,
        at: new Date().toISOString(),
        kind: findings.find((f) => f.startsWith(top.name)) || findings[0]
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
    source: 'DexScreener',
    topic: NTFY_TOPIC,
    topScores,
    errors: errors.slice(0, 5),
    threshold: CFG.scoreThreshold,
    http: state.lastHttp
  };
  const ok = await publishStateToGitHub(state);
  console.log('state_publish_ok=' + ok);
  const elapsed = ((Date.now() - runStarted) / 1000).toFixed(1);
  console.log(`Done. alerts=${sent} findings=${findings.length} scanned=${scoreboard.length} elapsed_sec=${elapsed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
