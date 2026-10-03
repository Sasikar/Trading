/* Health topics — one saved keyword list per tab. */
(function () {
  var KEY = 'hl_words_v1';
  var TOMB = 'hl_words_tomb_v1';
  var PATH = 'data/health-words.json';
  var GH = 'https://api.github.com/repos/Sasikar/Trading/contents/' + PATH;
  var TABS = [
    ['heart', 'Heart'],
    ['kidney', 'Kidney'],
    ['liver', 'Liver'],
    ['gut', 'Gut'],
    ['digestion', 'Digestion'],
    ['foods', 'Foods'],
    ['sugars', 'Sugars'],
    ['refined', 'Refined'],
    ['sleep', 'Sleep'],
    ['water', 'Water']
  ];
  var tabs = {};
  var current = 'heart';
  var asking = '';
  var syncing = false;
  TABS.forEach(function (t) { tabs[t[0]] = []; });

  function $(id) { return document.getElementById(id); }
  function token() {
    try {
      return localStorage.getItem('trading_github_token') || localStorage.getItem('trading_tax_github_token') || '';
    } catch (e) { return ''; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      if (c === '&') return '&';
      if (c === '<') return '<';
      if (c === '>') return '>';
      return '"';
    });
  }
  function tombs() {
    try {
      var o = JSON.parse(localStorage.getItem(TOMB) || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch (e) { return {}; }
  }
  function markTomb(id, on) {
    var map = tombs();
    if (on) map[id] = Date.now();
    else delete map[id];
    try { localStorage.setItem(TOMB, JSON.stringify(map)); } catch (e) {}
  }
  function blank() {
    var o = {};
    TABS.forEach(function (t) { o[t[0]] = []; });
    return o;
  }
  function cleanList(list, dead) {
    var map = {};
    (list || []).forEach(function (it) {
      if (!it || !it.id || !it.text || dead[it.id]) return;
      var prev = map[it.id];
      var row = { id: String(it.id), text: String(it.text).replace(/\s+/g, ' ').trim().slice(0, 80), t: it.t || 0 };
      if (!row.text) return;
      if (!prev || row.t >= (prev.t || 0)) map[row.id] = row;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
  }
  function loadLocal() {
    tabs = blank();
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (saved && saved.tabs) tabs = saved.tabs;
      if (saved && saved.current && tabs[saved.current]) current = saved.current;
    } catch (e) {}
    var dead = tombs();
    var next = blank();
    TABS.forEach(function (t) { next[t[0]] = cleanList(tabs[t[0]], dead); });
    tabs = next;
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify({ current: current, tabs: tabs })); } catch (e) {}
  }
  function setStatus(text) {
    var el = $('hl-status');
    if (el) el.textContent = text || '';
  }
  function merge(remote) {
    var dead = tombs();
    var src = (remote && remote.tabs) || {};
    var next = blank();
    TABS.forEach(function (t) {
      next[t[0]] = cleanList((tabs[t[0]] || []).concat(src[t[0]] || []), dead);
    });
    tabs = next;
  }
  function decodeContent(gj) {
    return JSON.parse(decodeURIComponent(escape(atob(String(gj.content || '').replace(/\s/g, '')))));
  }
  function paint() {
    var root = $('hl-app');
    if (!root) return;
    var input = $('hl-input');
    var draft = input ? input.value : '';
    var list = tabs[current] || [];
    var rows = list.map(function (it) {
      if (asking === it.id) {
        return '<li class="hl-row ask"><span>' + esc(it.text) + '</span><span class="hl-ask">Delete this?<button type="button" data-act="yes" data-id="' + esc(it.id) + '">Delete</button><button type="button" data-act="no">Keep</button></span></li>';
      }
      return '<li class="hl-row"><span>' + esc(it.text) + '</span><button type="button" class="hl-x" data-act="ask" data-id="' + esc(it.id) + '" aria-label="Delete">×</button></li>';
    }).join('');
    root.innerHTML =
      '<div class="hl-tabs">' + TABS.map(function (t) {
        var n = (tabs[t[0]] || []).length;
        return '<button type="button" class="hl-tab' + (t[0] === current ? ' on' : '') + '" data-tab="' + t[0] + '">' + esc(t[1]) + (n ? '<i>' + n + '</i>' : '') + '</button>';
      }).join('') + '</div>' +
      '<form id="hl-form" class="hl-add"><input id="hl-input" maxlength="80" placeholder="Add a keyword" value="' + esc(draft) + '" autocomplete="off"><button type="submit">Add</button><span id="hl-status"></span></form>' +
      (rows ? '<ul class="hl-list">' + rows + '</ul>' : '<p class="hl-empty">Nothing saved in this topic yet.</p>');
    var box = $('hl-input');
    if (box && draft) {
      box.focus();
      box.setSelectionRange(draft.length, draft.length);
    }
  }
  async function persist() {
    saveLocal();
    if (syncing) return;
    syncing = true;
    try {
      try {
        var pub = await fetch(PATH + '?t=' + Date.now(), { cache: 'no-store' });
        if (pub.ok) {
          merge(await pub.json());
          saveLocal();
          paint();
        }
      } catch (e) {}
      var tok = token();
      if (!tok) { setStatus('Saved on this phone'); return; }
      var sha = null;
      var gr = await fetch(GH + '?ref=master', {
        headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' },
        cache: 'no-store'
      });
      if (gr.ok) {
        var gj = await gr.json();
        sha = gj.sha;
        try { merge(decodeContent(gj)); saveLocal(); paint(); } catch (e) {}
      } else if (gr.status !== 404) {
        setStatus('Saved on this phone');
        return;
      }
      var body = {
        message: 'Health words',
        content: btoa(unescape(encodeURIComponent(JSON.stringify({ updated: new Date().toISOString(), tabs: tabs }, null, 2)))),
        branch: 'master'
      };
      if (sha) body.sha = sha;
      var pr = await fetch(GH, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      setStatus(pr.ok ? 'Saved on GitHub' : 'Saved on this phone');
    } catch (e) {
      setStatus('Saved on this phone');
    } finally {
      syncing = false;
    }
  }
  function add(raw) {
    var text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!text) return;
    var list = tabs[current] || (tabs[current] = []);
    if (list.some(function (it) { return it.text.toLowerCase() === text.toLowerCase(); })) return;
    list.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: text, t: Date.now() });
    saveLocal();
    paint();
    persist();
  }
  function remove(id) {
    markTomb(id, true);
    tabs[current] = (tabs[current] || []).filter(function (it) { return it.id !== id; });
    asking = '';
    saveLocal();
    paint();
    persist();
  }

  if (!document.getElementById('hl-style')) {
    var css = document.createElement('style');
    css.id = 'hl-style';
    css.textContent = '#hl-app{color:#f4f7fb}.hl-tabs{display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none}.hl-tabs::-webkit-scrollbar{display:none}.hl-tab{flex:0 0 auto;border:0;border-radius:999px;padding:10px 14px;background:#17202b;color:#c5d0dc;font-weight:800;font-size:14px;cursor:pointer}.hl-tab.on{background:#e6c878;color:#1a1406}.hl-tab i{margin-left:6px;font-style:normal;font-size:11px;opacity:.75}.hl-add{display:flex;gap:8px;align-items:center;margin:12px 0}.hl-add input{flex:1;min-width:0;padding:14px;border:0;border-radius:14px;background:#141c27;color:#f4f7fb;font-size:16px;font-weight:700}.hl-add button{border:0;border-radius:14px;padding:14px 16px;background:#e6c878;color:#1a1406;font-weight:900;cursor:pointer}.hl-add span{color:#8b95a5;font-size:12px;font-weight:700}.hl-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.hl-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 12px 12px 14px;border-radius:16px;background:#10161f}.hl-row span{font-weight:750;line-height:1.3}.hl-x{width:32px;height:32px;border:0;border-radius:50%;background:#2a1a22;color:#ff8b98;font-size:18px;line-height:1;cursor:pointer;flex:0 0 auto}.hl-ask{display:flex;gap:6px;align-items:center;color:#ffb4be;font-size:12px;font-weight:800}.hl-ask button{border:0;border-radius:999px;padding:7px 10px;font-weight:800;cursor:pointer}.hl-ask button[data-act=yes]{background:#ff6f7c;color:#1a0c10}.hl-ask button[data-act=no]{background:#243044;color:#f4f7fb}.hl-empty{color:#8b95a5;font-weight:700}';
    document.head.appendChild(css);
  }
  loadLocal();
  paint();
  var root = $('hl-app');
  if (root) {
    root.addEventListener('click', function (ev) {
      var tab = ev.target && ev.target.closest && ev.target.closest('[data-tab]');
      if (tab) {
        current = tab.getAttribute('data-tab') || current;
        asking = '';
        saveLocal();
        paint();
        return;
      }
      var b = ev.target && ev.target.closest && ev.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'ask') { asking = b.getAttribute('data-id') || ''; paint(); }
      if (act === 'no') { asking = ''; paint(); }
      if (act === 'yes') remove(b.getAttribute('data-id'));
    });
    root.addEventListener('submit', function (ev) {
      if (!ev.target || ev.target.id !== 'hl-form') return;
      ev.preventDefault();
      var input = $('hl-input');
      add(input && input.value);
    });
  }
  fetch(PATH + '?t=' + Date.now(), { cache: 'no-store' }).then(function (res) {
    return res.ok ? res.json() : null;
  }).then(function (data) {
    if (!data) return;
    merge(data);
    saveLocal();
    paint();
  }).catch(function () {});
})();
