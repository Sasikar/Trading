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
  function depthFromTiers(tiers) {
    const order = [
      { id: 'whale', icon: '🐋', minUsd: 1e6, band: '≥$1M' },
      { id: 'shark', icon: '🦈', minUsd: 1e5, band: '≥$100k' },
      { id: 'dolphin', icon: '🐬', minUsd: 1e4, band: '≥$10k' },
      { id: 'fish', icon: '🐟', minUsd: 1e3, band: '≥$1k' },
      { id: 'crab', icon: '🦀', minUsd: 100, band: '≥$100' }
    ];
    const by = {};
    (tiers || []).forEach(function (t) {
      if (t && t.id) by[t.id] = t;
    });
    const depth = [];
    let n = 0;
    let pct = 0;
    order.forEach(function (o) {
      const t = by[o.id];
      if (t) {
        n += +t.n || 0;
        pct += +t.pct || 0;
      }
      if (!n) return;
      const last = depth[depth.length - 1];
      if (last && last.n === n) return;
      depth.push({
        id: o.id,
        icon: (t && t.icon) || o.icon,
        band: (t && t.band) || o.band,
        n: n,
        pct: pct
      });
    });
    return depth;
  }
  function mixRow(h) {
    const m = h.mix;
    if (!m || (!(m.tiers && m.tiers.length) && m.top10Pct == null && !(m.depth && m.depth.length))) return '';
    const chips = [];
    const top = m.top10Pct != null && Number.isFinite(+m.top10Pct) ? +m.top10Pct : h.topHoldPct;
    if (top != null && Number.isFinite(+top)) {
      chips.push(
        '<span class="hd-chip hd-chip-top">Top10 <span class="pct">' +
          Number(top).toFixed(1) +
          '%</span></span>'
      );
    }
    (m.tiers || []).forEach(function (tier) {
      chips.push(
        '<span class="hd-chip" title="' +
          esc(tier.label || '') +
          ' ' +
          esc(tier.band || '') +
          '">' +
          '<span class="ico">' +
          esc(tier.icon || '') +
          '</span><span class="lab">' +
          esc(tier.band || tier.label || '') +
          '</span><span class="pct">' +
          Number(tier.pct).toFixed(1) +
          '%</span><span class="n">' +
          esc(String(tier.n)) +
          '</span></span>'
      );
    });
    if (m.restPct != null && +m.restPct > 0.4) {
      chips.push(
        '<span class="hd-chip hd-chip-rest">rest <span class="pct">' +
          Number(m.restPct).toFixed(1) +
          '%</span></span>'
      );
    }
    const depth = m.depth && m.depth.length ? m.depth : depthFromTiers(m.tiers);
    const dchips = (depth || []).map(function (x) {
      return (
        '<span class="hd-chip" title="largest 20 wallets at or above this USD of this token">' +
        '<span class="ico">' +
        esc(x.icon || '') +
        '</span><span class="lab">' +
        esc(x.band || '') +
        '</span><span class="n">' +
        esc(String(x.n)) +
        '</span><span class="pct">' +
        Number(x.pct).toFixed(1) +
        '%</span></span>'
      );
    });
    let html = '';
    if (chips.length) html += '<div class="hd-mix">' + chips.join('') + '</div>';
    if (dchips.length) {
      html +=
        '<div class="hd-depth"><div class="hd-depth-lab">Wallet depth · largest 20</div><div class="hd-mix">' +
        dchips.join('') +
        '</div></div>';
    }
    return html;
  }
  function renderCard(h) {
    const caShort = h.ca && h.ca.length > 12 ? h.ca.slice(0, 6) + '…' + h.ca.slice(-4) : h.ca || '';
    const four = h.ready4h
      ? cell('4H', h.net4h, h.pct4h, true)
      : cell('4H / 6H', h.net6h, h.pct6h, h.net6h != null, '6h Jupiter · 4h tape filling');
    const analytics = h.solscanAnalytics || (h.ca ? 'https://solscan.io/token/' + h.ca + '#analytics' : '');
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
      mixRow(h) +
      '<div class="hd-foot">' +
      esc(caShort) +
      (h.error ? ' · ' + esc(h.error) : '') +
      (h.solscan
        ? ' · <a href="' +
          esc(h.solscan) +
          '" target="_blank" rel="noopener">Solscan holders</a>'
        : '') +
      (analytics
        ? ' · <a href="' +
          esc(analytics) +
          '" target="_blank" rel="noopener">analytics</a>'
        : '') +
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

  async function load(force) {
    const list = $('hd-list');
    const st = $('hd-status');
    const src = $('hd-source');
    try {
      if (st) st.textContent = force ? 'Refreshing…' : 'Loading holders…';
      const j = force ? await api('/holders', { method: 'POST' }) : await api('/holders');
      if (src) src.textContent = j.scannedAt ? 'JUPITER · ' + ago(j.scannedAt) : 'JUPITER';
      if (st) {
        st.textContent =
          (j.cards || []).length +
          ' SOL coins' +
          (j.ethSkipped ? ' · ETH skipped' : '') +
          (j.scannedAt ? ' · ' + ago(j.scannedAt) : '');
      }
      if (list) {
        if (!(j.cards || []).length) {
          list.innerHTML = '<div style="font-size:12px;color:#8491a1">No SOL coins on the watchlist yet.</div>';
        } else {
          list.innerHTML = j.cards.map(renderCard).join('');
        }
      }
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
