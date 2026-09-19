/* Entry Window — display only. Levels + WHEN come from the worker (breakout level + entryQuality). */
(function () {
  function apiBase() {
    try {
      if (window.BREAKOUT_API) return String(window.BREAKOUT_API).replace(/\/+$/, '');
    } catch (e) {}
    const h = location.hostname;
    if (h === 'sasikar.github.io' || /\.github.io$/.test(h)) return 'https://trading-ohlcv.sasipudi.workers.dev';
    if (h === 'trading.sasipudi.workers.dev' || h === 'trading-ohlcv.sasipudi.workers.dev')
      return 'https://trading-ohlcv.sasipudi.workers.dev';
    return location.origin + '/api';
  }
  const $ = (id) => document.getElementById(id);
  let timer = null;
  let busy = false;
  let loadAgain = false;
  let ewTf = 'all';
  try {
    ewTf = localStorage.getItem('ew_tf') || 'all';
  } catch (e) {}
  let selState = '';
  try {
    selState = localStorage.getItem('ew_state') || '';
  } catch (e) {}
  let selCa = '';
  try {
    selCa = (localStorage.getItem('ew_ca') || '').toLowerCase();
  } catch (e) {}
  let lastCards = [];
  const EW_BANDS = [
    { id: 'ACTIVE', lab: 'ACTIVE' },
    { id: 'RECLAIM', lab: 'RECLAIM' },
    { id: 'RETEST', lab: 'RETEST' },
    { id: 'WAIT_RETEST', lab: 'WAIT RETEST' },
    { id: 'APPROACHING', lab: 'APPROACHING' },
    { id: 'NO_CHASE', lab: 'NO CHASE' },
    { id: 'MISSED', lab: 'BREAKOUT MISSED' },
    { id: 'NEAR', lab: 'CLOSE TO BREAK' },
    { id: 'INVALIDATED', lab: 'INVALIDATED' },
    { id: 'EXPIRED', lab: 'EXPIRED' },
    { id: 'WARMING', lab: 'WARMING' },
    { id: 'NO_SETUP', lab: 'NO BREAKOUT' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      if (c === '&') return '&' + 'amp;';
      if (c === '<') return '&' + 'lt;';
      if (c === '>') return '&' + 'gt;';
      return '&' + 'quot;';
    });
  }
  function px(n) {
    n = +n;
    if (!(n > 0)) return '—';
    if (n >= 1) return n.toFixed(4);
    if (n >= 0.01) return n.toFixed(6);
    if (n >= 1e-6) return n.toFixed(8);
    return n.toExponential(3);
  }
  function triggerTxt(e) {
    const st = String((e && e.state) || '');
    if (!e || !e.level || st === 'NO_SETUP' || st === 'NEAR' || st === 'WARMING' || !st)
      return '—';
    if (st === 'INVALIDATED' || st === 'EXPIRED' || st === 'MISSED')
      return 'Setup cancelled · wait NEW breakout';
    if (st === 'ACTIVE') return px(e.trigger) + ' held';
    if (st === 'RECLAIM') return px(e.trigger) + ' reclaimed · wait confirm';
    if (st === 'RETEST') return 'At level · wait 5m reclaim close';
    if (st === 'NO_CHASE') return 'Do not chase · wait retest of ' + px(e.trigger);
    return 'Do not buy · retest then reclaim ' + px(e.trigger);
  }
  function tfLab(tf) {
    if (tf === '1M') return '1M';
    if (/m$/.test(tf) && tf !== '1m') return tf;
    return String(tf || '').toUpperCase();
  }

  async function api(path) {
    const r = await fetch(apiBase() + path, { cache: 'no-store' });
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
  function recentsUrl() {
    const h = location.hostname;
    if (h === 'sasikar.github.io' || /\.github\.io$/.test(h)) return 'data/ca-recents.json';
    return 'https://sasikar.github.io/Trading/data/ca-recents.json';
  }
  async function loadRecentsCards(why) {
    const r = await fetch(recentsUrl(), { cache: 'no-store' });
    const j = await r.json().catch(function () {
      return {};
    });
    return (j.items || []).map(function (x) {
      return {
        ca: x.ca,
        name: x.name || x.base,
        chain: x.chain,
        tf: ewTf,
        ew: {
          state: 'NO_SETUP',
          label: 'NO TAPE',
          color: '#ffb020',
          why: why || 'Worker has no tape right now. Coin is still saved.'
        }
      };
    });
  }

  function hideOthers() {
    ['showBreakoutMemes', 'showHunter', 'showKeep', 'showHolders', 'showSentiment', 'showFailures', 'showInMemory', 'showVerdict', 'showPositionMonitor', 'showWowDip', 'showOmg', 'showPitfalls', 'showStrategy', 'showDecisionCheck', 'showGmgn'].forEach(
      function (fn) {
        try {
          window[fn](false);
        } catch (e) {}
      }
    );
    [
      'tf-panels',
      'trend-panel',
      'struct-panel',
      'macro-panel',
      'signal-panel',
      'memegate-panel',
      'coin-panel',
      'antifomo-panel',
      'hunter-panel',
      'breakouts-panel',
      'holders-panel',
      'failures-panel',
      'inmemory-panel',
      'sentiment-panel',
      'keep-panel',
      'verdict-panel',
      'position-panel',
      'wowdip-panel',
      'omg-panel',
      'pitfalls-panel',
      'strategy-panel',
      'decision-panel',
      'gmgn-panel'
    ].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
  }

  function row(k, v) {
    return (
      '<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px solid #1a222c"><span style="color:#8491a1">' +
      esc(k) +
      '</span><span style="font-weight:800;color:#e8eef6">' +
      v +
      '</span></div>'
    );
  }

  function renderCard(c) {
    const e = c.ew || {};
    return (
      '<div style="padding:14px;border-radius:14px;border:1px solid #243041;background:#0b121a">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<div style="font-weight:900;font-size:16px;color:#e8eef6">' +
      esc(c.name) +
      ' <span style="font-size:11px;color:#8491a1;font-weight:800">' +
      tfLab(c.tf) +
      '</span></div>' +
      '<div style="font-size:13px;font-weight:900;color:' +
      esc(e.color || '#c5d0dc') +
      '">' +
      esc(e.label || e.state || '—') +
      '</div></div>' +
      '<div style="margin-top:8px;font-size:12px;color:#c5d0dc;line-height:1.45">' +
      esc(e.why || '') +
      '</div>' +
      '<div style="margin-top:10px;font-size:12px">' +
      row('Breakout', px(e.level)) +
      row('Current', px(e.spot)) +
      row('Extension', e.extPct == null ? '—' : (e.extPct >= 0 ? '+' : '') + Number(e.extPct).toFixed(1) + '%') +
      row('Pullback ideal', px(e.ideal)) +
      row('Pullback zone', px(e.zoneLo) + ' – ' + px(e.zoneHi)) +
      row('Support 5m', px(e.sup5)) +
      row('Support 1H', px(e.sup1h)) +
      row('Support 4H', px(e.sup4h)) +
      row('Support 1D', px(e.sup1d)) +
      row('Invalidation', px(e.inval)) +
      row('Exec TF', esc(e.execTf || '5m')) +
      row('Trigger', triggerTxt(e)) +
      row('Volume', e.volPass ? 'PASS' : 'WAIT') +
      row('Momentum', e.momPass ? 'PASS' : 'WAIT') +
      row('Confirm', e.state === 'INVALIDATED' ? 'CANCELLED' : e.confirm ? 'WINDOW' : e.entryPaint || 'WAIT') +
      '</div>' +
      (c.dexUrl
        ? '<div style="margin-top:10px"><a href="' +
          esc(c.dexUrl) +
          '" target="_blank" rel="noopener" style="color:#6eb6ff;font-weight:800;font-size:12px">DexScreener</a></div>'
        : '') +
      '</div>'
    );
  }

  function renderPaper(rows) {
    if (!rows || !rows.length) {
      return '<div style="font-size:12px;color:#8491a1">No breakout episode stored yet. Paper starts when a saved CA actually breaks (any TF). Quiet coins stay on the list above as NO BREAKOUT.</div>';
    }
    return rows
      .map(function (r) {
        return (
          '<div style="padding:10px 12px;border-radius:10px;border:1px solid #243041;margin-bottom:8px">' +
          '<div style="font-weight:800;color:#e8eef6">' +
          esc(r.name) +
          ' · ' +
          tfLab(r.tf) +
          '</div>' +
          '<div style="font-size:12px;color:#c5d0dc;margin-top:4px">Break ' +
          px(r.level) +
          ' · zone ' +
          px(r.zoneLo) +
          '–' +
          px(r.zoneHi) +
          (r.chase ? ' · was NO CHASE' : '') +
          (r.windowPx ? ' · window @ ' + px(r.windowPx) : ' · no window yet') +
          (r.mfe != null ? ' · MFE ' + (r.mfe >= 0 ? '+' : '') + r.mfe + '%' : '') +
          (r.mae != null ? ' · MAE ' + r.mae + '%' : '') +
          (r.invalidAt ? ' · invalidated' : '') +
          '</div></div>'
        );
      })
      .join('');
  }




  function syncEwPad() {}
  function bandId(c) {
    const s = String((c && c.ew && c.ew.state) || 'NO_SETUP');
    if (s === 'ACTIVE') return 'ACTIVE';
    if (s === 'RECLAIM') return 'RECLAIM';
    if (s === 'RETEST') return 'RETEST';
    if (s === 'WAIT_RETEST' || s === 'WAIT') return 'WAIT_RETEST';
    if (s === 'APPROACHING') return 'APPROACHING';
    if (s === 'NO_CHASE') return 'NO_CHASE';
    if (s === 'MISSED') return 'MISSED';
    if (s === 'NEAR') return 'NEAR';
    if (s === 'INVALIDATED') return 'INVALIDATED';
    if (s === 'EXPIRED') return 'EXPIRED';
    if (s === 'WARMING') return 'WARMING';
    return 'NO_SETUP';
  }
  function countsOf(cards) {
    const n = {};
    EW_BANDS.forEach(function (b) { n[b.id] = 0; });
    (cards || []).forEach(function (c) {
      const id = bandId(c);
      n[id] = (n[id] || 0) + 1;
    });
    return n;
  }
  function pickDefaultState(cards) {
    const n = countsOf(cards);
    for (let i = 0; i < EW_BANDS.length; i++) {
      if (n[EW_BANDS[i].id] > 0) return EW_BANDS[i].id;
    }
    return 'NO_SETUP';
  }
  function uniqCoins(cards) {
    const seen = {};
    const out = [];
    (cards || []).forEach(function (c) {
      const k = String(c.ca || '').toLowerCase();
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push({ ca: k, name: c.name || k.slice(0, 8) });
    });
    out.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    return out;
  }
  function paintCoinSel(cards) {
    const sel = $('ew-coin-sel');
    if (!sel) return;
    const coins = uniqCoins(cards);
    const keep = selCa;
    sel.innerHTML =
      '<option value="">All coins · by state</option>' +
      coins
        .map(function (c) {
          return (
            '<option value="' +
            esc(c.ca) +
            '"' +
            (c.ca === keep ? ' selected' : '') +
            '>' +
            esc(c.name) +
            '</option>'
          );
        })
        .join('');
    if (keep && coins.some(function (c) { return c.ca === keep; })) sel.value = keep;
    else if (keep && !coins.some(function (c) { return c.ca === keep; })) {
      selCa = '';
      sel.value = '';
    }
  }
  function paintLooking() {
    const el = $('ew-looking');
    if (!el) return;
    const band = EW_BANDS.filter(function (b) { return b.id === selState; })[0];
    const coin = uniqCoins(lastCards).filter(function (c) { return c.ca === selCa; })[0];
    el.innerHTML =
      'Looking at <b style="color:#62e3a0">' +
      (ewTf === 'all' ? 'ALL TF' : tfLab(ewTf)) +
      '</b><span> · ' +
      (coin ? coin.name : band ? band.lab : 'state') +
      '</span>';
  }
  function paintStateTabs(cards) {
    const wrap = $('ew-states');
    if (!wrap) return;
    const n = countsOf(cards);
    if (!selState || !(n[selState] > 0)) selState = pickDefaultState(cards);
    wrap.innerHTML = EW_BANDS.map(function (b) {
      const on = b.id === selState;
      const c = n[b.id] || 0;
      const dim = c ? '' : 'opacity:.45';
      return (
        '<button type="button" class="ew-st' +
        (on ? ' on' : '') +
        '" data-ew-st="' +
        b.id +
        '" style="' +
        dim +
        '">' +
        b.lab +
        ' <b>' +
        c +
        '</b></button>'
      );
    }).join('');
    syncEwPad();
  }
  function paintDetail(cards) {
    const list = $('ew-list');
    if (!list) return;
    const rows = cardsForTf(cards).filter(function (c) {
      if (selCa) return String(c.ca || '').toLowerCase() === selCa;
      return bandId(c) === selState;
    });
    if (!rows.length) {
      list.innerHTML =
        '<div style="padding:12px;color:#8491a1;font-size:12px">' +
        (selCa ? 'No card for this coin on ' : 'No coins in this state on ') +
        (ewTf === 'all' ? 'ALL TF' : tfLab(ewTf)) +
        '.</div>';
      return;
    }
    list.innerHTML = rows.map(renderCard).join('');
  }
  function pickState(id) {
    selCa = '';
    try {
      localStorage.setItem('ew_ca', '');
    } catch (e) {}
    selState = String(id || '');
    try {
      localStorage.setItem('ew_state', selState);
    } catch (e) {}
    paintCoinSel(lastCards);
    paintStateTabs(lastCards);
    paintLooking();
    paintDetail(lastCards);
  }
  function pickCoin(ca) {
    selCa = String(ca || '').toLowerCase();
    try {
      localStorage.setItem('ew_ca', selCa);
    } catch (e) {}
    paintCoinSel(lastCards);
    paintLooking();
    paintDetail(lastCards);
  }

  function cardsForTf(cards) {
    if (ewTf === 'all') return cards || [];
    const want = String(ewTf).toLowerCase();
    return (cards || []).filter(function (c) {
      return String(c.tf || '').toLowerCase() === want;
    });
  }
  async function load() {
    if (busy) {
      loadAgain = true;
      return;
    }
    busy = true;
    loadAgain = false;
    const wantTf = ewTf;
    const st = $('ew-status');
    const list = $('ew-list');
    const paper = $('ew-paper');
    try {
      let j = {};
      try {
        j = await api('/entry-window?tf=' + encodeURIComponent(wantTf));
      } catch (e) {
        j = { error: String(e.message || e), cards: [], saved: 0 };
      }
      const quota = /rows read|quota/i.test(String(j.error || ''));
      if (!(j.cards && j.cards.length)) {
        const rec = await loadRecentsCards(
          quota
            ? 'Cloudflare SQLite read quota is used up. These 19 CAs are still saved. Tape/levels come back after midnight UTC.'
            : 'Worker returned no cards. Showing saved CAs from GitHub. Levels when the tape is up.'
        );
        if (rec.length) {
          j.cards = rec;
          j.saved = rec.length;
        }
      }
      const n = (j.cards || []).length;
      const nSetup = (j.cards || []).filter(function (c) {
        const st0 = (c.ew && c.ew.state) || '';
        return st0 && st0 !== 'NO_SETUP' && st0 !== 'WARMING';
      }).length;
      const ageS = j.spotAgeMs != null ? Math.max(0, Math.round(j.spotAgeMs / 1000)) : null;
      if (st)
        st.textContent = quota
          ? 'QUOTA · ' + n + ' saved on GitHub · tape down until midnight UTC'
          : 'LIVE · ' +
            (ewTf === 'all' ? 'ALL TF' : tfLab(ewTf)) +
            ' · Dex ' +
            (ageS == null ? '—' : ageS + 's') +
            ' · ' +
            n +
            ' saved · ' +
            nSetup +
            ' with a setup';
      lastCards = (j.cards || []).filter(function (c) {
        if (wantTf === 'all') return true;
        return String(c.tf || '').toLowerCase() === wantTf;
      });
      paintCoinSel(lastCards);
      paintStateTabs(lastCards);
      paintLooking();
      paintDetail(lastCards);
      if (paper) paper.innerHTML = renderPaper(j.paper);
    } catch (e) {
      if (st) st.textContent = String(e.message || e);
      if (list) list.innerHTML = '<div style="color:#ff6f7c;font-size:13px">' + esc(e.message || e) + '</div>';
    }
    busy = false;
    if (loadAgain || wantTf !== ewTf) load();
  }

  function paintTf() {
    document.querySelectorAll('.ew-tf').forEach(function (b) {
      const on = b.getAttribute('data-ew-tf') === ewTf;
      b.style.background = on ? '#1a9b6c' : '#121a24';
      b.style.color = on ? '#fff' : '#c5d0dc';
    });
    paintLooking();
  }

  function showEntryWindow(on) {
    const p = $('entrywindow-panel');
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      paintTf();
      load();
      setTimeout(syncEwPad, 50);
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        const onp = $('entrywindow-panel');
        if (!onp || onp.style.display === 'none') return;
        load();
      }, 20000);
    } else {
      if (p) {
        p.style.display = 'none';
        p.classList.remove('on');
      }
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
  }

  window.showEntryWindow = showEntryWindow;
  window.setEntryWindowTf = function (tf) {
    ewTf = String(tf || '4h').toLowerCase();
    try {
      localStorage.setItem('ew_tf', ewTf);
    } catch (e) {}
    lastCards = cardsForTf(lastCards);
    paintTf();
    paintStateTabs(lastCards);
    paintLooking();
    paintDetail(lastCards);
    load();
  };


  const states = document.getElementById('ew-states');
  if (states) {
    states.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-ew-st]');
      if (!b) return;
      pickState(b.getAttribute('data-ew-st'));
    });
  }
  const coinSel = document.getElementById('ew-coin-sel');
  if (coinSel) {
    coinSel.addEventListener('change', function () {
      pickCoin(coinSel.value);
    });
  }
  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf === 'entrywindow') showEntryWindow(true);
        else showEntryWindow(false);
      }, 0);
    });
  }
})();
