/* Strategy — Fund / Rotation / Wallet notes + history. */
(function () {
  const TABS = [
    { id: 'fund', lab: 'Fund Strategy' },
    { id: 'rotation', lab: 'Rotation Strategy' },
    { id: 'wallet', lab: 'Wallet Strategy' }
  ];
  const LS = 'strategy_notes_v1';
  const LS_TAB = 'strategy_inner';
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
  let inner = 'fund';
  try {
    inner = localStorage.getItem(LS_TAB) || 'fund';
  } catch (e) {}
  if (inner !== 'fund' && inner !== 'rotation' && inner !== 'wallet') inner = 'fund';
  let tabs = emptyTabs();
  let draftTimer = null;
  let busy = false;
  function emptyTabs() {
    return {
      fund: { text: '', history: [] },
      rotation: { text: '', history: [] },
      wallet: { text: '', history: [] }
    };
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      if (c === '&') return '&' + 'amp;';
      if (c === '<') return '&' + 'lt;';
      if (c === '>') return '&' + 'gt;';
      return '&' + 'quot;';
    });
  }
  function readLocal() {
    try {
      const j = JSON.parse(localStorage.getItem(LS) || '{}') || {};
      const o = emptyTabs();
      TABS.forEach(function (t) {
        if (j[t.id]) o[t.id] = { text: String(j[t.id].text || ''), history: Array.isArray(j[t.id].history) ? j[t.id].history : [] };
      });
      return o;
    } catch (e) {
      return emptyTabs();
    }
  }
  function writeLocal(all) {
    try {
      localStorage.setItem(LS, JSON.stringify(all));
    } catch (e) {}
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
      'showPitfalls'
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
      'pitfalls-panel'
    ].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
  }
  function when(t) {
    const d = new Date(+t || 0);
    if (!+t) return '—';
    const pad = (n) => (n < 10 ? '0' : '') + n;
    return pad(d.getDate()) + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] + ' ' + d.getFullYear() + ' · ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function paintChips() {
    document.querySelectorAll('.stgy-tab').forEach(function (b) {
      const on = b.getAttribute('data-stgy') === inner;
      b.style.background = on ? '#1a9b6c' : '#121a24';
      b.style.color = on ? '#fff' : '#c5d0dc';
    });
  }
  function paint() {
    const box = $('stgy-text');
    const hist = $('stgy-hist');
    const st = $('stgy-status');
    const cur = tabs[inner] || { text: '', history: [] };
    if (box && document.activeElement !== box) box.value = cur.text || '';
    else if (box && !box.value && cur.text) box.value = cur.text;
    const rows = (cur.history || []).slice();
    if (hist)
      hist.innerHTML = rows.length
        ? rows
            .map(function (h, i) {
              const preview = String(h.text || '').replace(/\s+/g, ' ').slice(0, 140);
              return (
                '<div style="padding:12px;border-radius:12px;border:1px solid #243041;background:#0b121a">' +
                '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
                '<div style="font-size:11px;font-weight:800;color:#8491a1">' +
                esc(when(h.at)) +
                (i === 0 ? ' · latest' : '') +
                '</div>' +
                '<div style="display:flex;gap:8px">' +
                '<button type="button" class="stgy-restore" data-at="' +
                esc(h.at) +
                '" style="padding:5px 10px;border-radius:8px;border:0;background:#243041;color:#e8eef6;font-weight:800;font-size:11px;cursor:pointer">Restore</button>' +
                '<button type="button" class="stgy-drop" data-at="' +
                esc(h.at) +
                '" style="padding:5px 10px;border-radius:8px;border:0;background:#2a1a1e;color:#ff6f7c;font-weight:800;font-size:11px;cursor:pointer">Delete</button>' +
                '</div></div>' +
                '<div style="margin-top:6px;font-size:12px;color:#c5d0dc;white-space:pre-wrap">' +
                esc(preview) +
                (String(h.text || '').length > 140 ? '…' : '') +
                '</div></div>'
              );
            })
            .join('')
        : '<div style="color:#8491a1;font-size:12px">No saved versions yet. Hit Save version.</div>';
    if (hist) {
      hist.querySelectorAll('.stgy-restore').forEach(function (b) {
        b.addEventListener('click', function () {
          post({ tab: inner, restoreAt: +b.getAttribute('data-at') });
        });
      });
      hist.querySelectorAll('.stgy-drop').forEach(function (b) {
        b.addEventListener('click', function () {
          post({ tab: inner, dropAt: +b.getAttribute('data-at') });
        });
      });
    }
    if (st) st.textContent = (cur.history || []).length + ' versions · ' + inner;
    paintChips();
  }
  function applyRemote(all) {
    if (!all) return;
    tabs = emptyTabs();
    TABS.forEach(function (t) {
      if (all[t.id]) tabs[t.id] = { text: String(all[t.id].text || ''), history: Array.isArray(all[t.id].history) ? all[t.id].history : [] };
    });
    writeLocal(tabs);
    paint();
  }
  async function post(body) {
    const box = $('stgy-text');
    if (box && body && body.text == null && !body.restoreAt && !body.dropAt) body.text = box.value;
    try {
      const j = await api('/strategy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      applyRemote(j.tabs);
      return;
    } catch (e) {}
    const local = tabs;
    const cur = local[body.tab] || { text: '', history: [] };
    if (body.dropAt) cur.history = (cur.history || []).filter((h) => +h.at !== +body.dropAt);
    else if (body.restoreAt) {
      const hit = (cur.history || []).find((h) => +h.at === +body.restoreAt);
      if (hit) cur.text = hit.text;
    } else {
      const next = String(body.text != null ? body.text : cur.text);
      if (body.snapshot && next.trim() && next !== ((cur.history[0] && cur.history[0].text) || '')) {
        cur.history = [{ at: Date.now(), text: next }].concat(cur.history || []).slice(0, 80);
      }
      cur.text = next;
    }
    local[body.tab] = cur;
    tabs = local;
    writeLocal(tabs);
    paint();
  }
  async function load() {
    if (busy) return;
    busy = true;
    tabs = readLocal();
    paint();
    try {
      const j = await api('/strategy');
      if (j && j.tabs) applyRemote(j.tabs);
    } catch (e) {}
    busy = false;
  }
  function setInner(id) {
    flushDraft();
    inner = id;
    try {
      localStorage.setItem(LS_TAB, inner);
    } catch (e) {}
    const box = $('stgy-text');
    if (box) box.value = (tabs[inner] && tabs[inner].text) || '';
    paint();
  }
  function flushDraft() {
    const box = $('stgy-text');
    if (!box) return;
    const t = box.value;
    if (!tabs[inner]) tabs[inner] = { text: '', history: [] };
    tabs[inner].text = t;
    writeLocal(tabs);
    post({ tab: inner, text: t, snapshot: false });
  }
  function saveVersion() {
    const box = $('stgy-text');
    const t = box ? box.value : (tabs[inner] && tabs[inner].text) || '';
    post({ tab: inner, text: t, snapshot: true });
    const st = $('stgy-status');
    if (st) st.textContent = 'Saved · ' + inner;
  }
  function showStrategy(on) {
    const p = $('strategy-panel');
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      load();
    } else {
      if (p) {
        p.style.display = 'none';
        p.classList.remove('on');
      }
    }
  }
  window.showStrategy = showStrategy;
  window.setStrategyInner = setInner;
  window.saveStrategyVersion = saveVersion;
  document.addEventListener('input', function (ev) {
    if (!ev.target || ev.target.id !== 'stgy-text') return;
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(flushDraft, 700);
  });
  const tabsBar = document.getElementById('tf-tabs');
  if (tabsBar) {
    tabsBar.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf === 'strategy') showStrategy(true);
        else showStrategy(false);
      }, 0);
    });
  }
})();
