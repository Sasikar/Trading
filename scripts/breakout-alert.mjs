#!/usr/bin/env node
/**
 * Breakout alert scanner for saved CAs (data/ca-recents.json).
 * DexScreener-only (no GeckoTerminal — that 429s). ntfy on NEW/held breakouts.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  NTFY_DEFAULT_TOPIC,
  fetchDexPairsForCas,
  pickBestPair,
  tfBreakout,
  sendNtfy,
  chainIdOf
} from './dex-breakout-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RECENTS = path.join(ROOT, 'data', 'ca-recents.json');
const STATE = path.join(ROOT, 'data', 'breakout-alert-state.json');
const SCAN = path.join(ROOT, 'data', 'breakout-scan.json');
const NTFY_TOPIC = process.env.NTFY_TOPIC || NTFY_DEFAULT_TOPIC;
const TFS = (process.env.BREAKOUT_TFS || '4h,1d').split(',').map((s) => s.trim()).filter(Boolean);

function loadJSON(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}
function saveJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

async function publishViaContents(relPath, obj) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const repo = process.env.GITHUB_REPOSITORY || 'Sasikar/Trading';
  if (!token) {
    saveJSON(path.join(ROOT, relPath), obj);
    console.warn('No GITHUB_TOKEN — wrote local ' + relPath);
    return false;
  }
  const url = `https://api.github.com/repos/${repo}/contents/${relPath}`;
  const bodyContent = Buffer.from(JSON.stringify(obj, null, 2) + '\n').toString('base64');
  let sha = null;
  try {
    const gr = await fetch(url + '?ref=master', {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
    });
    if (gr.ok) sha = (await gr.json()).sha;
  } catch (e) {
    console.warn('GET sha', e.message || e);
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const payload = {
      message: 'chore: breakout scan ' + new Date().toISOString().slice(0, 16) + 'Z',
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
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
      });
      if (gr2.ok) sha = (await gr2.json()).sha;
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      continue;
    }
    if (!pr.ok) throw new Error('PUT ' + pr.status + ' ' + (await pr.text()).slice(0, 160));
    console.log('PUBLISHED ' + relPath);
    return true;
  }
  return false;
}

async function main() {
  const recentsDoc = loadJSON(RECENTS, { items: [] });
  const items = Array.isArray(recentsDoc) ? recentsDoc : recentsDoc.items || [];
  const state = loadJSON(STATE, { sent: {}, updated: null });
  if (!state.sent || typeof state.sent !== 'object') state.sent = {};

  console.log(`CAs: ${items.length} · TFs: ${TFS.join(',')} · ntfy: ${NTFY_TOPIC} · source: DexScreener`);
  if (!items.length) {
    console.log('No saved CAs — nothing to scan');
    return;
  }

  const pairs = await fetchDexPairsForCas(items.map((i) => i.ca));
  console.log('DexScreener pairs returned:', pairs.length);

  let sentCount = 0;
  const findings = [];
  const hits = [];
  const errors = [];
  const scanned = [];

  for (const item of items) {
    const name = item.name || item.base || String(item.ca || '').slice(0, 8);
    const pair = pickBestPair(pairs, item.chain, item.ca);
    if (!pair) {
      errors.push({ name, error: 'no DexScreener pair' });
      console.warn(name + ': no pair');
      continue;
    }
    scanned.push(name);
    for (const tf of TFS) {
      const brk = tfBreakout(pair, tf);
      brk.name = name;
      brk.ca = item.ca;
      brk.chain = chainIdOf(item.chain);
      brk.tf = tf;
      if (brk.interesting) hits.push(brk);
      const interesting = brk.fresh && brk.held && brk.age != null && brk.age <= 2;
      if (!interesting) {
        console.log(`${name} ${tf}: no fresh breakout (state=${brk.state} age=${brk.age} 5m=${brk.m5} 1h=${brk.h1})`);
        continue;
      }
      const key = `${item.chain}|${item.ca}|${tf}|${brk.event}|${brk.age}`;
      if (state.sent[key] && Date.now() - (state.sent[key].t || 0) < 3 * 3600e3) {
        console.log(`${name} ${tf}: already alerted`);
        continue;
      }
      const title = `🚀 ${name} · ${tf.toUpperCase()} breakout`;
      const msg = [
        `${name} (${brk.chain === 'solana' ? 'SOL' : 'ETH'})`,
        `TF: ${tf.toUpperCase()}`,
        `Event: ${brk.event} · ${brk.state} · age ${brk.age} · Fresh ${brk.fresh ? 'YES' : 'NO'}`,
        `5m ${brk.m5}% · 1h ${brk.h1}% · 6h ${brk.h6}% · 24h ${brk.h24}%`,
        `Vol ${brk.volX}x · buys ${Math.round((brk.buyR || 0) * 100)}% · liq $${Math.round(brk.liq || 0).toLocaleString()}`,
        `CA: ${item.ca}`,
        `Dex: ${brk.dexUrl || ''}`,
        `Site: https://sasikar.github.io/Trading/index.html?tab=breakouts`
      ].join('\n');
      try {
        await sendNtfy(NTFY_TOPIC, title, msg);
        state.sent[key] = { t: Date.now(), name, tf, age: brk.age, event: brk.event };
        sentCount++;
        findings.push(`${name} ${tf} ${brk.event} age ${brk.age}`);
        console.log('ALERT sent: ' + name + ' ' + tf);
      } catch (e) {
        console.warn('ntfy fail', e.message || e);
        errors.push({ name, error: String(e.message || e).slice(0, 120) });
      }
    }
  }

  const entries = Object.entries(state.sent)
    .sort((a, b) => (b[1].t || 0) - (a[1].t || 0))
    .slice(0, 200);
  state.sent = Object.fromEntries(entries);
  state.updated = new Date().toISOString();
  state.lastFindings = findings;
  state.source = 'dexscreener';
  state.ui = {
    lastScan: state.updated,
    health: errors.length && !scanned.length ? 'ERROR' : 'OK',
    source: 'DexScreener',
    candidates: items.length,
    scanned: scanned.length,
    hits: hits.length,
    alertsThisRun: sentCount,
    errorCount: errors.length,
    errors: errors.slice(0, 5),
    topic: NTFY_TOPIC
  };
  saveJSON(STATE, state);

  const scanDoc = {
    updated: state.updated,
    source: 'dexscreener',
    tfs: TFS,
    count: hits.length,
    items: hits,
    ui: state.ui
  };
  saveJSON(SCAN, scanDoc);

  try {
    await publishViaContents('data/breakout-alert-state.json', state);
    await publishViaContents('data/breakout-scan.json', scanDoc);
  } catch (e) {
    console.warn('publish', e.message || e);
  }

  console.log(`Done. Alerts sent: ${sentCount}. Findings: ${findings.length}. Hits: ${hits.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
