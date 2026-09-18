/* OMG — 7-day log of parabolic smashes and WOW DIP dumps. Not a buy board. */
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
  let kind = 'all';
  try {
    kind = localStorage.getItem('omg_kind') || 'all';
  } catch (e) {}
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
    return n.toExponential(3);
  }
  function pct(n) {
    n = +n;
    if (!Number.isFinite(n)) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function usd(n) {
    n = +n;
    if (!(n > 0)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(n >= 10e9 ? 1 : 2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 10e6 ? 1 : 2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(n >= 100e3 ? 0 : 1) + 'k';
    return '$' + n.toFixed(0);
  }
  function ago(t) {
    const ms = Date.now() - (+t || 0);
    if (!(ms >= 0)) return '—';
    if (ms < 60e3) return 'just now';
    if (ms < 3600e3) return Math.floor(ms / 60e3) + 'm ago';
    if (ms < 86400e3) return Math.floor(ms / 3600e3) + 'h ago';
    return Math.floor(ms / 86400e3) + 'd ago';
  }
  function left(t) {
    const ms = 7 * 86400e3 - (Date.now() - (+t || 0));
    if (ms <= 0) return 'expires soon';
    if (ms < 3600e3) return Math.ceil(ms / 60e3) + 'm left';
    if (ms < 86400e3) return Math.ceil(ms / 3600e3) + 'h left';
    return Math.ceil(ms / 86400e3) + 'd left';
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
      'showWowDip'
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
      'wowdip-panel'
    ].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
  }
  function paintChips() {
    document.querySelectorAll('.omg-kind').forEach(function (b) {
      const on = b.getAttribute('data-omg') === kind;
      b.style.background = on ? '#1a9b6c' : '#121a24';
      b.style.color = on ? '#fff' : '#c5d0dc';
    });
  }
  function renderCard(e) {
    const parab = e.kind === 'PARABOLIC';
    const col = parab ? '#62e3a0' : '#ff6f7c';
    const lab = parab ? 'PARABOLIC' : 'WOW DIP · ' + (e.status || e.severity || 'DUMP');
    return (
      '<div style="padding:14px;border-radius:14px;border:1px solid #243041;background:#0b121a">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<div style="font-weight:900;font-size:16px;color:#e8eef6">' +
      esc(e.name || (e.ca || '').slice(0, 8)) +
      '</div>' +
      '<div style="font-size:13px;font-weight:900;color:' +
      col +
      '">' +
      esc(lab) +
      '</div></div>' +
      '<div style="margin-top:6px;font-size:11px;color:#8491a1">' +
      ago(e.at) +
      ' · first seen ' +
      (e.at ? new Date(e.at).toISOString().replace('T', ' ').slice(0, 16) : '—') +
      ' UTC · ' +
      left(e.at) +
      (e.n > 1 ? ' · updated ×' + e.n : '') +
      '</div>' +
      '<div style="margin-top:8px;font-size:12px;color:#c5d0dc">5m ' +
      pct(e.peakM5 != null ? e.peakM5 : e.m5) +
      ' · 1h ' +
      pct(e.peakH1 != null ? e.peakH1 : e.h1) +
      ' · 6h ' +
      pct(e.h6) +
      ' · 24h ' +
      pct(e.h24) +
      '</div>' +
      '<div style="margin-top:4px;font-size:12px;color:#8491a1">Price ' +
      px(e.spot) +
      ' · MC ' +
      usd(e.mcap) +
      (e.liq ? ' · liq ' + usd(e.liq) : '') +
      '</div>' +
      (e.why
        ? '<div style="margin-top:8px;font-size:12px;color:#c5d0dc;white-space:pre-line">' + esc(String(e.why).slice(0, 500)) + '</div>'
        : '') +
      '<div style="margin-top:8px;font-size:11px;color:#8491a1">Log only. Not an entry signal.</div>' +
      (e.dexUrl
        ? '<div style="margin-top:8px"><a href="' +
          esc(e.dexUrl) +
          '" target="_blank" rel="noopener" style="color:#6eb6ff;font-weight:800;font-size:12px">DexScreener</a></div>'
        : '') +
      '</div>'
    );
  }
  async function load() {
    if (busy) return;
    busy = true;
    const st = $('omg-status');
    const list = $('omg-list');
    try {
      const j = await api('/omg');
      let rows = j.entries || [];
      if (kind === 'PARABOLIC') rows = rows.filter(function (e) { return e.kind === 'PARABOLIC'; });
      if (kind === 'WOWDIP') rows = rows.filter(function (e) { return e.kind === 'WOWDIP'; });
      if (st) st.textContent = 'LIVE · ' + rows.length + ' in 7d' + (kind === 'all' ? '' : ' · ' + kind);
      if (list)
        list.innerHTML = rows.length
          ? rows.map(renderCard).join('')
          : '<div style="color:#8491a1;font-size:12px">No parabolic or WOW DIP moves in the last 7 days.</div>';
      paintChips();
    } catch (e) {
      if (st) st.textContent = String(e.message || e);
      if (list) list.innerHTML = '<div style="color:#ff6f7c;font-size:13px">' + esc(e.message || e) + '</div>';
    }
    busy = false;
  }
  function setKind(k) {
    kind = k || 'all';
    try {
      localStorage.setItem('omg_kind', kind);
    } catch (e) {}
    load();
  }
  function showOmg(on) {
    const p = $('omg-panel');
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      load();
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        const onp = $('omg-panel');
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
  window.showOmg = showOmg;
  window.setOmgKind = setKind;
  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf === 'omg') showOmg(true);
        else showOmg(false);
      }, 0);
    });
  }
})();
