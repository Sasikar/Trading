/* Breakout Memes tab — DexScreener live scan + ntfy + run status.
   Overrides window.showBreakoutMemes / scanBreakoutMemes / setBreakoutTF / loadMomentum1mStatus.
   Does not use GeckoTerminal (rate-limited). */
(function () {
  const NTFY_FALLBACK = 'MyTradingMemeBreakout44';
  let NTFY_TOPIC = (function () {
    try {
      return localStorage.getItem('bo_ntfy_topic') || NTFY_FALLBACK;
    } catch (e) {
      return NTFY_FALLBACK;
    }
  })();
  function ntfyUrl() {
    return 'https://ntfy.sh/' + encodeURIComponent(NTFY_TOPIC);
  }
  const SENT_KEY = 'bo_ntfy_sent_v2';
  const SNAP_KEY = 'bo_price_snap_v1';
  const LIVE_MS = 45000;
  let breakoutTF = '4h';
  let breakoutScanBusy = false;
  let liveTimer = null;
  let liveOn = true;
  let lastLiveHits = [];
  let lastLiveAt = 0;
  let lastLiveErr = '';

  const $ = (id) => document.getElementById(id);

  function chainIdOf(chain) {
    const c = String(chain || '').toLowerCase();
    if (c === 'sol' || c === 'solana') return 'solana';
    if (c === 'eth' || c === 'ethereum') return 'ethereum';
    return c || 'solana';
  }
  function recents() {
    try {
      if (typeof coinRecentsLoadLocal === 'function') return coinRecentsLoadLocal() || [];
    } catch (e) {}
    return [];
  }
  function loadSent() {
    try {
      return JSON.parse(localStorage.getItem(SENT_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }
  function saveSent(o) {
    try {
      localStorage.setItem(SENT_KEY, JSON.stringify(o));
    } catch (e) {}
  }
  function loadSnap() {
    try {
      return JSON.parse(localStorage.getItem(SNAP_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }
  function saveSnap(o) {
    try {
      localStorage.setItem(SNAP_KEY, JSON.stringify(o));
    } catch (e) {}
  }

  function pickBestPair(pairs, chain, ca) {
    const want = chainIdOf(chain);
    const caL = String(ca || '').toLowerCase();
    let list = (pairs || []).filter((p) => p && p.chainId === want);
    if (caL) {
      const exact = list.filter(
        (p) =>
          String((p.baseToken && p.baseToken.address) || '').toLowerCase() === caL ||
          String((p.quoteToken && p.quoteToken.address) || '').toLowerCase() === caL
      );
      if (exact.length) list = exact;
    }
    if (!list.length && caL) {
      list = (pairs || []).filter(
        (p) =>
          String((p.baseToken && p.baseToken.address) || '').toLowerCase() === caL ||
          String((p.quoteToken && p.quoteToken.address) || '').toLowerCase() === caL
      );
    }
    list.sort((a, b) => +(((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0)));
    return list[0] || null;
  }

  function txWin(tx, key) {
    const x = (tx && tx[key]) || {};
    return { b: +x.buys || 0, s: +x.sells || 0 };
  }

  function scorePair(pair, tf, prevPrice) {
    const pc = pair.priceChange || {};
    const vol = pair.volume || {};
    const tx = pair.txns || {};
    const price = +pair.priceUsd || 0;
    const liq = +((pair.liquidity && pair.liquidity.usd) || 0);
    const m5 = +pc.m5 || 0,
      h1 = +pc.h1 || 0,
      h6 = +pc.h6 || 0,
      h24 = +pc.h24 || 0;
    const vm5 = +vol.m5 || 0,
      vh1 = +vol.h1 || 0;
    const t5 = txWin(tx, 'm5');
    const buyR = t5.b + t5.s ? t5.b / (t5.b + t5.s) : 0.5;
    const volX = vh1 / 12 > 0 ? vm5 / (vh1 / 12) : vm5 > 0 ? 2 : 0;
    const tickRet = prevPrice > 0 && price > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
    const stretched = h6 >= 80 || h24 >= 150 || m5 >= 35;
    const tfn = String(tf || '4h').toLowerCase();

    let event = '—',
      state = 'WATCH',
      fresh = false,
      held = false,
      age = 99;
    if (tfn === '4h') {
      if (m5 >= 3 && h1 >= 2 && volX >= 1.5 && !stretched) {
        event = 'NEW BREAKOUT';
        fresh = true;
        held = true;
        age = 0;
        state = 'EARLY';
      } else if (h1 > 0 && h6 >= 8) {
        event = 'BREAKOUT HELD';
        held = true;
        age = h6 >= 25 ? 3 : 1;
        state = h1 >= 6 && volX >= 1.3 && buyR >= 0.52 ? 'STRONG CONFIRMED' : 'EARLY';
      }
      if (stretched && (h1 > 5 || h6 > 40)) state = 'STRETCHED';
    } else if (tfn === '1d') {
      if (h6 >= 8 && h24 >= 5 && h24 < 40 && volX >= 1.2) {
        event = 'NEW BREAKOUT';
        fresh = true;
        held = true;
        age = 0;
        state = 'EARLY';
      } else if (h24 >= 10 && h6 > 0) {
        event = 'BREAKOUT HELD';
        held = true;
        age = 1;
        state = h24 >= 20 ? 'STRONG CONFIRMED' : 'EARLY';
      }
      if (h24 >= 80) state = 'STRETCHED';
    } else {
      if (h24 >= 15 && h6 > 0) {
        event = 'BREAKOUT HELD';
        held = true;
        age = 2;
        state = 'EARLY';
      }
      if (h24 >= 120) state = 'STRETCHED';
    }
    if ((m5 >= 4 || tickRet >= 2.5) && volX >= 2 && buyR >= 0.55 && !stretched) {
      event = 'NEW BREAKOUT';
      fresh = true;
      held = true;
      age = 0;
      if (state === 'WATCH') state = 'EARLY';
    }

    let score = 0;
    if (m5 >= 8) score += 25;
    else if (m5 >= 4) score += 18;
    else if (m5 >= 2) score += 10;
    else if (tickRet >= 2) score += 12;
    if (volX >= 4) score += 25;
    else if (volX >= 2) score += 16;
    else if (volX >= 1.4) score += 8;
    if (h1 >= 5 && m5 > 0) score += 16;
    else if (h1 >= 0 && m5 >= 2) score += 10;
    if (buyR >= 0.65 && t5.b + t5.s >= 20) score += 15;
    else if (buyR >= 0.55 && t5.b + t5.s >= 10) score += 9;
    if (liq >= 200000) score += 10;
    else if (liq >= 50000) score += 7;
    else if (liq >= 15000) score += 4;
    if (m5 > 0 && h1 > 0) score += 5;
    if (stretched) score -= 18;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const interesting = state !== 'WATCH' || fresh || held || score >= 55;
    return {
      state,
      event,
      fresh,
      held,
      age,
      interesting,
      score,
      confirms: Math.min(8, Math.round(score / 12.5)),
      sizePct: state === 'STRONG CONFIRMED' ? 80 : state === 'EARLY' ? 35 : 0,
      spot: price,
      liq,
      m5,
      h1,
      h6,
      h24,
      volX: +volX.toFixed(2),
      buyR: +buyR.toFixed(2),
      tickRet: +tickRet.toFixed(2),
      pairAddress: pair.pairAddress,
      dexUrl: pair.url || '',
      chain: pair.chainId
    };
  }

  async function fetchDexPairs(cas) {
    const uniq = [...new Set(cas.map((c) => String(c || '').trim()).filter(Boolean))];
    const all = [];
    const conc = 6;
    for (let i = 0; i < uniq.length; i += conc) {
      const chunk = uniq.slice(i, i + conc);
      const parts = await Promise.all(
        chunk.map(async function (ca) {
          const url = 'https://api.dexscreener.com/latest/dex/tokens/' + encodeURIComponent(ca);
          const r = await fetch(url, { cache: 'no-store' });
          if (!r.ok) throw new Error('DexScreener HTTP ' + r.status);
          const j = await r.json();
          return j.pairs || [];
        })
      );
      for (let p = 0; p < parts.length; p++) all.push.apply(all, parts[p]);
    }
    return all;
  }

  async function sendNtfy(title, message) {
    const topics = [...new Set([NTFY_TOPIC, NTFY_FALLBACK].filter(Boolean))];
    let ok = 0;
    let lastErr = null;
    for (let i = 0; i < topics.length; i++) {
      try {
        const r = await fetch('https://ntfy.sh/' + encodeURIComponent(topics[i]), {
          method: 'POST',
          headers: {
            Title: String(title || '').slice(0, 90),
            Priority: 'high',
            Tags: 'chart_with_upwards_trend,moneybag'
          },
          body: title + '\n' + message
        });
        if (!r.ok) throw new Error('ntfy HTTP ' + r.status);
        ok++;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!ok && lastErr) throw lastErr;
    return true;
  }

  function fmtAgo(iso) {
    try {
      const ms = Date.now() - new Date(iso).getTime();
      if (!isFinite(ms) || ms < 0) return '';
      const m = Math.round(ms / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + ' min ago';
      const h = Math.round(m / 60);
      return h + 'h ago';
    } catch (e) {
      return '';
    }
  }

  function _boRenderHits(hits) {
    return hits
      .map(function (h) {
        const col =
          h.state === 'STRONG CONFIRMED'
            ? '#62e3a0'
            : h.state === 'EARLY'
              ? '#e6c878'
              : h.state === 'STRETCHED'
                ? '#f0a060'
                : '#c5d0dc';
        const chainLab = h.chain === 'solana' ? 'SOL' : 'ETH';
        const caShort = h.ca && h.ca.length > 12 ? h.ca.slice(0, 6) + '…' + h.ca.slice(-4) : h.ca || '';
        return (
          '<div style="padding:12px 14px;border-radius:12px;border:1px solid #243041;background:#0b121a">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<div style="font-weight:900;font-size:15px;color:#e8eef6">' +
          h.name +
          ' <span style="font-size:11px;color:#8491a1;font-weight:700">' +
          chainLab +
          '</span></div>' +
          '<div style="font-weight:800;color:' +
          col +
          '">' +
          h.state +
          (h.score != null ? ' · ' + h.score : '') +
          '</div></div>' +
          '<div style="margin-top:6px;font-size:12px;color:#c5d0dc;line-height:1.45">' +
          h.event +
          ' · age ' +
          (h.age != null ? h.age : '—') +
          ' · ' +
          (h.fresh ? 'Fresh YES' : 'Fresh NO') +
          ' · 5m ' +
          (h.m5 >= 0 ? '+' : '') +
          (h.m5 != null ? h.m5.toFixed(1) : '—') +
          '% · 1h ' +
          (h.h1 >= 0 ? '+' : '') +
          (h.h1 != null ? Number(h.h1).toFixed(1) : '—') +
          '% · vol ' +
          (h.volX || '—') +
          'x' +
          (h.sizePct ? ' · size ' + h.sizePct + '%' : '') +
          '</div>' +
          '<div style="margin-top:4px;font-size:11px;color:#8491a1">' +
          caShort +
          (h.liq ? ' · liq $' + Math.round(h.liq).toLocaleString() : '') +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
          '<button type="button" data-bo-ca="' +
          h.ca +
          '" data-bo-chain="' +
          h.chain +
          '" class="bo-open-ca" style="padding:6px 10px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#62e3a0;font-weight:700;font-size:11px;cursor:pointer">Open in CA tab</button>' +
          (h.dexUrl
            ? '<a href="' +
              h.dexUrl +
              '" target="_blank" rel="noopener" style="padding:6px 10px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#6eb6ff;font-weight:700;font-size:11px;text-decoration:none">DexScreener</a>'
            : '') +
          '</div></div>'
        );
      })
      .join('');
  }

  async function pingNtfyTest() {
    try {
      await sendNtfy('Trading · ntfy test', 'Topic ' + NTFY_TOPIC + '\nIf you see this, alerts are live.');
      if ($('bo-ntfy-hint')) $('bo-ntfy-hint').textContent = 'Test ping sent to ' + NTFY_TOPIC;
    } catch (e) {
      if ($('bo-ntfy-hint')) $('bo-ntfy-hint').textContent = 'ntfy failed: ' + (e.message || e);
    }
  }

  async function maybeAlert(hits, tf) {
    const sent = loadSent();
    const now = Date.now();
    for (const k of Object.keys(sent)) {
      if (now - (sent[k] || 0) > 3 * 3600e3) delete sent[k];
    }
    let n = 0;
    for (const h of hits) {
      if (!(h.fresh && h.held && h.age <= 2)) continue;
      if (h.score < 55 && h.event !== 'NEW BREAKOUT') continue;
      const key = (h.ca || '') + '|' + tf + '|' + h.event;
      if (sent[key] && now - sent[key] < 30 * 60e3) continue;
      const title = '🚀 ' + h.name + ' · ' + String(tf).toUpperCase() + ' breakout';
      const msg = [
        h.name + ' (' + (h.chain === 'solana' ? 'SOL' : 'ETH') + ')',
        'Event: ' + h.event + ' · ' + h.state + ' · score ' + h.score,
        '5m ' + h.m5 + '% · 1h ' + h.h1 + '% · vol ' + h.volX + 'x',
        'CA: ' + h.ca,
        'https://sasikar.github.io/Trading/index.html?tab=breakouts'
      ].join('\n');
      try {
        await sendNtfy(title, msg);
        sent[key] = now;
        n++;
      } catch (e) {
        console.warn('ntfy', e);
      }
    }
    saveSent(sent);
    return n;
  }

  function setLiveBtn() {
    const b = $('bo-live-btn');
    if (!b) return;
    b.textContent = liveOn ? 'Live watch ON' : 'Live watch OFF';
    b.style.background = liveOn ? '#1a9b6c' : '#121a24';
    b.style.color = liveOn ? '#fff' : '#c5d0dc';
  }

  function startLive() {
    stopLive();
    if (!liveOn) return;
    liveTimer = setInterval(function () {
      const on = document.getElementById('breakouts-panel');
      if (!on || on.style.display === 'none') return;
      scanBreakoutMemes(true);
    }, LIVE_MS);
  }
  function stopLive() {
    if (liveTimer) {
      clearInterval(liveTimer);
      liveTimer = null;
    }
  }

  async function loadRunStatus(force) {
    const healthEl = $('m1m-health'),
      metaEl = $('m1m-meta'),
      lastEl = $('m1m-last-alert'),
      topEl = $('m1m-top');
    if (!healthEl) return;
    if (force) healthEl.textContent = 'Refreshing…';
    let mom = null,
      bo = null,
      runs = [];
    try {
      const r = await fetch('data/momentum-1m-state.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) mom = await r.json();
    } catch (e) {}
    try {
      const r = await fetch('data/breakout-alert-state.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) bo = await r.json();
    } catch (e) {}
    if (bo && bo.ui && bo.ui.topic) {
      NTFY_TOPIC = bo.ui.topic;
      try {
        localStorage.setItem('bo_ntfy_topic', NTFY_TOPIC);
      } catch (e) {}
    }
    try {
      const r = await fetch(
        'https://api.github.com/repos/Sasikar/Trading/actions/runs?per_page=8',
        { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' }
      );
      if (r.ok) {
        const j = await r.json();
        runs = (j.workflow_runs || []).filter((w) =>
          /breakout|momentum/i.test(w.name || w.path || '')
        );
      }
    } catch (e) {}

    const ui = (mom && mom.ui) || {};
    const scan = ui.lastScan || (mom && mom.updated) || (bo && (bo.ui && bo.ui.lastScan)) || (bo && bo.updated);
    const ago = scan ? fmtAgo(scan) : '';
    const staleMin = scan ? (Date.now() - new Date(scan).getTime()) / 60000 : 999;
    let health = ui.health || (scan ? 'OK' : 'UNKNOWN');
    if (staleMin > 25 && health === 'OK') health = 'STALE';
    if (lastLiveAt && Date.now() - lastLiveAt < 90000) health = 'LIVE';
    const col =
      health === 'LIVE' || health === 'OK'
        ? '#62e3a0'
        : health === 'STALE' || health === 'RATE_LIMITED'
          ? '#f0a060'
          : health === 'NO_TOPIC'
            ? '#e6c878'
            : '#ff6f7c';
    healthEl.style.color = col;
    const liveBit = lastLiveAt
      ? ' · live tick ' + fmtAgo(new Date(lastLiveAt).toISOString())
      : '';
    healthEl.textContent =
      health +
      (ui.alertsThisRun ? ' · bg alerts ' + ui.alertsThisRun : '') +
      liveBit +
      ' · DexScreener';

    const runLine = runs
      .slice(0, 2)
      .map(function (w) {
        const when = w.updated_at || w.created_at;
        return (
          (w.name || '').replace(' (ntfy)', '') +
          ' ' +
          (w.conclusion || w.status) +
          ' · ' +
          fmtAgo(when)
        );
      })
      .join(' · ');

    if (metaEl) {
      metaEl.innerHTML =
        'Last background scan: ' +
        (scan || '—') +
        (ago ? ' · ' + ago : '') +
        ' · CAs ' +
        (ui.candidates != null ? ui.candidates : recents().length) +
        ' · scanned ' +
        (ui.scanned != null ? ui.scanned : lastLiveHits.length) +
        '<br>ntfy topic <b style="color:#e8eef6">' +
        NTFY_TOPIC +
        '</b> · source DexScreener (not GeckoTerminal)' +
        (runLine ? '<br>Actions: ' + runLine : '') +
        (lastLiveErr ? '<br><span style="color:#ff6f7c">' + lastLiveErr + '</span>' : '');
    }

    const la = mom && mom.lastAlert;
    if (lastEl) {
      if (la && la.name) {
        lastEl.innerHTML =
          'Last alert: <b style="color:#e8eef6">' +
          la.name +
          '</b> · ' +
          (la.kind || la.state || '') +
          ' · score ' +
          (la.score != null ? la.score : '—') +
          '/100' +
          (la.reason ? ' · ' + la.reason : '') +
          (la.at ? ' · ' + la.at : '');
      } else if (bo && bo.lastFindings && bo.lastFindings.length) {
        lastEl.textContent = 'Last breakout findings: ' + bo.lastFindings.join(', ');
      } else {
        lastEl.textContent = 'Last alert: none yet — live watch will ping ' + NTFY_TOPIC + ' on a fresh breakout';
      }
    }

    const tops = ui.topScores || lastLiveHits.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 8);
    if (topEl) {
      if (!tops.length) {
        topEl.innerHTML = '<div style="color:#8491a1">No scores yet — scan runs automatically on this tab</div>';
      } else {
        topEl.innerHTML =
          '<div style="font-size:10px;letter-spacing:.06em;color:#8491a1;font-weight:800;margin-bottom:4px">TOP SCORES</div>' +
          tops
            .map(function (t) {
              const c = t.score >= 62 ? '#62e3a0' : t.score >= 50 ? '#e6c878' : '#8491a1';
              return (
                '<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid #1a2430">' +
                '<span><b style="color:#e8eef6">' +
                t.name +
                '</b> <span style="color:#8491a1">' +
                (t.state || '') +
                '</span></span>' +
                '<span style="color:' +
                c +
                ';font-weight:800">' +
                t.score +
                '/100</span></div>' +
                '<div style="font-size:11px;color:#8491a1;margin:0 0 4px">' +
                (t.reason || t.event || '') +
                (t.ret1 != null ? ' · 5m ' + (t.ret1 >= 0 ? '+' : '') + t.ret1 + '%' : '') +
                '</div>'
              );
            })
            .join('');
      }
    }
    const hint = $('bo-ntfy-hint');
    if (hint && !hint.dataset.locked) {
      hint.textContent = 'Subscribe in the ntfy app to topic ' + NTFY_TOPIC;
    }
  }

  async function scanBreakoutMemes(quiet) {
    if (breakoutScanBusy) return;
    const list = $('bo-list');
    const st = $('bo-status');
    const src = $('bo-source');
    let rows = recents();
    if (!rows.length) {
      try {
        if (window.coinRecentsSync) await window.coinRecentsSync(true);
        rows = recents();
      } catch (e) {}
    }
    if (!rows.length) {
      try {
        const r = await fetch('data/ca-recents.json?t=' + Date.now(), { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          rows = j.items || (Array.isArray(j) ? j : []);
        }
      } catch (e) {}
    }
    if (!rows.length) {
      if (list)
        list.innerHTML =
          '<div style="color:#8491a1;font-size:12px">No saved CAs. Load coins on the CA tab first — they appear here automatically.</div>';
      if (st) st.textContent = '0 saved CAs';
      return;
    }
    breakoutScanBusy = true;
    if (src) src.textContent = 'SCANNING · DEX';
    if (st) st.textContent = 'DexScreener ' + rows.length + ' CA(s) · ' + breakoutTF.toUpperCase();
    if (list && !quiet)
      list.innerHTML =
        '<div style="color:#8491a1;font-size:12px">Fetching DexScreener for ' +
        rows.length +
        ' saved memes…</div>';

    try {
      const pairs = await fetchDexPairs(rows.map((e) => e.ca));
      const snap = loadSnap();
      const hits = [];
      const errors = [];
      for (let i = 0; i < rows.length; i++) {
        const e = rows[i];
        const pair = pickBestPair(pairs, e.chain, e.ca);
        if (!pair) {
          errors.push(e.name || e.ca);
          continue;
        }
        const key = (e.chain || '') + '|' + e.ca;
        const brk = scorePair(pair, breakoutTF, (snap[key] && snap[key].price) || 0);
        snap[key] = { price: brk.spot, t: Date.now() };
        if (!brk.interesting) continue;
        hits.push({
          name: e.name || (pair.baseToken && pair.baseToken.symbol) || e.ca.slice(0, 8),
          chain: chainIdOf(e.chain),
          ca: e.ca,
          state: brk.state,
          age: brk.age,
          fresh: brk.fresh,
          held: brk.held,
          confirms: brk.confirms,
          sizePct: brk.sizePct,
          spot: brk.spot,
          event: brk.event,
          score: brk.score,
          m5: brk.m5,
          h1: brk.h1,
          h6: brk.h6,
          h24: brk.h24,
          volX: brk.volX,
          buyR: brk.buyR,
          liq: brk.liq,
          dexUrl: brk.dexUrl,
          reason: brk.event + (brk.volX ? ' · vol ' + brk.volX + 'x' : '')
        });
      }
      saveSnap(snap);
      hits.sort((a, b) => (b.score || 0) - (a.score || 0));
      lastLiveHits = hits;
      lastLiveAt = Date.now();
      lastLiveErr = errors.length ? errors.length + ' without a DexScreener pool' : '';
      const nAlert = await maybeAlert(hits, breakoutTF);
      if (src) src.textContent = 'LIVE · DEX · ' + breakoutTF.toUpperCase();
      if (st)
        st.textContent =
          hits.length +
          ' flagged · scanned ' +
          rows.length +
          (errors.length ? ' · ' + errors.length + ' skipped' : '') +
          (nAlert ? ' · ' + nAlert + ' ntfy' : '');
      if (list) {
        if (!hits.length) {
          list.innerHTML =
            '<div style="padding:14px;border-radius:12px;border:1px solid #243041;background:#0b121a;color:#8491a1;font-size:13px">No breakouts among ' +
            rows.length +
            ' saved CA(s) on <b style="color:#c5d0dc">' +
            breakoutTF.toUpperCase() +
            '</b> right now. Live watch keeps scanning DexScreener.</div>';
        } else list.innerHTML = _boRenderHits(hits);
      }
      try {
        loadRunStatus(false);
      } catch (e) {}
    } catch (err) {
      lastLiveErr = String(err && err.message ? err.message : err);
      if (src) src.textContent = 'ERROR';
      if (st) st.textContent = lastLiveErr;
      if (list)
        list.innerHTML =
          '<div style="color:#ff6f7c;font-size:13px">Scan failed: ' + lastLiveErr + '</div>';
    }
    breakoutScanBusy = false;
  }

  function showBreakoutMemes(on) {
    const p = $('breakouts-panel');
    const panels = $('tf-panels'),
      trend = $('trend-panel'),
      sp = $('struct-panel'),
      mp = $('macro-panel'),
      sg = $('signal-panel');
    const mg = $('memegate-panel'),
      cp = $('coin-panel'),
      af = $('antifomo-panel');
    if (on) {
      if (panels) {
        panels.classList.add('hidden');
        panels.style.display = 'none';
      }
      [trend, sp, mp, sg].forEach(function (el) {
        if (el) {
          el.style.display = 'none';
          el.classList.remove('on');
        }
      });
      if (mg) mg.style.display = 'none';
      if (cp) {
        cp.style.display = 'none';
        cp.classList.remove('on');
      }
      if (af) {
        af.style.display = 'none';
        af.classList.remove('on');
      }
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      try {
        if (window.coinRecentsRender) window.coinRecentsRender();
      } catch (e) {}
      const n = recents().length;
      if ($('bo-status'))
        $('bo-status').textContent = n ? n + ' saved CA(s) · DexScreener' : 'No saved CAs — load some on CA tab first';
      setLiveBtn();
      loadRunStatus(false);
      scanBreakoutMemes(false);
      startLive();
    } else {
      if (p) {
        p.style.display = 'none';
        p.classList.remove('on');
      }
      stopLive();
    }
  }

  window.showBreakoutMemes = showBreakoutMemes;
  window.scanBreakoutMemes = function () {
    return scanBreakoutMemes(false);
  };
  window.loadMomentum1mStatus = loadRunStatus;
  window.setBreakoutTF = function (tf) {
    breakoutTF = tf || '4h';
    document.querySelectorAll('.bo-tf-btn').forEach(function (b) {
      const on = b.getAttribute('data-botf') === breakoutTF;
      b.classList.toggle('on', on);
      b.style.background = on ? '#1a9b6c' : '#121a24';
      b.style.color = on ? '#fff' : '#c5d0dc';
    });
    scanBreakoutMemes(false);
  };
  window.toggleBreakoutLive = function () {
    liveOn = !liveOn;
    setLiveBtn();
    if (liveOn) {
      startLive();
      scanBreakoutMemes(true);
    } else stopLive();
  };
  window.pingBreakoutNtfy = pingNtfyTest;
})();
