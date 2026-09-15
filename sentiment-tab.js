/* Sentiment tab — pick a coin, open X Live search. You read it. */
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
  let lock = false;
  let lists = { saved: [], hunter: [] };

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
    const list = rows || [];
    sel.innerHTML =
      '<option value="">' +
      esc(label) +
      '</option>' +
      list
        .map(function (r) {
          return '<option value="' + esc(r.ca) + '">' + esc(r.name || r.ca.slice(0, 6)) + '</option>';
        })
        .join('');
  }
  function xUrlFor(name) {
    const n = String(name || '').replace(/^\$/, '').trim() || 'solana';
    const q = '$' + n + ' OR ' + n + ' solana';
    return 'https://x.com/search?q=' + encodeURIComponent(q) + '&src=typed_query&f=live';
  }
  function nameOf(ca) {
    const k = String(ca || '').toLowerCase();
    const all = (lists.saved || []).concat(lists.hunter || []);
    const hit = all.find(function (r) {
      return String(r.ca).toLowerCase() === k;
    });
    return (hit && hit.name) || ca.slice(0, 8);
  }
  function openX(name) {
    const url = xUrlFor(name);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    try {
      window.open(url, '_blank', 'noopener');
    } catch (e) {}
    return url;
  }
  function paintLink(name) {
    const box = $('st-board');
    if (!box) return;
    const url = xUrlFor(name);
    box.innerHTML =
      '<a id="st-go" href="' +
      esc(url) +
      '" target="_blank" rel="noopener" style="display:block;text-align:center;padding:16px;border-radius:12px;background:#62e3a0;color:#06120b;font-weight:900;text-decoration:none">Open ' +
      esc(name) +
      ' on X</a>' +
      '<div class="st-note">Live search · $' +
      esc(name) +
      ' OR ' +
      esc(name) +
      ' solana · you read it</div>';
  }
  async function loadLists() {
    const stEl = $('st-status');
    try {
      if (stEl) stEl.textContent = 'Loading lists…';
      const res = await fetch(apiBase() + '/sentiment', { cache: 'no-store' });
      const j = await res.json().catch(function () {
        return {};
      });
      lists.saved = j.saved || [];
      lists.hunter = j.hunter || [];
      fillSelect($('st-saved'), lists.saved, 'Saved CAs — pick one');
      fillSelect($('st-hunter'), lists.hunter, 'Hunter CAs — pick one');
      if (stEl) stEl.textContent = lists.saved.length + ' saved · ' + lists.hunter.length + ' hunter';
    } catch (e) {
      if (stEl) stEl.textContent = 'list failed';
    }
  }
  function pick(from, other) {
    if (lock) return;
    selected = from.value || '';
    if (!selected) return;
    const name = nameOf(selected);
    lock = true;
    if (other) other.value = '';
    lock = false;
    paintLink(name);
    openX(name);
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
      loadLists();
    } else if (p) {
      p.style.display = 'none';
      p.classList.remove('on');
    }
  }
  window.showSentiment = showSentiment;
  window.refreshSentimentTab = loadLists;
  function bind() {
    const saved = $('st-saved');
    const hunter = $('st-hunter');
    if (saved)
      saved.onchange = function () {
        pick(saved, hunter);
      };
    if (hunter)
      hunter.onchange = function () {
        pick(hunter, saved);
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
