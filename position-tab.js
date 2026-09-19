/* Position Monitor — observation only. STRETCHED does not blind this. Not a buy button. */
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
    ['showBreakoutMemes', 'showHunter', 'showKeep', 'showHolders', 'showSentiment', 'showFailures', 'showInMemory', 'showVerdict', 'showEntryWindow', 'showWowDip', 'showOmg', 'showPitfalls', 'showStrategy', 'showDecisionCheck'].forEach(
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
      'entrywindow-panel',
      'wowdip-panel',
      'omg-panel',
      'pitfalls-panel',
      'strategy-panel',
      'decision-panel'
    ].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
  }
  function colorOf(type) {
    if (type === 'EXHAUSTION') return '#ff6f7c';
    if (type === 'ACCELERATION' || type === 'CONTINUATION') return '#f0a060';
    if (type === 'MOMENTUM') return '#e6c878';
    if (type === 'RETEST') return '#62e3a0';
    return '#8491a1';
  }
  function renderCard(c) {
    const p = c.primary || {};
    const ev = (c.events || [])
      .map(function (e) {
        return '<div style="font-size:12px;color:#c5d0dc;margin-top:4px">· ' + esc(e.label) + ' — ' + esc(e.why) + '</div>';
      })
      .join('');
    return (
      '<div style="padding:14px;border-radius:14px;border:1px solid #243041;background:#0b121a">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<div style="font-weight:900;font-size:16px;color:#e8eef6">' +
      esc(c.name) +
      (c.stretched
        ? ' <span style="font-size:10px;font-weight:800;color:#f0a060">STRETCHED · watch only</span>'
        : '') +
      '</div>' +
      '<div style="font-size:13px;font-weight:900;color:' +
      colorOf(p.type) +
      '">' +
      esc(p.label || 'QUIET') +
      '</div></div>' +
      '<div style="margin-top:8px;font-size:12px;color:#c5d0dc;line-height:1.45">' +
      esc(p.why || '') +
      '</div>' +
      '<div style="margin-top:8px;font-size:12px;color:#8491a1">5m ' +
      pct(c.m5) +
      ' · 1h ' +
      pct(c.h1) +
      ' · 15m bar ' +
      pct(c.ret15) +
      ' · vol ' +
      (c.volX != null ? Number(c.volX).toFixed(1) : '—') +
      'x · spot ' +
      px(c.spot) +
      '</div>' +
      ev +
      '<div style="margin-top:8px;font-size:11px;color:#8491a1">Not an entry signal. CA / Entry Window decide entry.</div>' +
      (c.dexUrl
        ? '<div style="margin-top:8px"><a href="' +
          esc(c.dexUrl) +
          '" target="_blank" rel="noopener" style="color:#6eb6ff;font-weight:800;font-size:12px">DexScreener</a></div>'
        : '') +
      '</div>'
    );
  }
  async function load() {
    if (busy) return;
    busy = true;
    const st = $('pm-status');
    const list = $('pm-list');
    try {
      const j = await api('/position');
      const nHot = (j.cards || []).filter(function (c) {
        const t = c.primary && c.primary.type;
        return t && t !== 'QUIET' && t !== 'STRETCHED_WATCH';
      }).length;
      if (st) st.textContent = 'LIVE · ' + (j.saved || 0) + ' saved · ' + nHot + ' moving';
      if (list)
        list.innerHTML = (j.cards || []).length
          ? j.cards.map(renderCard).join('')
          : '<div style="color:#8491a1;font-size:12px">No saved CAs.</div>';
    } catch (e) {
      if (st) st.textContent = String(e.message || e);
      if (list) list.innerHTML = '<div style="color:#ff6f7c;font-size:13px">' + esc(e.message || e) + '</div>';
    }
    busy = false;
  }
  function showPositionMonitor(on) {
    const p = $('position-panel');
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      load();
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        const onp = $('position-panel');
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
  window.showPositionMonitor = showPositionMonitor;
  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf === 'position') showPositionMonitor(true);
        else showPositionMonitor(false);
      }, 0);
    });
  }
})();
