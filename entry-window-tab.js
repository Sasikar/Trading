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
  let ewTf = 'all';
  try {
    ewTf = localStorage.getItem('ew_tf') || 'all';
  } catch (e) {}
  let selCa = '';
  try {
    selCa = (localStorage.getItem('ew_ca') || '').toLowerCase();
  } catch (e) {}
  let lastCards = [];

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

  function hideOthers() {
    ['showBreakoutMemes', 'showHunter', 'showKeep', 'showHolders', 'showSentiment', 'showFailures', 'showInMemory', 'showVerdict', 'showPositionMonitor'].forEach(
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
      'position-panel'
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
      row('Trigger', px(e.trigger) + ' reclaim') +
      row('Volume', e.volPass ? 'PASS' : 'WAIT') +
      row('Momentum', e.momPass ? 'PASS' : 'WAIT') +
      row('Confirm', e.confirm ? 'WINDOW' : e.entryPaint || 'WAIT') +
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


  function groupsOf(cards) {
    const map = [];
    const ix = {};
    (cards || []).forEach(function (c) {
      const k = String(c.ca || '').toLowerCase();
      if (!k) return;
      if (ix[k] == null) {
        ix[k] = map.length;
        map.push({ ca: k, name: c.name, list: [] });
      }
      map[ix[k]].list.push(c);
      map[ix[k]].name = c.name || map[ix[k]].name;
    });
    return map;
  }
  function paintLooking() {
    const el = $('ew-looking');
    if (!el) return;
    el.innerHTML =
      'Looking at <b style="color:#62e3a0">' +
      (ewTf === 'all' ? 'ALL TF' : tfLab(ewTf)) +
      '</b><span> · tap a coin</span>';
  }
  function paintCoins(cards) {
    const wrap = $('ew-coins');
    if (!wrap) return;
    const gs = groupsOf(cards);
    if (!gs.length) {
      wrap.innerHTML = '<span style="font-size:12px;color:#8491a1">No saved CAs</span>';
      return;
    }
    const have = gs.some(function (g) { return g.ca === selCa; });
    if (!have) selCa = gs[0].ca;
    wrap.innerHTML = gs
      .map(function (g) {
        const on = g.ca === selCa;
        const lab = (g.list[0] && g.list[0].ew && g.list[0].ew.label) || '';
        return (
          '<button type="button" class="ew-coin' +
          (on ? ' on' : '') +
          '" data-ca="' +
          esc(g.ca) +
          '">' +
          esc(g.name) +
          '</button>'
        );
      })
      .join('');
  }
  function paintDetail(cards) {
    const list = $('ew-list');
    if (!list) return;
    const gs = groupsOf(cards);
    const g = gs.filter(function (x) { return x.ca === selCa; })[0];
    if (!g) {
      list.innerHTML = '<div style="padding:12px;color:#8491a1;font-size:12px">Tap a coin above.</div>';
      return;
    }
    list.innerHTML = g.list.map(renderCard).join('');
  }
  function pickCoin(ca) {
    selCa = String(ca || '').toLowerCase();
    try {
      localStorage.setItem('ew_ca', selCa);
    } catch (e) {}
    paintCoins(lastCards);
    paintDetail(lastCards);
  }

  async function load() {
    if (busy) return;
    busy = true;
    const st = $('ew-status');
    const list = $('ew-list');
    const paper = $('ew-paper');
    try {
      const j = await api('/entry-window?tf=' + encodeURIComponent(ewTf));
      const n = (j.cards || []).length;
      const nSetup = (j.cards || []).filter(function (c) {
        const st = (c.ew && c.ew.state) || '';
        return st && st !== 'NO_SETUP' && st !== 'WARMING';
      }).length;
      if (st)
        st.textContent =
          'LIVE · ' +
          (ewTf === 'all' ? 'ALL TF' : tfLab(ewTf)) +
          ' · ' +
          n +
          ' saved · ' +
          nSetup +
          ' with a setup';
      lastCards = j.cards || [];
      paintCoins(lastCards);
      paintLooking();
      paintDetail(lastCards);
      if (paper) paper.innerHTML = renderPaper(j.paper);
    } catch (e) {
      if (st) st.textContent = String(e.message || e);
      if (list) list.innerHTML = '<div style="color:#ff6f7c;font-size:13px">' + esc(e.message || e) + '</div>';
    }
    busy = false;
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
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        const onp = $('entrywindow-panel');
        if (!onp || onp.style.display === 'none') return;
        load();
      }, 60000);
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
    paintTf();
    load();
  };


  const coins = document.getElementById('ew-coins');
  if (coins) {
    coins.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-ca]');
      if (!b) return;
      pickCoin(b.getAttribute('data-ca'));
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
