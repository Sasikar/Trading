/* Pitfalls — every saved CA. Tap opens that token on DexScreener (socials). */
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
  function usd(n) {
    n = +n;
    if (!(n > 0)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(n >= 10e9 ? 1 : 2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 10e6 ? 1 : 2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(n >= 100e3 ? 0 : 1) + 'k';
    return '$' + n.toFixed(0);
  }
  function dexToken(ca, chain) {
    const id = String(chain || 'solana').toLowerCase();
    const ch = id === 'ethereum' || id === 'eth' ? 'ethereum' : id === 'robinhood' ? 'robinhood' : 'solana';
    return 'https://dexscreener.com/' + ch + '/' + String(ca || '').trim();
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
      'showStrategy'
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
      'strategy-panel'
    ].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
  }
  function openDex(url) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  function renderCard(c) {
    const url = c.dexUrl || dexToken(c.ca, c.chain);
    const chain = String(c.chain || 'solana').toUpperCase();
    return (
      '<button type="button" class="pf-row" data-dex="' +
      esc(url) +
      '" style="display:block;width:100%;text-align:left;padding:14px;border-radius:14px;border:1px solid #243041;background:#0b121a;cursor:pointer">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<div style="font-weight:900;font-size:16px;color:#e8eef6">' +
      esc(c.name) +
      ' <span style="font-size:10px;font-weight:800;color:#8491a1">' +
      esc(chain) +
      '</span></div>' +
      '<div style="font-size:12px;font-weight:800;color:#6eb6ff">Open Dex →</div></div>' +
      '<div style="margin-top:6px;font-size:11px;color:#8491a1;word-break:break-all">' +
      esc(c.ca) +
      '</div>' +
      '<div style="margin-top:6px;font-size:12px;color:#c5d0dc">Price ' +
      px(c.spot) +
      ' · MC ' +
      usd(c.mcap) +
      '</div>' +
      '<div style="margin-top:8px;font-size:11px;color:#8491a1">DexScreener token page · Website / Twitter</div>' +
      '</button>'
    );
  }
  async function load() {
    if (busy) return;
    busy = true;
    const st = $('pf-status');
    const list = $('pf-list');
    try {
      let cards = [];
      try {
        const j = await api('/pitfalls');
        cards = j.cards || [];
        if (st) st.textContent = 'LIVE · ' + (j.saved || cards.length) + ' saved';
      } catch (e0) {
        const r = await fetch('data/ca-recents.json', { cache: 'no-store' });
        const j = await r.json();
        cards = (j.items || []).map(function (it) {
          return {
            name: it.name || it.base || (it.ca || '').slice(0, 8),
            ca: it.ca,
            chain: it.chain || 'solana',
            spot: 0,
            mcap: 0,
            dexUrl: dexToken(it.ca, it.chain)
          };
        });
        if (st) st.textContent = (cards.length || 0) + ' saved';
      }
      if (list)
        list.innerHTML = cards.length
          ? cards.map(renderCard).join('')
          : '<div style="color:#8491a1;font-size:12px">No saved CAs.</div>';
      if (list)
        list.querySelectorAll('.pf-row').forEach(function (b) {
          b.addEventListener('click', function () {
            openDex(b.getAttribute('data-dex'));
          });
        });
    } catch (e) {
      if (st) st.textContent = String(e.message || e);
      if (list) list.innerHTML = '<div style="color:#ff6f7c;font-size:13px">' + esc(e.message || e) + '</div>';
    }
    busy = false;
  }
  function showPitfalls(on) {
    const p = $('pitfalls-panel');
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      load();
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        const onp = $('pitfalls-panel');
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
  window.showPitfalls = showPitfalls;
  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf === 'pitfalls') showPitfalls(true);
        else showPitfalls(false);
      }, 0);
    });
  }
})();
