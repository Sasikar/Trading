/* Breakout Memes tab — display only.
   All Dex polling, candles, scoring, ntfy live in the Cloudflare OHLCV worker.
   This file only GETs the API and paints cards. No DexScreener. No ntfy. No login. */
(function () {
  function apiBase() {
    try {
      if (window.BREAKOUT_API) return String(window.BREAKOUT_API).replace(/\/+$/, '');
    } catch (e) {}
    const h = location.hostname;
    if (h === 'sasikar.github.io' || /\.github\.io$/.test(h)) return 'https://trading-ohlcv.sasipudi.workers.dev';
    if (h === 'trading.sasipudi.workers.dev' || h === 'trading-ohlcv.sasipudi.workers.dev')
      return 'https://trading-ohlcv.sasipudi.workers.dev';
    return location.origin + '/api';
  }

  let breakoutTF = '4h';
  let busy = false;
  let liveOn = true;
  let liveTimer = null;
  let lastErr = '';
  const LIVE_MS = 20000;
  const TFS = ['1m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'];

  const $ = (id) => document.getElementById(id);

  async function api(path, opt) {
    const r = await fetch(apiBase() + path, Object.assign({ cache: 'no-store' }, opt || {}));
    const text = await r.text();
    let j = null;
    try {
      j = JSON.parse(text);
    } catch (e) {
      throw new Error(r.ok ? 'bad JSON' : 'HTTP ' + r.status);
    }
    if (!r.ok) throw new Error((j && (j.error || j.message)) || 'HTTP ' + r.status);
    return j;
  }

  function fmtAgo(isoOrMs) {
    try {
      const t = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
      const ms = Date.now() - t;
      if (!isFinite(ms) || ms < 0) return '';
      const s = Math.round(ms / 1000);
      if (s < 10) return 'just now';
      if (s < 60) return s + 's ago';
      const m = Math.round(s / 60);
      if (m < 60) return m + 'm ago';
      const h = Math.round(m / 60);
      if (h < 48) return h + 'h ago';
      return Math.round(h / 24) + 'd ago';
    } catch (e) {
      return '';
    }
  }

  function paintTfButtons() {
    document.querySelectorAll('.bo-tf-btn').forEach(function (b) {
      const on = b.getAttribute('data-botf') === breakoutTF;
      b.classList.toggle('on', on);
      b.style.background = on ? '#1a9b6c' : '#121a24';
      b.style.color = on ? '#fff' : '#c5d0dc';
    });
  }

  function renderHits(hits) {
    return (hits || [])
      .map(function (h) {
        const col =
          h.matureStatus === 'broke' || h.state === 'BROKE'
            ? '#ff6f7c'
            : h.matureStatus === 'failed' || h.state === 'FAILED'
              ? '#ff8d7a'
              : h.state === 'STRONG CONFIRMED'
                ? '#62e3a0'
                : h.state === 'EARLY'
                  ? '#e6c878'
                  : h.state === 'STRETCHED'
                    ? '#f0a060'
                    : h.state === 'WARMING'
                      ? '#8491a1'
                      : '#c5d0dc';
        const chainLab = h.chain === 'solana' ? 'SOL' : String(h.chain || '').toUpperCase();
        const caShort = h.ca && h.ca.length > 12 ? h.ca.slice(0, 6) + '…' + h.ca.slice(-4) : h.ca || '';
        const tfu = String(h.tf || '').toUpperCase();
        const tfTag =
          tfu
            ? ' <b style="color:#e8eef6;font-weight:900">(' +
              tfu +
              (h.live ? ' live' : '') +
              ')</b>'
            : '';
        const freshBreak = !!(h.fresh && String(h.event || '').toUpperCase().indexOf('BREAKOUT') >= 0);
        const tape =
          h.warming && h.need
            ? 'tape ' + (h.bars || 0) + '/' + h.need + ' bars'
            : h.tapeMin
              ? 'tape ' + h.tapeMin + 'm'
              : '';
        return (
          '<div style="padding:12px 14px;border-radius:12px;border:1px solid #243041;background:#0b121a">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<div style="font-weight:900;font-size:15px;color:#e8eef6">' +
          h.name +
          (h.focus ? ' <span style="font-size:10px;color:#62e3a0;font-weight:800">FOCUS 1m</span>' : '') +
          ' <span style="font-size:11px;color:#8491a1;font-weight:700">' +
          chainLab +
          '</span></div>' +
          '<div style="font-weight:800;color:' +
          col +
          '">' +
          (h.section === 'matured' && h.matureStatus
            ? String(h.matureStatus).toUpperCase()
            : h.state) +
          (h.score != null && !h.history ? ' · ' + h.score : '') +
          tfTag +
          '</div></div>' +
          (h.section === 'matured' && h.maturedAt
            ? '<div style="margin-top:4px;font-size:11px;font-weight:800;color:#8491a1">since ' +
              fmtAgo(h.maturedAt) +
              (h.history ? ' · history' : '') +
              '</div>'
            : '') +
          '<div style="margin-top:6px;font-size:12px;color:#c5d0dc;line-height:1.45">' +
          (freshBreak
            ? '<b style="color:#e6c878;font-weight:900">' + h.event + ' (' + tfu + (h.live ? ' live' : '') + ')</b>'
            : h.event + tfTag) +
          ' · age ' +
          (h.age != null ? h.age : '—') +
          ' · ' +
          (h.fresh ? 'Fresh YES' : 'Fresh NO') +
          ' · Dex 5m ' +
          (h.m5 >= 0 ? '+' : '') +
          (h.m5 != null ? Number(h.m5).toFixed(1) : '—') +
          '% · 1h ' +
          (h.h1 >= 0 ? '+' : '') +
          (h.h1 != null ? Number(h.h1).toFixed(1) : '—') +
          '% · vol ' +
          (h.volX || '—') +
          'x' +
          (h.sizePct ? ' · size ' + h.sizePct + '%' : '') +
          (tape ? ' · ' + tape : '') +
          (h.live ? ' · Dex live until tape fills' : '') +
          '</div>' +
          (h.levelTxt
            ? '<div style="margin-top:8px;padding:8px 10px;border-radius:10px;background:#121a24;border:1px solid #2a3a4c">' +
              '<div style="font-size:10px;letter-spacing:.08em;font-weight:800;color:#8491a1">BREAKOUT LEVEL (' +
              tfu +
              ')</div>' +
              '<div style="margin-top:4px;font-size:16px;font-weight:900;color:#e8eef6">' +
              h.levelTxt +
              (h.distPct != null
                ? ' <span style="font-size:12px;font-weight:800;color:' +
                  (h.distPct >= 0 ? '#62e3a0' : '#ff6f7c') +
                  '">(' +
                  (h.distPct >= 0 ? '+' : '') +
                  Number(h.distPct).toFixed(1) +
                  '% vs spot)</span>'
                : '') +
              '</div>' +
              '<div style="margin-top:4px;font-size:12px;color:#c5d0dc">Exit if ' +
              tfu +
              ' closes back under <b style="color:#e6c878">(' +
              h.levelTxt +
              ')</b></div></div>'
            : h.section
              ? '<div style="margin-top:8px;font-size:12px;color:#f0a060">No ' +
                tfu +
                ' candle high yet (tape filling). Use DexScreener ' +
                tfu +
                ' high as exit until we print a level.</div>'
              : '') +
          (h.why
            ? '<div style="margin-top:8px;padding:8px 10px;border-radius:10px;background:#121a24;border:1px solid #243041">' +
              '<div style="font-size:10px;letter-spacing:.06em;font-weight:800;color:#8491a1">WHY THIS LABEL</div>' +
              '<div style="margin-top:4px;font-size:12px;color:#e8eef6;line-height:1.45">' +
              h.why +
              '</div>' +
              (h.reasons && h.reasons.length
                ? '<div style="margin-top:6px;font-size:11px;color:#c5d0dc;line-height:1.45">' +
                  h.reasons
                    .map(function (r) {
                      return '• ' + r;
                    })
                    .join('<br>') +
                  '</div>'
                : '') +
              '</div>'
            : '') +
          '<div style="margin-top:4px;font-size:11px;color:#8491a1">' +
          caShort +
          (h.liq ? ' · liq $' + Math.round(h.liq).toLocaleString() : '') +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
          '<button type="button" data-bo-ca="' +
          h.ca +
          '" class="bo-open-ca" style="padding:6px 10px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#62e3a0;font-weight:700;font-size:11px;cursor:pointer">Open in CA tab</button>' +
          '<button type="button" data-focus-ca="' +
          h.ca +
          '" class="bo-focus-ca" style="padding:6px 10px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#e6c878;font-weight:700;font-size:11px;cursor:pointer">Focus 1m</button>' +
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

  function emptyNote(text) {
    return (
      '<div style="padding:12px 14px;border-radius:12px;border:1px dashed #243041;color:#8491a1;font-size:12px">' +
      text +
      '</div>'
    );
  }

  function sectionBlock(title, sub, color, items, none) {
    return (
      '<div style="margin-bottom:18px">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin:2px 0 8px">' +
      '<div><span style="font-size:12px;letter-spacing:.1em;font-weight:900;color:' +
      color +
      '">' +
      title +
      '</span> <span style="font-size:11px;color:#8491a1">' +
      sub +
      '</span></div>' +
      '<span style="font-size:11px;color:#8491a1;font-weight:800">' +
      (items ? items.length : 0) +
      '</span></div>' +
      (items && items.length
        ? '<div style="display:flex;flex-direction:column;gap:8px">' + renderHits(items) + '</div>'
        : emptyNote(none)) +
      '</div>'
    );
  }

  function renderBoard(j) {
    const sec = j.sections || {};
    const hits = j.hits || [];
    const early = sec.early || hits.filter(function (h) { return h.section === 'early'; });
    const live = sec.live || hits.filter(function (h) { return h.section === 'live'; });
    const matured = sec.matured || hits.filter(function (h) { return h.section === 'matured'; });
    if (!early.length && !live.length && !matured.length) {
      return (
        '<div style="padding:14px;border-radius:12px;border:1px solid #243041;background:#0b121a;color:#8491a1;font-size:13px">' +
        (breakoutTF === '1m'
          ? '1m is focus-only. Pick a saved coin as Focus 1m.'
          : 'Nothing close, live, or matured on ' +
            breakoutTF.toUpperCase() +
            '. Quiet coins are hidden.') +
        '</div>'
      );
    }
    return (
      sectionBlock('EARLY', 'Close to break — not broken yet', '#e6c878', early, 'Nothing close to a break on this TF.') +
      sectionBlock('LIVE', 'Happened now', '#62e3a0', live, 'No live break on this TF.') +
      sectionBlock('MATURED', 'Held now · Failed/Broke kept as history', '#6eb6ff', matured, 'No matured break on this TF.')
    );
  }

  function bindCardButtons() {
    document.querySelectorAll('.bo-open-ca').forEach(function (b) {
      b.onclick = function () {
        const ca = b.getAttribute('data-bo-ca');
        try {
          if (window.showCoin) window.showCoin(true);
          const inp = document.getElementById('coin-ca');
          if (inp && ca) inp.value = ca;
          if (window.loadCoin) window.loadCoin();
        } catch (e) {}
      };
    });
    document.querySelectorAll('.bo-focus-ca').forEach(function (b) {
      b.onclick = function () {
        setFocus(b.getAttribute('data-focus-ca'));
      };
    });
  }

  async function loadStatus() {
    const healthEl = $('m1m-health'),
      metaEl = $('m1m-meta'),
      lastEl = $('m1m-last-alert'),
      topEl = $('m1m-top');
    let st;
    try {
      st = await api('/status');
    } catch (e) {
      lastErr = String(e.message || e);
      if (healthEl) {
        healthEl.style.color = '#ff6f7c';
        healthEl.textContent = 'ENGINE OFFLINE';
      }
      if (metaEl)
        metaEl.innerHTML =
          'Could not reach candle API at <b style="color:#e8eef6">' +
          apiBase() +
          '</b><br><span style="color:#ff6f7c">' +
          lastErr +
          '</span><br>GitHub Pages is display-only. The Cloudflare worker must be live.';
      return;
    }
    lastErr = st.error || '';
    const tgBound = !!st.telegramReady || !!st.telegramBound;
    const tgBot = st.telegramBot || 'MyTradingBreakoutBot';
    const tgErr = st.telegramError || '';
    const ntfyErr = st.ntfyError || (/ntfy/i.test(lastErr) ? lastErr : '');
    const col =
      st.health === 'LIVE' || st.health === 'OK'
        ? '#62e3a0'
        : st.health === 'STALE' || st.health === 'RATE_LIMITED'
          ? '#f0a060'
          : st.health === 'STARTING'
            ? '#e6c878'
            : '#ff6f7c';
    if (healthEl) {
      healthEl.style.color = col;
      healthEl.textContent =
        st.health +
        (st.dexCallsLastMin != null ? ' · ' + st.dexCallsLastMin + ' Dex calls/min' : '') +
        ' · worker engine';
    }
    if (metaEl) {
      metaEl.innerHTML =
        'Last poll: ' +
        (st.lastPoll ? fmtAgo(st.lastPoll) || 'just now' : '—') +
        ' · CAs ' +
        (st.candidates != null ? st.candidates : '—') +
        '<br>Telegram <b style="color:#e8eef6">@' +
        tgBot +
        '</b> · ' +
        (tgBound ? '<span style="color:#62e3a0">linked · private DM</span>' : '<span style="color:#e6c878">open the bot, tap Start, send hi</span>') +
        ' · focus <b style="color:#e8eef6">' +
        (st.focusName || st.focus || 'none') +
        '</b>' +
        (st.focus1mAlerts ? ' · 1m alerts ON' : ' · 1m alerts off') +
        '<br>Candles live in Cloudflare. This page only reads the API.' +
        (!tgBound
          ? '<br><span style="color:#e6c878">Phone alerts via Telegram. Open t.me/' +
            tgBot +
            ' → Start → send hi, then tap Test Telegram.</span>'
          : '') +
        (tgBound && tgErr ? '<br><span style="color:#f0a060">' + tgErr + '</span>' : '') +
        (ntfyErr && !tgBound
          ? '<br><span style="color:#f0a060">' +
            (st.ntfyPaused || /quota|daily|limit/i.test(ntfyErr)
              ? 'ntfy is paused (daily limit). Using Telegram instead.'
              : 'Phone ping delayed: ' + ntfyErr) +
            '</span>'
          : '') +
        (lastErr && !/ntfy/i.test(lastErr)
          ? '<br><span style="color:#ff6f7c">' + lastErr + '</span>'
          : '');
    }
    const la = st.lastAlert;
    if (lastEl) {
      if (la && la.name) {
        lastEl.innerHTML =
          'Last alert: <b style="color:#e8eef6">' +
          la.name +
          '</b> · ' +
          (la.tf || '') +
          ' · ' +
          (la.event || la.state || '') +
          (la.tf ? ' <b style="color:#e6c878">(' + String(la.tf).toUpperCase() + ')</b>' : '') +
          ' · score ' +
          (la.score != null ? la.score : '—') +
          (la.at ? ' · ' + fmtAgo(la.at) : '');
      } else lastEl.textContent = 'Last alert: none yet — worker Telegram fires on NEW BREAKOUT (tab can be closed)';
    }
    if (topEl) {
      const tops = st.topScores || [];
      if (!tops.length) {
        topEl.innerHTML = '<div style="color:#8491a1">Waiting for first worker poll…</div>';
      } else {
        topEl.innerHTML =
          '<div style="font-size:10px;letter-spacing:.06em;color:#8491a1;font-weight:800;margin-bottom:4px">TOP SCORES · 4H</div>' +
          tops
            .map(function (t) {
              const c = t.score >= 62 ? '#62e3a0' : t.score >= 50 ? '#e6c878' : '#8491a1';
              return (
                '<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid #1a2430">' +
                '<span><b style="color:#e8eef6">' +
                t.name +
                '</b> <span style="color:#8491a1">' +
                (t.state || '') +
                (t.section ? ' · ' + String(t.section).toUpperCase() : '') +
                '</span></span>' +
                '<span style="color:' +
                c +
                ';font-weight:800">' +
                t.score +
                '/100</span></div>' +
                '<div style="font-size:11px;color:#8491a1;margin:0 0 4px">' +
                (t.event || t.reason || '') +
                (t.ret1 != null ? ' · Dex 5m ' + (t.ret1 >= 0 ? '+' : '') + t.ret1 + '%' : '') +
                '</div>'
              );
            })
            .join('');
      }
    }
    const hint = $('bo-ntfy-hint');
    if (hint) {
      if (tgBound) hint.textContent = 'Alerts go to Telegram @' + tgBot + ' as a private DM. Mute other groups.';
      else hint.textContent = 'Open t.me/' + tgBot + ' → Start → send hi, then tap Test Telegram.';
    }
    paintFocusRow(st);
  }

  function paintFocusRow(st) {
    const sel = $('bo-focus-sel');
    if (!sel) return;
    const watch = (st && st.watch) || [];
    const cur = (st && st.focus) || '';
    const keep = sel.value;
    sel.innerHTML =
      '<option value="">No 1m focus</option>' +
      watch
        .map(function (w) {
          return (
            '<option value="' +
            w.ca +
            '"' +
            (w.ca === cur ? ' selected' : '') +
            '>' +
            (w.name || w.ca.slice(0, 8)) +
            '</option>'
          );
        })
        .join('');
    if (!cur && keep) sel.value = keep;
    const a = $('bo-1m-alerts');
    if (a) a.textContent = st && st.focus1mAlerts ? '1m alerts ON' : '1m alerts off';
  }

  async function scanBreakoutMemes(quiet) {
    if (busy) return;
    const list = $('bo-list');
    const stEl = $('bo-status');
    const src = $('bo-source');
    busy = true;
    if (src) src.textContent = 'API';
    if (stEl) stEl.textContent = 'Reading ' + breakoutTF.toUpperCase() + ' from worker…';
    if (list && !quiet)
      list.innerHTML = '<div style="color:#8491a1;font-size:12px">Fetching candle API…</div>';
    try {
      const j = await api('/breakouts?tf=' + encodeURIComponent(breakoutTF));
      const hits = j.hits || [];
      const st = j.status || {};
      if (src)
        src.textContent =
          (st.health || 'API') + ' · ' + breakoutTF.toUpperCase() + (st.focusName ? ' · focus ' + st.focusName : '');
      if (stEl)
        stEl.textContent =
          hits.length +
          ' shown · quiet coins hidden · ' +
          (st.candidates != null ? st.candidates + ' saved' : '') +
          (st.dexCallsLastMin != null ? ' · ' + st.dexCallsLastMin + '/min Dex on worker' : '');
      if (list) {
        list.innerHTML = renderBoard(j);
        bindCardButtons();
      }
      await loadStatus();
    } catch (err) {
      lastErr = String(err && err.message ? err.message : err);
      if (src) src.textContent = 'OFFLINE';
      if (stEl) stEl.textContent = lastErr;
      if (list)
        list.innerHTML =
          '<div style="color:#ff6f7c;font-size:13px">API failed: ' +
          lastErr +
          '<br><span style="color:#8491a1">This page does not scan Dex itself. Worker: ' +
          apiBase() +
          '</span></div>';
    }
    busy = false;
  }

  async function setFocus(ca) {
    try {
      await api('/focus', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ca: ca || '' })
      });
      await scanBreakoutMemes(true);
    } catch (e) {
      alert(e.message || e);
    }
  }

  async function toggle1mAlerts() {
    const sel = $('bo-focus-sel');
    const st = await api('/status').catch(() => ({}));
    const on = !(st && st.focus1mAlerts);
    await api('/focus', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ca: (sel && sel.value) || st.focus || '', alerts1m: on })
    });
    await loadStatus();
  }

  async function pingTelegram() {
    const hint = $('bo-ntfy-hint');
    try {
      const j = await api('/ping-telegram', { method: 'POST' });
      if (hint) {
        if (j.ok === false || j.needStart)
          hint.textContent = j.error || 'Open t.me/MyTradingBreakoutBot, tap Start, send hi, then test again';
        else hint.textContent = 'Test ping sent to Telegram @' + (j.username || 'MyTradingBreakoutBot');
      }
    } catch (e) {
      if (hint) hint.textContent = String(e.message || e);
    }
  }

  async function forceRun() {
    const stEl = $('bo-status');
    if (stEl) stEl.textContent = 'Asking worker to poll now…';
    try {
      await api('/run', { method: 'POST' });
    } catch (e) {}
    await scanBreakoutMemes(false);
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
  function setLiveBtn() {
    const b = $('bo-live-btn');
    if (!b) return;
    b.textContent = liveOn ? 'Live watch ON' : 'Live watch OFF';
    b.style.background = liveOn ? '#1a9b6c' : '#121a24';
    b.style.color = liveOn ? '#fff' : '#c5d0dc';
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
      try {
        window.showHunter(false);
      } catch (e) {}
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
      setLiveBtn();
      paintTfButtons();
      loadStatus();
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
    return forceRun();
  };
  window.loadMomentum1mStatus = function (force) {
    return loadStatus();
  };
  window.setBreakoutTF = function (tf) {
    breakoutTF = String(tf || '4h').toLowerCase();
    paintTfButtons();
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
  window.pingBreakoutNtfy = pingTelegram;
  window.pingBreakoutTelegram = pingTelegram;
  window.setBreakoutFocus = function () {
    const sel = $('bo-focus-sel');
    return setFocus(sel ? sel.value : '');
  };
  window.toggleBreakout1mAlerts = toggle1mAlerts;
})();
