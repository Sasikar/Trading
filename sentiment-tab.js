/* Sentiment tab — CoinGecko community + Binance listings. Not X posts. */
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
  let selected = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      if (c === '&') return '&' + 'amp;';
      if (c === '<') return '&' + 'lt;';
      if (c === '>') return '&' + 'gt;';
      return '&' + 'quot;';
    });
  }
  function fillSelect(sel, rows, label) {
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML =
      '<option value="">' +
      esc(label) +
      '</option>' +
      (rows || [])
        .map(function (r) {
          return (
            '<option value="' +
            esc(r.ca) +
            '"' +
            (selected && r.ca.toLowerCase() === selected.toLowerCase() ? ' selected' : '') +
            '>' +
            esc(r.name || r.ca.slice(0, 6)) +
            '</option>'
          );
        })
        .join('');
    if (cur && !selected) sel.value = cur;
  }
  function ago(ms) {
    const n = Number(ms);
    if (!n) return '';
    const s = Math.round((Date.now() - n) / 1000);
    if (s < 60) return s + 's ago';
    const m = Math.round(s / 60);
    if (m < 60) return m + 'm ago';
    return Math.round(m / 60) + 'h ago';
  }

  function paint(j) {
    const box = $('st-board');
    const stEl = $('st-status');
    fillSelect($('st-saved'), j.saved, 'Saved CAs — pick one');
    fillSelect($('st-hunter'), j.hunter, 'Hunter CAs — pick one');
    if (stEl) {
      stEl.textContent =
        (j.saved || []).length +
        ' saved · ' +
        (j.hunter || []).length +
        ' hunter' +
        (j.report && j.report.cached ? ' · cached' : '') +
        (j.report && j.report.at ? ' · ' + ago(j.report.at) : '');
    }
    if (j.error) {
      if (box)
        box.innerHTML =
          '<div class="st-find">' + esc(j.error) + '</div><div class="st-note">CoinGecko 429 = wait and tap Refresh. We do not invent a score.</div>';
      return;
    }
    const r = j.report;
    if (!r) {
      if (box)
        box.innerHTML =
          '<div class="st-note">Pick a saved CA or a hunter CA. On-demand from CoinGecko + Binance listings. X tweet sentiment is not on the free stack.</div>';
      return;
    }
    const vote =
      r.votesUp != null
        ? '<div class="st-vote"><b style="color:' +
          (r.votesUp >= 55 ? '#62e3a0' : r.votesUp <= 45 ? '#ff6f7c' : '#e6c878') +
          '">' +
          Math.round(r.votesUp) +
          '% up</b><span>CoinGecko community · not tweets</span></div>'
        : '<div class="st-vote"><b style="color:#8491a1">No votes</b><span>' +
          (r.geckoFound ? 'On CoinGecko, empty community poll' : 'Not on CoinGecko') +
          '</span></div>';
    const findings =
      '<div class="st-h">FINDINGS</div>' +
      '<ul class="st-ul">' +
      (r.findings || [])
        .map(function (f) {
          return '<li>' + esc(f) + '</li>';
        })
        .join('') +
      '</ul>';
    const cex =
      '<div class="st-h">CEX NOW</div>' +
      (r.cex && r.cex.length
        ? r.cex
            .map(function (x) {
              return '<div class="st-row"><b>' + esc(x.name) + '</b><span>' + esc(x.pair) + '</span></div>';
            })
            .join('')
        : '<div class="st-note">None on CoinGecko ticker map.</div>');
    const up =
      '<div class="st-h">UPCOMING / BINANCE DESK</div>' +
      (r.upcoming && r.upcoming.length
        ? r.upcoming
            .map(function (a) {
              return (
                '<a class="st-row" href="' +
                esc(a.url) +
                '" target="_blank" rel="noopener">' +
                '<b>Binance</b><span>' +
                esc(a.title) +
                '</span></a>'
              );
            })
            .join('')
        : '<div class="st-note">No Binance New Listing title matched this ticker in the latest 20 posts.</div>');
    const meta = [
      r.symbol ? 'sym ' + r.symbol : '',
      r.twitter ? '@' + r.twitter + (r.twitterFollowers ? ' · ' + r.twitterFollowers.toLocaleString() + ' fol' : '') : '',
      r.categories && r.categories.length ? r.categories.join(' · ') : ''
    ]
      .filter(Boolean)
      .join(' · ');
    box.innerHTML =
      '<div class="st-head"><div class="st-name">' +
      esc(r.name) +
      (r.geckoUrl
        ? ' <a href="' + esc(r.geckoUrl) + '" target="_blank" rel="noopener">Gecko</a>'
        : '') +
      '</div><div class="st-meta">' +
      esc(meta || r.ca) +
      '</div></div>' +
      vote +
      findings +
      cex +
      up +
      '<div class="st-note">' +
      esc(r.source) +
      (r.fetchError ? ' · ' + r.fetchError : '') +
      '</div>';
  }

  async function load(force) {
    const box = $('st-board');
    const stEl = $('st-status');
    try {
      if (stEl) stEl.textContent = selected ? 'Fetching CoinGecko + Binance…' : 'Loading lists…';
      const q = selected
        ? '/sentiment?ca=' + encodeURIComponent(selected) + (force ? '&force=1' : '')
        : '/sentiment';
      const r = await fetch(apiBase() + q, { cache: 'no-store' });
      const j = await r.json().catch(function () {
        return {};
      });
      if (!r.ok) j.error = j.error || 'HTTP ' + r.status;
      paint(j);
    } catch (e) {
      if (stEl) stEl.textContent = 'load failed';
      if (box) box.innerHTML = '<div class="st-find">' + esc(e && e.message ? e.message : e) + '</div>';
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
      'failures-panel',
      'inmemory-panel',
      'verdict-panel'
    ].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
    ['showBreakoutMemes', 'showHunter', 'showHolders', 'showFailures', 'showInMemory', 'showVerdict'].forEach(
      function (fn) {
        try {
          window[fn](false);
        } catch (e) {}
      }
    );
  }

  function showSentiment(on) {
    const p = $('sentiment-panel');
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      load(false);
    } else if (p) {
      p.style.display = 'none';
      p.classList.remove('on');
    }
  }

  window.showSentiment = showSentiment;
  window.refreshSentimentTab = function () {
    return load(true);
  };

  function bind() {
    const saved = $('st-saved');
    const hunter = $('st-hunter');
    if (saved)
      saved.onchange = function () {
        selected = saved.value || '';
        if (hunter) hunter.value = '';
        load(false);
      };
    if (hunter)
      hunter.onchange = function () {
        selected = hunter.value || '';
        if (saved) saved.value = '';
        load(false);
      };
  }

  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf !== 'sentiment') showSentiment(false);
      }, 0);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
