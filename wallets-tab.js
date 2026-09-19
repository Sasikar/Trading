/* Wallet tracker — FOMO leaders + on-chain buys. Not a buy signal. */
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
  let inner = 'leaders';
  try {
    inner = localStorage.getItem('wt_inner') || 'leaders';
  } catch (e) {}
  if (inner !== 'buys' && inner !== 'signals') inner = 'leaders';
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
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 10e6 ? 1 : 2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(n >= 100e3 ? 0 : 1) + 'k';
    return '$' + n.toFixed(0);
  }
  function clock(t) {
    if (!+t) return '—';
    const d = new Date(+t);
    const p = (n) => (n < 10 ? '0' : '') + n;
    return p(d.getHours()) + ':' + p(d.getMinutes());
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
  function paintChips() {
    document.querySelectorAll('.wt-tab').forEach(function (b) {
      const on = b.getAttribute('data-wt') === inner;
      b.style.background = on ? '#1a9b6c' : '#121a24';
      b.style.color = on ? '#fff' : '#c5d0dc';
    });
  }
  function leaderCard(c) {
    return (
      '<div style="padding:14px;border-radius:14px;border:1px solid #243041;background:#0b121a">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
      '<div style="font-weight:900;font-size:16px;color:#e8eef6">#' +
      esc(c.rank) +
      ' @' +
      esc(c.handle) +
      '</div>' +
      '<div style="font-size:13px;font-weight:800;color:#62e3a0">' +
      usd(c.pnl) +
      '</div></div>' +
      '<div style="margin-top:8px;font-size:11px;color:#8491a1;word-break:break-all">' +
      (c.sol ? 'SOL ' + esc(c.sol) : 'no SOL wallet') +
      '</div>' +
      '<div style="margin-top:8px;display:flex;gap:12px;flex-wrap:wrap">' +
      (c.fomoUrl ? '<a href="' + esc(c.fomoUrl) + '" target="_blank" rel="noopener" style="color:#6eb6ff;font-weight:800;font-size:12px">FOMO</a>' : '') +
      (c.solscan ? '<a href="' + esc(c.solscan) + '" target="_blank" rel="noopener" style="color:#6eb6ff;font-weight:800;font-size:12px">Solscan</a>' : '') +
      (c.gmgnUrl ? '<a href="' + esc(c.gmgnUrl) + '" target="_blank" rel="noopener" style="color:#6eb6ff;font-weight:800;font-size:12px">GMGN</a>' : '') +
      '</div></div>'
    );
  }
  function buyCard(c) {
    return (
      '<div style="padding:14px;border-radius:14px;border:1px solid #243041;background:#0b121a">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
      '<div style="font-weight:900;font-size:16px;color:#e8eef6">' +
      esc(c.name || c.mint) +
      (c.saved ? ' · saved' : '') +
      '</div>' +
      '<div style="font-size:12px;color:#8491a1">' +
      (c.handles || []).length +
      ' traders</div></div>' +
      '<div style="margin-top:6px;font-size:12px;color:#c5d0dc">' +
      esc((c.handles || []).map(function (h) { return '@' + h; }).join(' ')) +
      '</div>' +
      '<div style="margin-top:6px;font-size:12px;color:#8491a1">liq ' +
      usd(c.liq) +
      ' · vol ' +
      usd(c.volume) +
      ' · MC ' +
      usd(c.mcap) +
      (c.ew ? ' · EW ' + esc(c.ew) : '') +
      (c.caState ? ' · CA ' + esc(c.caState) : '') +
      '</div>' +
      (c.dexUrl
        ? '<div style="margin-top:8px"><a href="' + esc(c.dexUrl) + '" target="_blank" rel="noopener" style="color:#6eb6ff;font-weight:800;font-size:12px">DexScreener</a></div>'
        : '') +
      '</div>'
    );
  }
  async function load(force) {
    if (busy) return;
    busy = true;
    const st = $('wt-status');
    const list = $('wt-list');
    try {
      const j = await api('/wallets' + (force ? '?force=1' : ''));
      if (st)
        st.textContent =
          (j.at ? ago(j.at) : 'waiting') +
          ' · next ' +
          (j.next ? clock(j.next) : '—') +
          ' · ' +
          (j.source || '') +
          (j.err ? ' · ' + j.err : '');
      let rows = [];
      if (inner === 'signals') rows = j.signals || [];
      else if (inner === 'buys') rows = j.buys || [];
      else rows = j.leaders || [];
      if (list)
        list.innerHTML = rows.length
          ? rows.map(inner === 'leaders' ? leaderCard : buyCard).join('')
          : '<div style="color:#8491a1;font-size:12px">' +
            (j.err ? esc(j.err) : inner === 'leaders' ? 'No leaders yet. Worker loads the public top-100 list.' : 'No new buys yet. First scan stores holdings; the next 30m scan diffs them.') +
            '</div>';
      paintChips();
    } catch (e) {
      if (st) st.textContent = String(e.message || e);
      if (list) list.innerHTML = '<div style="color:#ff6f7c;font-size:13px">' + esc(e.message || e) + '</div>';
    }
    busy = false;
  }
  function setInner(id) {
    inner = id === 'buys' || id === 'signals' ? id : 'leaders';
    try {
      localStorage.setItem('wt_inner', inner);
    } catch (e) {}
    load(false);
  }
  function showWallets(on) {
    const p = $('wallets-panel');
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      load(false);
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        const onp = $('wallets-panel');
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
  window.showWallets = showWallets;
  window.setWalletInner = setInner;
  window.refreshWalletsTab = function () {
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
        if (tf === 'wallets') showWallets(true);
        else showWallets(false);
      }, 0);
    });
  }
})();
