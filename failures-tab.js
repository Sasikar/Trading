/* Failures tab — last hour of real worker errors. Empty = none logged. */
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
  function group(rows) {
    const map = {};
    const order = [];
    (rows || []).forEach(function (x) {
      const key = (x.k || '') + '|' + (x.m || '');
      if (!map[key]) {
        map[key] = { k: x.k, m: x.m, n: 0, first: +x.t, last: +x.t };
        order.push(key);
      }
      map[key].n += 1;
      if (+x.t > map[key].last) map[key].last = +x.t;
      if (+x.t < map[key].first) map[key].first = +x.t;
    });
    return order
      .map(function (k) {
        return map[k];
      })
      .sort(function (a, b) {
        return b.last - a.last;
      });
  }
  function rowHtml(g) {
    return (
      '<div class="fl-row">' +
      '<div class="k">' +
      esc(g.k) +
      (g.n > 1 ? ' ×' + g.n : '') +
      '</div>' +
      '<div class="m">' +
      esc(g.m) +
      '</div>' +
      '<div class="t">' +
      (g.n > 1 ? 'first ' + ago(g.first) + ' · last ' + ago(g.last) : ago(g.last)) +
      '</div></div>'
    );
  }

  async function load() {
    const list = $('fl-list');
    const stEl = $('fl-status');
    try {
      const r = await fetch(apiBase() + '/failures', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const live = j.live || {};
      const hour = j.hour || [];
      const older = j.older || [];
      const counts = j.countsHour || {};
      const chips = Object.keys(counts)
        .sort()
        .map(function (k) {
          return '<span class="fl-chip">' + esc(k) + ' <b>' + counts[k] + '</b></span>';
        })
        .join('');
      if (stEl)
        stEl.textContent =
          (j.nHour || 0) +
          ' in last hour' +
          (j.nOlder ? ' · ' + j.nOlder + ' older (24h)' : '') +
          ' · live ' +
          (live.health || '—');
      const liveBits = [];
      if (live.health) liveBits.push('health ' + live.health);
      if (live.pollMs != null) liveBits.push('last poll ' + Math.round((+live.pollMs || 0) / 60000) + 'm ago');
      if (live.error) liveBits.push(live.error);
      if (live.telegramError) liveBits.push('telegram ' + live.telegramError);
      if (live.hunterErr) liveBits.push('hunter ' + live.hunterErr);
      if (live.holdersErr) liveBits.push('holders ' + live.holdersErr);
      if (live.backfillLast && live.backfillLast.error)
        liveBits.push('gecko ' + (live.backfillLast.name || '') + ' ' + live.backfillLast.error);
      const liveHtml =
        '<div class="fl-live"><b>Now (not a log row)</b><br>' +
        esc(liveBits.filter(Boolean).join(' · ') || 'no live error fields') +
        '</div>';
      const hourHtml = hour.length
        ? '<div style="font-size:11px;font-weight:900;letter-spacing:.08em;color:#ff8a96">LAST HOUR</div>' +
          (chips ? '<div style="display:flex;flex-wrap:wrap;gap:6px">' + chips + '</div>' : '') +
          group(hour).map(rowHtml).join('')
        : '<div class="fl-row"><div class="m" style="color:#8491a1">No failures logged in the last hour.</div><div class="t">That is real. We do not write an “OK” row.</div></div>';
      const olderHtml = older.length
        ? '<div style="font-size:11px;font-weight:900;letter-spacing:.08em;color:#8491a1;margin-top:8px">OLDER (keep 24h)</div>' +
          group(older).map(rowHtml).join('')
        : '';
      if (list) list.innerHTML = liveHtml + hourHtml + olderHtml;
    } catch (e) {
      if (stEl) stEl.textContent = 'load failed';
      if (list)
        list.innerHTML =
          '<div class="fl-row"><div class="k">ui</div><div class="m">' +
          esc(e && e.message ? e.message : e) +
          '</div></div>';
    }
  }

  function hideOthers() {
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
      'verdict-panel',
      'inmemory-panel',
      'sentiment-panel'
    ].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
    try {
      window.showBreakoutMemes(false);
    } catch (e) {}
    try {
      window.showHunter(false);
    } catch (e) {}
    try {
      window.showHolders(false);
    } catch (e) {}
    try {
      window.showVerdict(false);
    } catch (e) {}
    try {
      window.showInMemory(false);
    } catch (e) {}
    try {
      window.showSentiment(false);
    } catch (e) {}
  }

  function showFailures(on) {
    const p = $('failures-panel');
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      load();
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        const onp = $('failures-panel');
        if (!onp || onp.style.display === 'none') return;
        load();
      }, 30000);
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

  window.showFailures = showFailures;
  window.refreshFailuresTab = function () {
    return load();
  };

  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf !== 'failures') showFailures(false);
      }, 0);
    });
  }
})();
