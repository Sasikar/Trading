/* Verdict tab — display only. Calls live on the Cloudflare worker. */
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
  let busy = false;
  let selected = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      if (c === '&') return '&' + 'amp;';
      if (c === '<') return '&' + 'lt;';
      if (c === '>') return '&' + 'gt;';
      return '&' + 'quot;';
    });
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

  function fillSelect(coins) {
    const sel = $('vd-ca');
    if (!sel) return;
    const cur = selected || sel.value;
    sel.innerHTML =
      '<option value="">Pick a saved coin</option>' +
      (coins || [])
        .map(function (c) {
          const lab = (c.name || c.ca.slice(0, 6)) + ' · ' + String(c.chain || '').replace('solana', 'SOL').replace('ethereum', 'ETH').replace('robinhood', 'HOOD');
          return '<option value="' + esc(c.ca) + '"' + (c.ca === cur ? ' selected' : '') + '>' + esc(lab) + '</option>';
        })
        .join('');
    if (cur) sel.value = cur;
  }

  function card(h) {
    const hold = h.call === 'HOLD';
    const col = hold ? '#62e3a0' : '#ff6f7c';
    const pills = (h.tfs || [])
      .map(function (t) {
        const s = t.section || t.state || 'WATCH';
        return (
          '<span class="vd-pill">' +
          esc(String(t.tf).toUpperCase()) +
          ' ' +
          esc(s) +
          '</span>'
        );
      })
      .join('');
    return (
      '<div class="vd-card ' +
      (hold ? 'hold' : 'exit') +
      '">' +
      '<div class="vd-k">' +
      esc(h.label) +
      ' <span>' +
      esc(h.sub) +
      '</span></div>' +
      '<div class="vd-call" style="color:' +
      col +
      '">' +
      esc(h.call) +
      '</div>' +
      '<div class="vd-why">' +
      esc(h.why) +
      '</div>' +
      '<div class="vd-pills">' +
      pills +
      '</div>' +
      (h.reasons && h.reasons.length
        ? '<div class="vd-why" style="margin-top:8px;color:#8491a1">' +
          h.reasons.map(esc).join('<br>') +
          '</div>'
        : '') +
      '</div>'
    );
  }

  function render(j) {
    const box = $('vd-board');
    const v = j && j.verdict;
    if (!v) {
      if (box)
        box.innerHTML =
          '<div style="padding:14px;border-radius:12px;border:1px dashed #243041;color:#8491a1;font-size:13px">Pick a saved coin. Short / medium / long each get HOLD or EXIT from the same tape as Breakout.</div>';
      return;
    }
    const chainLab =
      v.chain === 'solana' ? 'SOL' : v.chain === 'ethereum' ? 'ETH' : String(v.chain || '').toUpperCase();
    box.innerHTML =
      '<div class="vd-head">' +
      '<div><div class="vd-name">' +
      esc(v.name) +
      ' <span>' +
      chainLab +
      '</span></div>' +
      '<div class="vd-meta">5m ' +
      (v.m5 >= 0 ? '+' : '') +
      (v.m5 != null ? Number(v.m5).toFixed(1) : '—') +
      '% · 1h ' +
      (v.h1 >= 0 ? '+' : '') +
      (v.h1 != null ? Number(v.h1).toFixed(1) : '—') +
      '% · 6h ' +
      (v.h6 >= 0 ? '+' : '') +
      (v.h6 != null ? Number(v.h6).toFixed(1) : '—') +
      '% · 24h ' +
      (v.h24 >= 0 ? '+' : '') +
      (v.h24 != null ? Number(v.h24).toFixed(1) : '—') +
      '%</div></div>' +
      (v.dexUrl
        ? '<a href="' +
          esc(v.dexUrl) +
          '" target="_blank" rel="noopener" class="vd-dex">DexScreener</a>'
        : '') +
      '</div>' +
      '<div class="vd-grid">' +
      (v.horizons || []).map(card).join('') +
      '</div>';
  }

  async function load() {
    if (busy) return;
    busy = true;
    const st = $('vd-status');
    try {
      const j = await api('/verdict' + (selected ? '?ca=' + encodeURIComponent(selected) : ''));
      fillSelect(j.coins || []);
      render(j);
      if (st) st.textContent = j.verdict ? j.verdict.name + ' · from saved list' : (j.coins || []).length + ' saved coins';
      if (j.error && st) st.textContent = j.error;
    } catch (e) {
      if (st) st.textContent = String(e.message || e);
    }
    busy = false;
  }

  function hideOthers() {
    try {
      window.showBreakoutMemes(false);
    } catch (e) {}
    try {
      window.showHunter(false);
    } catch (e) {}
    ['tf-panels', 'trend-panel', 'struct-panel', 'macro-panel', 'signal-panel', 'memegate-panel', 'coin-panel', 'antifomo-panel'].forEach(
      function (id) {
        const el = $(id);
        if (!el) return;
        el.style.display = 'none';
        el.classList.remove('on');
        if (id === 'tf-panels') el.classList.add('hidden');
      }
    );
  }

  function showVerdict(on) {
    const p = $('verdict-panel');
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      load();
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        const onp = $('verdict-panel');
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

  window.showVerdict = showVerdict;

  document.addEventListener('change', function (ev) {
    if (!ev.target || ev.target.id !== 'vd-ca') return;
    selected = ev.target.value || '';
    load();
  });

  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf !== 'verdict') showVerdict(false);
      }, 0);
    });
  }
})();
