/* Holders tab — Jupiter live 1h/6h/24h. 4h & 1w from our snapshots. SOL only. */
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
  const $ = (id) => document.getElementById(id);
  let timer = null;
  const bag = window.__hdBag || (window.__hdBag = { cards: [], query: '' });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      if (c === '&') return '&' + 'amp;';
      if (c === '<') return '&' + 'lt;';
      if (c === '>') return '&' + 'gt;';
      return '&' + 'quot;';
    });
  }
  function fmtN(n) {
    n = +n;
    if (!Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e4) return Math.round(n).toLocaleString();
    return String(Math.round(n));
  }
  function signed(n) {
    n = +n;
    if (!Number.isFinite(n)) return '—';
    const s = n > 0 ? '+' : '';
    return s + fmtN(n);
  }
  function pct(n) {
    n = +n;
    if (!Number.isFinite(n)) return '';
    const s = n > 0 ? '+' : '';
    return s + n.toFixed(2) + '%';
  }
  function ago(ms) {
    const n = Number(ms);
    if (!n) return '—';
    const s = Math.round((Date.now() - n) / 1000);
    if (s < 20) return 'just now';
    if (s < 60) return s + 's ago';
    const m = Math.round(s / 60);
    if (m < 60) return m + 'm ago';
    return Math.round(m / 60) + 'h ago';
  }
  function cell(label, net, p, ready, fallback) {
    const ok = ready !== false && (net != null || (p != null && Number.isFinite(+p)));
    const col = !ok ? '#8491a1' : +net > 0 || +p > 0 ? '#62e3a0' : +net < 0 || +p < 0 ? '#ff6f7c' : '#e6c878';
    const top = ok ? signed(net) : fallback || 'warming';
    const bot = ok ? pct(p) : '';
    return (
      '<div class="hd-cell">' +
      '<div class="lab">' +
      esc(label) +
      '</div>' +
      '<div class="val" style="color:' +
      col +
      '">' +
      esc(top) +
      '</div>' +
      '<div class="sub">' +
      esc(bot) +
      '</div></div>'
    );
  }
  function renderCard(h) {
    const caShort = h.ca && h.ca.length > 12 ? h.ca.slice(0, 6) + '…' + h.ca.slice(-4) : h.ca || '';
    const four = h.ready4h
      ? cell('4H', h.net4h, h.pct4h, true)
      : cell('4H / 6H', h.net6h, h.pct6h, h.net6h != null, '6h Jupiter · 4h tape filling');
    const ca = h.ca || '';
    const dex =
      h.solscanDex ||
      (ca ? 'https://solscan.io/token/' + ca + '?tab=analytics#analytics' : '');
    const holders =
      h.solscan || (ca ? 'https://solscan.io/token/' + ca + '?tab=holders#holders' : '');
    return (
      '<div class="hd-card">' +
      '<div class="hd-top">' +
      '<div class="hd-name">' +
      '<img src="https://cdn.dexscreener.com/cms/chain/solana.png" alt="SOL" width="16" height="16" />' +
      esc(h.name || '—') +
      '</div>' +
      '<div class="hd-count">' +
      fmtN(h.n) +
      '<span> holders</span></div></div>' +
      '<div class="hd-grid">' +
      cell('1H', h.net1h, h.pct1h, true) +
      four +
      cell('1D', h.net24h, h.pct24h, true) +
      (h.ready1w
        ? cell('1W', h.net1w, h.pct1w, true)
        : cell('1W', null, null, false, 'need ~7d of our snaps')) +
      (h.ready1M
        ? cell('1M', h.net1M, h.pct1M, true)
        : cell('1M', null, null, false, 'need ~30d of our snaps')) +
      '</div>' +
      '<div class="hd-split">' +
      (dex
        ? '<a class="hd-pane hd-pane-dex" href="' +
          esc(dex) +
          '" target="_blank" rel="noopener"><span class="hd-pane-kicker">Solscan</span><span class="hd-pane-title">Dex trading</span><span class="hd-pane-sub">Analytics · buy/sell volume</span></a>'
        : '') +
      (holders
        ? '<a class="hd-pane hd-pane-hold" href="' +
          esc(holders) +
          '" target="_blank" rel="noopener"><span class="hd-pane-kicker">Solscan</span><span class="hd-pane-title">Holders</span><span class="hd-pane-sub">Wallet list · % supply</span></a>'
        : '') +
      '</div>' +
      '<div class="hd-foot">' +
      esc(caShort) +
      (h.topHoldPct != null ? ' · top wallets ' + Number(h.topHoldPct).toFixed(1) + '%' : '') +
      (h.error ? ' · ' + esc(h.error) : '') +
      '</div></div>'
    );
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

  function byDay(a, b) {
    const an = Number(a && a.net24h);
    const bn = Number(b && b.net24h);
    const aok = Number.isFinite(an);
    const bok = Number.isFinite(bn);
    if (aok !== bok) return aok ? -1 : 1;
    if (aok && an !== bn) return bn - an;
    return (Number(b && b.n) || 0) - (Number(a && a.n) || 0);
  }
  function hits() {
    const q = bag.query.trim().toLowerCase();
    const rows = !q
      ? bag.cards.slice()
      : bag.cards.filter(function (h) {
          const name = String(h.name || '').toLowerCase();
          const ca = String(h.ca || '').toLowerCase();
          return name.indexOf(q) >= 0 || ca.indexOf(q) >= 0;
        });
    return rows.sort(byDay);
  }
  function paint() {
    const list = $('hd-list');
    if (!list) return;
    const q = bag.query.trim();
    const shown = hits();
    if (!bag.cards.length) {
      if (!q) list.innerHTML = '<div style="font-size:12px;color:#8491a1">No SOL coins on the watchlist yet.</div>';
      return;
    }
    if (!shown.length) {
      list.innerHTML = '<div style="font-size:12px;color:#8491a1">No coin matches.</div>';
      return;
    }
    list.innerHTML = shown.map(renderCard).join('');
  }
  function suggest() {
    const box = $('hd-suggest');
    if (!box) return;
    const q = bag.query.trim().toLowerCase();
    const shown = q ? hits().slice(0, 8) : [];
    if (!shown.length) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    box.style.display = 'block';
    box.innerHTML = shown
      .map(function (h) {
        const ca = h.ca && h.ca.length > 12 ? h.ca.slice(0, 4) + '…' + h.ca.slice(-4) : h.ca || '';
        return (
          '<button type="button" data-pick="' +
          esc(h.name || h.ca || '') +
          '" style="display:flex;width:100%;justify-content:space-between;gap:10px;padding:12px 14px;border:0;border-bottom:1px solid #1c2733;background:#0e151d;color:#e8eef6;font-weight:800;text-align:left;cursor:pointer"><span>' +
          esc(h.name || '—') +
          '</span><span style="color:#8491a1;font-weight:700">' +
          esc(ca) +
          '</span></button>'
        );
      })
      .join('');
  }
  function statusLine(extra) {
    const st = $('hd-status');
    if (!st) return;
    const n = bag.cards.length;
    const q = bag.query.trim();
    const shown = hits().length;
    st.textContent = (q && n ? shown + ' of ' + n : n + ' SOL coins') + (extra || '');
  }

  async function load(force) {
    const list = $('hd-list');
    const st = $('hd-status');
    const src = $('hd-source');
    try {
      if (st) st.textContent = force ? 'Refreshing…' : 'Loading holders…';
      const j = force ? await api('/holders', { method: 'POST' }) : await api('/holders');
      if (src) src.textContent = j.scannedAt ? 'JUPITER · ' + ago(j.scannedAt) : 'JUPITER';
      bag.cards = j.cards || [];
      const tail = (j.ethSkipped ? ' · ETH skipped' : '') + (j.scannedAt ? ' · ' + ago(j.scannedAt) : '');
      statusLine(tail);
      paint();
      suggest();
    } catch (e) {
      if (st) st.textContent = String(e && e.message ? e.message : e);
      if (list) list.innerHTML = '<div style="font-size:12px;color:#ff6f7c">Holders feed failed.</div>';
    }
  }

  function showHolders(on) {
    const p = $('holders-panel');
    if (on) {
      try {
        window.showBreakoutMemes(false);
      } catch (e) {}
      try {
        window.showHunter(false);
      } catch (e) {}
      try {
        window.showVerdict(false);
      } catch (e) {}
      try {
        window.showFailures(false);
      } catch (e) {}
      try {
        window.showInMemory(false);
      } catch (e) {}
      try {
        window.showSentiment(false);
      } catch (e) {}
      try {
        window.showKeep(false);
      } catch (e) {}
      ['tf-panels', 'trend-panel', 'struct-panel', 'macro-panel', 'signal-panel', 'memegate-panel', 'coin-panel', 'antifomo-panel', 'hunter-panel', 'breakouts-panel', 'verdict-panel', 'failures-panel', 'inmemory-panel', 'sentiment-panel', 'keep-panel'].forEach(
        function (id) {
          const el = $(id);
          if (!el) return;
          el.style.display = 'none';
          el.classList.remove('on');
          if (id === 'tf-panels') el.classList.add('hidden');
        }
      );
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      load(false);
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        const onp = $('holders-panel');
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

  window.showHolders = showHolders;
  window.refreshHoldersTab = function () {
    return load(true);
  };
  const qbox = $('hd-q');
  const sug = $('hd-suggest');
  if (qbox && qbox.getAttribute('data-hd') !== '1') {
    qbox.setAttribute('data-hd', '1');
    qbox.addEventListener('input', function () {
      bag.query = qbox.value || '';
      paint();
      suggest();
      statusLine('');
    });
    qbox.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const first = hits()[0];
      if (!first) return;
      bag.query = first.name || first.ca || '';
      qbox.value = bag.query;
      paint();
      if (sug) sug.style.display = 'none';
      statusLine('');
    });
  }
  if (sug && sug.getAttribute('data-hd') !== '1') {
    sug.setAttribute('data-hd', '1');
    sug.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-pick]');
      if (!b) return;
      bag.query = b.getAttribute('data-pick') || '';
      if (qbox) qbox.value = bag.query;
      paint();
      sug.style.display = 'none';
      statusLine('');
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
        if (tf !== 'holders') showHolders(false);
      }, 0);
    });
  }
})();
