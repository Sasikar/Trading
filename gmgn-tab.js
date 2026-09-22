/* GMGN — hot searches + trending. Worker caches a 20 min poll. */
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
  let inner = 'hot';
  try {
    inner = localStorage.getItem('gmgn_inner') || 'hot';
  } catch (e) {}
  if (inner !== 'trend') inner = 'hot';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      if (c === '&') return '&' + 'amp;';
      if (c === '<') return '&' + 'lt;';
      if (c === '>') return '&' + 'gt;';
      return '&' + 'quot;';
    });
  }
  function usd(n) {
    n = +n;
    if (!(n > 0)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(n >= 10e9 ? 1 : 2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 10e6 ? 1 : 2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(n >= 100e3 ? 0 : 1) + 'k';
    return '$' + n.toFixed(0);
  }
  function pct(n) {
    n = +n;
    if (!Number.isFinite(n)) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function clock(t) {
    if (!+t) return '—';
    const d = new Date(+t);
    const p = (n) => (n < 10 ? '0' : '') + n;
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function inMin(t) {
    if (!+t) return '';
    const m = Math.round((+t - Date.now()) / 60000);
    if (m <= 0) return 'due now';
    if (m < 60) return 'in ' + m + 'm';
    return 'in ' + Math.round(m / 60) + 'h';
  }
  function paintSched(j) {
    const el = $('gmgn-sched');
    if (!el) return;
    const every = j.everyMin || 20;
    const paused = j.until && +j.until > Date.now();
    el.innerHTML =
      '<div style="padding:12px;border-radius:12px;border:1px solid #243041;background:#0b121a;margin-bottom:10px">' +
      '<div style="font-size:11px;letter-spacing:.08em;color:#8491a1;font-weight:800">AUTO SCAN</div>' +
      '<div style="margin-top:6px;font-size:14px;font-weight:900;color:#e8eef6">Every ' +
      every +
      ' min</div>' +
      '<div style="margin-top:6px;font-size:12px;color:#c5d0dc">Last ' +
      (j.at ? clock(j.at) + ' · ' + ago(j.at) : 'not yet') +
      '</div>' +
      '<div style="margin-top:2px;font-size:12px;color:#62e3a0">Next ' +
      (j.next ? clock(j.next) + ' · ' + inMin(j.next) : 'on next worker tick') +
      (paused ? ' · backoff' : '') +
      '</div></div>';
  }
  function ago(t) {
    if (!+t) return 'never';
    const s = Math.round((Date.now() - +t) / 1000);
    if (s < 60) return s + 's ago';
    const m = Math.round(s / 60);
    if (m < 60) return m + 'm ago';
    return Math.round(m / 60) + 'h ago';
  }
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
  function hideOthers() {
    [
      'showBreakoutMemes',
      'showHunter',
      'showKeep',
      'showHolders',
      'showSentiment',
      'showFailures',
      'showInMemory',
      'showVerdict',
      'showEntryWindow',
      'showPositionMonitor',
      'showWowDip',
      'showOmg',
      'showPitfalls',
      'showStrategy',
      'showDecisionCheck',
      'showWallets',
      'showFirstprint'
    ].forEach(function (fn) {
      try {
        window[fn](false);
      } catch (e) {}
    });
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
      'entrywindow-panel',
      'position-panel',
      'wowdip-panel',
      'omg-panel',
      'pitfalls-panel',
      'strategy-panel',
      'decision-panel',
      'wallets-panel',
      'firstprint-panel'
    ].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
  }
  function paintChips() {
    document.querySelectorAll('.gmgn-tab').forEach(function (b) {
      const on = b.getAttribute('data-gmgn') === inner;
      b.style.background = on ? '#1a9b6c' : '#121a24';
      b.style.color = on ? '#fff' : '#c5d0dc';
    });
  }
  function renderCard(c) {
    const col = +c.h1 >= 0 ? '#62e3a0' : '#ff6f7c';
    return (
      '<div style="padding:14px;border-radius:14px;border:1px solid #243041;background:#0b121a">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<div style="font-weight:900;font-size:16px;color:#e8eef6">#' +
      esc(c.rank) +
      ' ' +
      esc(c.name) +
      '</div>' +
      '<div style="font-size:13px;font-weight:900;color:' +
      col +
      '">1h ' +
      pct(c.h1) +
      '</div></div>' +
      '<div style="margin-top:8px;font-size:12px;color:#c5d0dc">Vol ' +
      usd(c.volume) +
      ' · liq ' +
      usd(c.liq) +
      ' · MC ' +
      usd(c.mcap) +
      '</div>' +
      '<div style="margin-top:4px;font-size:12px;color:#8491a1">Holders ' +
      (c.holders ? Number(c.holders).toLocaleString() : '—') +
      (c.visiting ? ' · heat ' + Number(c.visiting).toLocaleString() : '') +
      (c.launchpad ? ' · ' + esc(c.launchpad) : '') +
      '</div>' +
      '<div style="margin-top:8px;display:flex;gap:12px;flex-wrap:wrap">' +
      (c.gmgnUrl
        ? '<a href="' + esc(c.gmgnUrl) + '" target="_blank" rel="noopener" style="color:#6eb6ff;font-weight:800;font-size:12px">GMGN</a>'
        : '') +
      (c.dexUrl
        ? '<a href="' + esc(c.dexUrl) + '" target="_blank" rel="noopener" style="color:#6eb6ff;font-weight:800;font-size:12px">DexScreener</a>'
        : '') +
      '</div></div>'
    );
  }
  async function load(force) {
    if (busy) return;
    busy = true;
    const st = $('gmgn-status');
    const list = $('gmgn-list');
    try {
      const j = await api('/gmgn' + (force ? '?force=1' : ''));
      const rows = inner === 'trend' ? j.trending || [] : j.hot || [];
      paintSched(j);
      if (st)
        st.textContent =
          (j.at ? ago(j.at) : 'waiting') +
          ' · next ' +
          (j.next ? clock(j.next) : '—') +
          ' · ' +
          (inner === 'trend' ? (j.trending || []).length : (j.hot || []).length) +
          ' coins' +
          (j.err ? ' · ' + j.err : '');
      if (list)
        list.innerHTML = rows.length
          ? rows.map(renderCard).join('')
          : '<div style="color:#8491a1;font-size:12px">' +
            (j.err ? esc(j.err) : 'No GMGN rows yet. Worker polls every ' + (j.everyMin || 20) + ' min.') +
            '</div>';
      paintChips();
    } catch (e) {
      if (st) st.textContent = String(e.message || e);
      if (list) list.innerHTML = '<div style="color:#ff6f7c;font-size:13px">' + esc(e.message || e) + '</div>';
    }
    busy = false;
  }
  function setInner(id) {
    inner = id === 'trend' ? 'trend' : 'hot';
    try {
      localStorage.setItem('gmgn_inner', inner);
    } catch (e) {}
    load(false);
  }
  function showGmgn(on) {
    const p = $('gmgn-panel');
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      load(false);
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        const onp = $('gmgn-panel');
        if (!onp || onp.style.display === 'none') return;
        load(false);
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
  window.showGmgn = showGmgn;
  window.setGmgnInner = setInner;
  window.refreshGmgnTab = function () {
    load(true);
  };
  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf === 'gmgn') showGmgn(true);
        else showGmgn(false);
      }, 0);
    });
  }
})();
