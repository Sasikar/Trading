/* Health topics — wrapped tabs you can add, rename, and delete. Words stay saved. */
(function () {
  var KEY = 'hl_words_v1';
  var TOMB = 'hl_words_tomb_v1';
  var PATH = 'data/health-words.json';
  var GH = 'https://api.github.com/repos/Sasikar/Trading/contents/' + PATH;
  var DEFAULTS = [
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
  var topics = [];
  var tabs = {};
  var current = 'heart';
  var asking = '';
  var editingWord = '';
  var topicMode = '';
  var syncing = false;

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
  function nid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
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
  function cleanList(list, dead) {
    var map = {};
    (list || []).forEach(function (it) {
      if (!it || !it.id || !it.text || dead[it.id]) return;
      var row = { id: String(it.id), text: String(it.text).replace(/\s+/g, ' ').trim().slice(0, 80), t: it.t || 0 };
      if (!row.text) return;
      var prev = map[row.id];
      if (!prev || row.t >= (prev.t || 0)) map[row.id] = row;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
  }
  function defaults() {
    return DEFAULTS.map(function (t) { return { id: t[0], name: t[1] }; });
  }
  function applyTopics(list, words, dead) {
    var map = {};
    defaults().concat(list || []).forEach(function (topic) {
      if (!topic || !topic.id || dead['topic:' + topic.id]) return;
      var name = String(topic.name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
      if (!name) return;
      map[topic.id] = { id: String(topic.id), name: name };
    });
    topics = Object.keys(map).map(function (k) { return map[k]; });
    if (!topics.length) topics = defaults().filter(function (t) { return !dead['topic:' + t.id]; });
    var next = {};
    topics.forEach(function (topic) {
      next[topic.id] = cleanList((words[topic.id] || []).concat((tabs[topic.id] || [])), dead);
    });
    tabs = next;
    if (!topics.some(function (t) { return t.id === current; })) current = topics[0] ? topics[0].id : '';
  }
  function loadLocal() {
    tabs = {};
    topics = defaults();
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (saved && saved.current) current = saved.current;
      if (saved && saved.tabs) tabs = saved.tabs;
      applyTopics((saved && saved.topics) || [], tabs, tombs());
    } catch (e) {
      applyTopics([], {}, tombs());
    }
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify({ current: current, topics: topics, tabs: tabs })); } catch (e) {}
  }
  function setStatus(text) {
    var el = $('hl-status');
    if (el) el.textContent = text || '';
  }
  function merge(remote) {
    var dead = tombs();
    var words = {};
    topics.forEach(function (topic) { words[topic.id] = tabs[topic.id] || []; });
    var src = (remote && remote.tabs) || {};
    Object.keys(src).forEach(function (id) { words[id] = (words[id] || []).concat(src[id] || []); });
    applyTopics(topics.concat((remote && remote.topics) || []), words, dead);
  }
  function decodeContent(gj) {
    return JSON.parse(decodeURIComponent(escape(atob(String(gj.content || '').replace(/\s/g, '')))));
  }
  function topicById(id) {
    for (var i = 0; i < topics.length; i++) if (topics[i].id === id) return topics[i];
    return null;
  }
  function paint() {
    var root = $('hl-app');
    if (!root) return;
    var input = $('hl-input');
    var draft = input ? input.value : '';
    var topic = topicById(current);
    var list = (topic && tabs[topic.id]) || [];
    var chips = topics.map(function (t) {
      var n = (tabs[t.id] || []).length;
      return '<button type="button" class="hl-tab' + (t.id === current ? ' on' : '') + '" data-tab="' + esc(t.id) + '">' + esc(t.name) + (n ? '<i>' + n + '</i>' : '') + '</button>';
    }).join('');
    var menu = '';
    if (topicMode === 'add') {
      menu = '<form id="hl-topic" class="hl-topic"><input id="hl-topic-name" maxlength="24" placeholder="New topic" autocomplete="off"><button type="submit">Add</button><button type="button" data-act="topic-cancel">Cancel</button></form>';
    } else if (topic && topicMode === 'rename') {
      menu = '<form id="hl-topic" class="hl-topic"><input id="hl-topic-name" maxlength="24" value="' + esc(topic.name) + '" autocomplete="off"><button type="submit">Save</button><button type="button" data-act="topic-cancel">Cancel</button></form>';
    } else if (topic && topicMode === 'drop') {
      menu = '<div class="hl-ask topic">Delete ' + esc(topic.name) + ' and its words?<button type="button" data-act="topic-yes">Delete</button><button type="button" data-act="topic-cancel">Keep</button></div>';
    } else if (topic) {
      menu = '<div class="hl-tools"><b>' + esc(topic.name) + '</b><button type="button" data-act="rename">Edit</button><button type="button" data-act="drop">Delete</button></div>';
    }
    var rows = list.map(function (it) {
      if (editingWord === it.id) {
        return '<li class="hl-row"><form class="hl-edit" data-id="' + esc(it.id) + '"><input maxlength="80" value="' + esc(it.text) + '" aria-label="Edit keyword"><button type="submit">Save</button><button type="button" data-act="word-cancel">Cancel</button></form></li>';
      }
      if (asking === it.id) {
        return '<li class="hl-row ask"><span>' + esc(it.text) + '</span><span class="hl-ask">Delete this?<button type="button" data-act="yes" data-id="' + esc(it.id) + '">Delete</button><button type="button" data-act="no">Keep</button></span></li>';
      }
      return '<li class="hl-row"><span>' + esc(it.text) + '</span><span class="hl-actions"><button type="button" class="hl-pen" data-act="word-edit" data-id="' + esc(it.id) + '" aria-label="Edit">Edit</button><button type="button" class="hl-x" data-act="ask" data-id="' + esc(it.id) + '" aria-label="Delete">×</button></span></li>';
    }).join('');
    root.innerHTML =
      '<div class="hl-tabs">' + chips + '<button type="button" class="hl-tab add" data-act="add-topic">+ Topic</button></div>' +
      menu +
      '<form id="hl-form" class="hl-add"><input id="hl-input" maxlength="80" placeholder="Add a keyword" value="' + esc(draft) + '" autocomplete="off"><button type="submit">Add</button><span id="hl-status"></span></form>' +
      (rows ? '<ul class="hl-list">' + rows + '</ul>' : '<p class="hl-empty">Nothing saved in this topic yet.</p>');
    var focus = topicMode ? $('hl-topic-name') : (draft ? $('hl-input') : null);
    if (focus) {
      focus.focus();
      var n = focus.value.length;
      focus.setSelectionRange(n, n);
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
        content: btoa(unescape(encodeURIComponent(JSON.stringify({ updated: new Date().toISOString(), topics: topics, tabs: tabs }, null, 2)))),
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
    if (!text || !current) return;
    var list = tabs[current] || (tabs[current] = []);
    if (list.some(function (it) { return it.text.toLowerCase() === text.toLowerCase(); })) return;
    list.unshift({ id: nid(), text: text, t: Date.now() });
    saveLocal();
    paint();
    persist();
  }
  function remove(id) {
    markTomb(id, true);
    tabs[current] = (tabs[current] || []).filter(function (it) { return it.id !== id; });
    asking = '';
    editingWord = '';
    saveLocal();
    paint();
    persist();
  }
  function saveWord(id, raw) {
    var text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    var list = tabs[current] || [];
    list.forEach(function (it) {
      if (it.id === id && text) { it.text = text; it.t = Date.now(); }
    });
    editingWord = '';
    saveLocal();
    paint();
    persist();
  }
  function addTopic(raw) {
    var name = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!name) return;
    if (topics.some(function (t) { return t.name.toLowerCase() === name.toLowerCase(); })) { topicMode = ''; paint(); return; }
    var id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'topic';
    if (topics.some(function (t) { return t.id === id; })) id = id + '-' + nid().slice(-4);
    markTomb('topic:' + id, false);
    topics.push({ id: id, name: name });
    tabs[id] = [];
    current = id;
    topicMode = '';
    saveLocal();
    paint();
    persist();
  }
  function renameTopic(raw) {
    var topic = topicById(current);
    var name = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (topic && name) topic.name = name;
    topicMode = '';
    saveLocal();
    paint();
    persist();
  }
  function deleteTopic() {
    var topic = topicById(current);
    if (!topic) return;
    markTomb('topic:' + topic.id, true);
    (tabs[topic.id] || []).forEach(function (it) { markTomb(it.id, true); });
    delete tabs[topic.id];
    topics = topics.filter(function (t) { return t.id !== topic.id; });
    current = topics[0] ? topics[0].id : '';
    topicMode = '';
    asking = '';
    saveLocal();
    paint();
    persist();
  }

  if (!document.getElementById('hl-style')) {
    var css = document.createElement('style');
    css.id = 'hl-style';
    css.textContent = '#hl-app{color:#f4f7fb;overflow:hidden}.hl-tabs{display:flex;flex-wrap:wrap;gap:8px;overflow:visible}.hl-tab{flex:0 1 auto;border:0;border-radius:999px;padding:9px 12px;background:#17202b;color:#c5d0dc;font-weight:800;font-size:14px;cursor:pointer;white-space:nowrap}.hl-tab.on{background:#e6c878;color:#1a1406}.hl-tab.add{background:#243044;color:#f4f7fb}.hl-tab i{margin-left:6px;font-style:normal;font-size:11px;opacity:.75}.hl-tools,.hl-topic{display:flex;gap:8px;align-items:center;margin-top:12px}.hl-tools b{flex:1;font-size:16px}.hl-tools button,.hl-topic button,.hl-edit button{border:0;border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer;background:#243044;color:#f4f7fb}.hl-tools button[data-act=drop]{background:#2a1a22;color:#ff8b98}.hl-topic input,.hl-edit input{flex:1;min-width:0;padding:10px 12px;border:0;border-radius:12px;background:#141c27;color:#f4f7fb;font-size:16px;font-weight:700}.hl-topic button[type=submit],.hl-edit button[type=submit]{background:#e6c878;color:#1a1406}.hl-add{display:flex;gap:8px;align-items:center;margin:12px 0}.hl-add input{flex:1;min-width:0;padding:14px;border:0;border-radius:14px;background:#141c27;color:#f4f7fb;font-size:16px;font-weight:700}.hl-add button{border:0;border-radius:14px;padding:14px 16px;background:#e6c878;color:#1a1406;font-weight:900;cursor:pointer}.hl-add span{color:#8b95a5;font-size:12px;font-weight:700}.hl-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.hl-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 12px 12px 14px;border-radius:16px;background:#10161f}.hl-row>span:first-child{font-weight:750;line-height:1.3}.hl-actions{display:flex;gap:6px;align-items:center;flex:0 0 auto}.hl-pen{border:0;border-radius:999px;padding:7px 10px;background:#243044;color:#d5dde8;font-weight:800;cursor:pointer}.hl-x{width:32px;height:32px;border:0;border-radius:50%;background:#2a1a22;color:#ff8b98;font-size:18px;line-height:1;cursor:pointer}.hl-edit{display:flex;gap:8px;align-items:center;width:100%}.hl-ask{display:flex;gap:6px;align-items:center;flex-wrap:wrap;color:#ffb4be;font-size:13px;font-weight:800}.hl-ask.topic{margin-top:12px}.hl-ask button{border:0;border-radius:999px;padding:7px 10px;font-weight:800;cursor:pointer}.hl-ask button[data-act=yes],.hl-ask button[data-act=topic-yes]{background:#ff6f7c;color:#1a0c10}.hl-ask button[data-act=no],.hl-ask button[data-act=topic-cancel]{background:#243044;color:#f4f7fb}.hl-empty{color:#8b95a5;font-weight:700}';
    document.head.appendChild(css);
  }
  loadLocal();
  paint();
  var root = $('hl-app');
  if (root) {
    root.addEventListener('click', function (ev) {
      var tab = ev.target && ev.target.closest && ev.target.closest('[data-tab]');
      if (tab && !(ev.target.closest && ev.target.closest('[data-act]'))) {
        current = tab.getAttribute('data-tab') || current;
        asking = '';
        editingWord = '';
        topicMode = '';
        saveLocal();
        paint();
        return;
      }
      var b = ev.target && ev.target.closest && ev.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'ask') { asking = b.getAttribute('data-id') || ''; editingWord = ''; paint(); }
      if (act === 'no' || act === 'word-cancel' || act === 'topic-cancel') { asking = ''; editingWord = ''; topicMode = ''; paint(); }
      if (act === 'yes') remove(b.getAttribute('data-id'));
      if (act === 'word-edit') { editingWord = b.getAttribute('data-id') || ''; asking = ''; paint(); }
      if (act === 'add-topic') { topicMode = 'add'; paint(); }
      if (act === 'rename') { topicMode = 'rename'; paint(); }
      if (act === 'drop') { topicMode = 'drop'; paint(); }
      if (act === 'topic-yes') deleteTopic();
    });
    root.addEventListener('submit', function (ev) {
      if (!ev.target) return;
      if (ev.target.id === 'hl-form') {
        ev.preventDefault();
        var input = $('hl-input');
        add(input && input.value);
      }
      if (ev.target.id === 'hl-topic') {
        ev.preventDefault();
        var name = $('hl-topic-name');
        if (topicMode === 'rename') renameTopic(name && name.value);
        else addTopic(name && name.value);
      }
      if (ev.target.classList && ev.target.classList.contains('hl-edit')) {
        ev.preventDefault();
        var field = ev.target.querySelector('input');
        saveWord(ev.target.getAttribute('data-id'), field && field.value);
      }
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
