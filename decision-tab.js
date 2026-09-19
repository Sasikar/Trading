/* Decision Check — review layer. Not a buy/sell. */
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
  let view = 'live';
  let filter = 'all';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      if (c === '&') return '&' + 'amp;';
      if (c === '<') return '&' + 'lt;';
      if (c === '>') return '&' + 'gt;';
      return '&' + 'quot;';
    });
  }
  function mark(st) {
    if (st === 'WAIT') return { dot: '⚪', col: '#e6c878' };
    if (st === 'CHECK') return { dot: '🟡', col: '#f0a060' };
    if (st === 'CLEAR') return { dot: '🟢', col: '#62e3a0' };
    return { dot: '⚪', col: '#8491a1' };
  }
  function ico(st) {
    if (st === 'WAIT') return '⚠';
    if (st === 'CHECK') return '⚠';
    if (st === 'CLEAR') return '✓';
    return '⚪';
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
      'showWowDip',
      'showOmg',
      'showPitfalls',
      'showStrategy',
      'showGmgn'
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
      'gmgn-panel'
    ].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
  }
  function boardHtml(j) {
    const m = mark(j.board || 'CLEAR');
    const n = (j.nCheck || 0) + (j.nWait || 0);
    return (
      '<div style="padding:16px;border-radius:14px;border:1px solid #243041;background:#0b121a;margin-bottom:12px">' +
      '<div style="font-size:11px;letter-spacing:.08em;color:#8491a1;font-weight:800">DECISION CHECK</div>' +
      '<div style="margin-top:6px;font-size:28px;font-weight:900;color:' +
      m.col +
      '">' +
      m.dot +
      ' ' +
      esc(j.board || 'CLEAR') +
      '</div>' +
      '<div style="margin-top:6px;font-size:13px;color:#c5d0dc">' +
      (n ? n + ' item' + (n === 1 ? '' : 's') + ' to review across saved CAs' : 'No material items to review') +
      '</div>' +
      '<div style="margin-top:8px;font-size:12px;color:#8491a1">🟢 ' +
      (j.nClear || 0) +
      ' clear · 🟡 ' +
      (j.nCheck || 0) +
      ' check · ⚪ ' +
      (j.nWait || 0) +
      ' wait</div>' +
      '<div style="margin-top:8px;font-size:11px;color:#8491a1">Not a buy or sell. CA / Entry Window still decide setup and location.</div>' +
      '</div>'
    );
  }
  function renderCard(c) {
    const m = mark(c.overall);
    const checks = (c.checks || [])
      .filter(function (x) {
        return x.state !== 'UNAVAILABLE';
      })
      .map(function (x) {
        return (
          '<div style="font-size:12px;color:#c5d0dc;margin-top:3px">' +
          ico(x.state) +
          ' ' +
          esc(x.label) +
          (x.state === 'CLEAR' ? '' : ' — ' + esc(x.why)) +
          '</div>'
        );
      })
      .join('');
    const att = (c.attention || [])
      .map(function (a) {
        return '<div style="margin-top:4px;font-size:12px;color:#e6c878">⚠ ' + esc(a.label) + ' — ' + esc(a.why) + '</div>';
      })
      .join('');
    const dq = c.data || {};
    return (
      '<div style="padding:14px;border-radius:14px;border:1px solid #243041;background:#0b121a">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<div style="font-weight:900;font-size:16px;color:#e8eef6">' +
      esc(c.name) +
      '</div>' +
      '<div style="font-size:14px;font-weight:900;color:' +
      m.col +
      '">' +
      m.dot +
      ' ' +
      esc(c.overall) +
      '</div></div>' +
      '<div style="margin-top:8px;font-size:12px;color:#8491a1">CA ' +
      esc(c.caState || '—') +
      ' · ENTRY WINDOW ' +
      esc(c.ewLabel || c.ewState || '—') +
      (c.tf ? ' · ' + esc(String(c.tf).toUpperCase()) : '') +
      '</div>' +
      (att || '') +
      '<div style="margin-top:8px;font-size:11px;letter-spacing:.06em;color:#8491a1;font-weight:800">CHECKS</div>' +
      checks +
      '<div style="margin-top:10px;font-size:12px;font-weight:800;color:#e8eef6">ACTION · ' +
      esc(c.action) +
      '</div>' +
      '<div style="margin-top:6px;font-size:11px;color:#8491a1">DATA · ' +
      esc((dq.state === 'CLEAR' && 'Fresh') || dq.why || '—') +
      '</div></div>'
    );
  }
  function histHtml(h) {
    h = h || {};
    const after = h.after || {};
    const kind = h.byKind || {};
    const names = {
      extension: 'Entry extension',
      lateEntry: 'Breakout age',
      fakeout: 'Reclaim',
      liquidity: 'Execution quality',
      htf: 'HTF context',
      fastMove: 'Fast move',
      BLUNDER_FOMO: 'Extension (internal)',
      BLUNDER_LATE_ENTRY: 'Late entry (internal)',
      BLUNDER_FAKEOUT: 'Reclaim (internal)',
      BLUNDER_LIQUIDITY: 'Liquidity (internal)',
      BLUNDER_HTF: 'HTF (internal)',
      BLUNDER_FAST: 'Fast move (internal)'
    };
    const rows = Object.keys(kind)
      .filter(function (k) {
        return names[k] && names[k].indexOf('internal') < 0;
      })
      .map(function (k) {
        return '<div style="font-size:12px;color:#c5d0dc;margin-top:4px">' + esc(names[k] || k) + ' · ' + kind[k] + '</div>';
      })
      .join('');
    return (
      '<div style="padding:14px;border-radius:14px;border:1px solid #243041;background:#0b121a">' +
      '<div style="font-size:13px;color:#c5d0dc">CHECK ' +
      (h.nCheck || 0) +
      ' · WAIT ' +
      (h.nWait || 0) +
      ' · CLEAR ' +
      (h.nClear || 0) +
      '</div>' +
      '<div style="margin-top:10px;font-size:11px;letter-spacing:.08em;color:#8491a1;font-weight:800">CONDITIONS</div>' +
      (rows || '<div style="font-size:12px;color:#8491a1;margin-top:6px">No logged conditions yet.</div>') +
      '<div style="margin-top:12px;font-size:11px;letter-spacing:.08em;color:#8491a1;font-weight:800">WHAT HAPPENED AFTER (6h+)</div>' +
      '<div style="margin-top:6px;font-size:12px;color:#c5d0dc">Sample ' +
      (after.n || 0) +
      ' · +20% ' +
      (after.plus20 || 0) +
      ' · +50% ' +
      (after.plus50 || 0) +
      ' · −20% ' +
      (after.minus20 || 0) +
      '</div>' +
      '<div style="margin-top:8px;font-size:11px;color:#8491a1">These counts test whether a check improved outcomes. A rule is not useful just because it sounds logical.</div></div>'
    );
  }
  function paintChips() {
    document.querySelectorAll('.dc-view').forEach(function (b) {
      const on = b.getAttribute('data-dc') === view;
      b.style.background = on ? '#1a9b6c' : '#121a24';
      b.style.color = on ? '#fff' : '#c5d0dc';
    });
    document.querySelectorAll('.dc-filter').forEach(function (b) {
      const on = b.getAttribute('data-dc-f') === filter;
      b.style.background = on ? '#243041' : '#121a24';
      b.style.color = on ? '#e8eef6' : '#8491a1';
    });
  }
  async function load() {
    if (busy) return;
    busy = true;
    const st = $('dc-status');
    const board = $('dc-board');
    const list = $('dc-list');
    try {
      const j = await api('/decision');
      if (st) st.textContent = 'LIVE · ' + (j.saved || 0) + ' saved';
      if (board) board.innerHTML = boardHtml(j);
      if (view === 'hist') {
        if (list) list.innerHTML = histHtml(j.history);
      } else {
        let cards = j.cards || [];
        if (filter !== 'all') cards = cards.filter(function (c) { return c.overall === filter; });
        if (list)
          list.innerHTML = cards.length
            ? cards.map(renderCard).join('')
            : '<div style="color:#8491a1;font-size:12px">Nothing in this filter.</div>';
      }
      paintChips();
    } catch (e) {
      if (st) st.textContent = String(e.message || e);
      if (list) list.innerHTML = '<div style="color:#ff6f7c;font-size:13px">' + esc(e.message || e) + '</div>';
    }
    busy = false;
  }
  function setView(v) {
    view = v || 'live';
    load();
  }
  function setFilter(f) {
    filter = f || 'all';
    view = 'live';
    load();
  }
  function showDecisionCheck(on) {
    const p = $('decision-panel');
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      load();
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        const onp = $('decision-panel');
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
  window.showDecisionCheck = showDecisionCheck;
  window.setDecisionView = setView;
  window.setDecisionFilter = setFilter;
  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf === 'decision') showDecisionCheck(true);
        else showDecisionCheck(false);
      }, 0);
    });
  }
})();
