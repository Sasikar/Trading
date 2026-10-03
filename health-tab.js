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
  var PENCIL = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
  var topics = [];
  var tabs = {};
  var current = 'heart';
  var asking = '';
  var editingWord = '';
  var topicMode = '';
  var arranging = false;

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
      var row = { id: String(it.id), text: String(it.text).replace(/\s+/g, ' ').trim().slice(0, 240), url: it.url ? String(it.url).slice(0, 400) : '', t: it.t || 0, ord: typeof it.ord === 'number' ? it.ord : null };
      if (!row.text) return;
      var prev = map[row.id];
      if (prev && row.ord == null && typeof prev.ord === 'number') row.ord = prev.ord;
      if (prev && prev.ord == null) prev.ord = null;
      if (!prev || row.t >= (prev.t || 0)) map[row.id] = row;
      else if (prev.ord == null && typeof row.ord === 'number') prev.ord = row.ord;
    });
    var rows = Object.keys(map).map(function (k) { return map[k]; });
    rows.sort(function (a, b) {
      var ao = typeof a.ord === 'number' ? a.ord : -1e12;
      var bo = typeof b.ord === 'number' ? b.ord : -1e12;
      if (ao !== bo) return ao - bo;
      return (b.t || 0) - (a.t || 0);
    });
    rows.forEach(function (r, i) { r.ord = i; });
    return rows;
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
      menu = '<div class="hl-tools"><b>' + esc(topic.name) + '</b><button type="button" class="hl-arrange' + (arranging ? ' on' : '') + '" data-act="' + (arranging ? 'arrange-done' : 'arrange') + '">' + (arranging ? 'Save order' : 'Arrange') + '</button><button type="button" class="hl-pen" data-act="rename" aria-label="Edit topic">' + PENCIL + '</button><button type="button" class="hl-x" data-act="drop" aria-label="Delete topic">×</button></div>';
    }
    var rows = list.map(function (it) {
      if (editingWord === it.id) {
        return '<li class="hl-row"><form class="hl-edit" data-id="' + esc(it.id) + '"><input maxlength="80" value="' + esc(it.text) + '" aria-label="Edit keyword"><button type="submit">Save</button><button type="button" data-act="word-cancel">Cancel</button></form></li>';
      }
      if (asking === it.id) {
        return '<li class="hl-row ask"><span>' + esc(it.text) + '</span><span class="hl-ask">Delete this?<button type="button" data-act="yes" data-id="' + esc(it.id) + '">Delete</button><button type="button" data-act="no">Keep</button></span></li>';
      }
      var grip = arranging ? '<button type="button" class="hl-grip" data-drag="' + esc(it.id) + '" aria-label="Drag to reorder"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9 5h2v2H9zm4 0h2v2h-2zM9 11h2v2H9zm4 0h2v2h-2zM9 17h2v2H9zm4 0h2v2h-2z"/></svg></button>' : '';
      var actions = arranging ? '' : '<span class="hl-actions"><button type="button" class="hl-pen" data-act="word-edit" data-id="' + esc(it.id) + '" aria-label="Edit">' + PENCIL + '</button><button type="button" class="hl-x" data-act="ask" data-id="' + esc(it.id) + '" aria-label="Delete">×</button></span>';
      return '<li class="hl-row' + (arranging ? ' arrange' : '') + '" data-id="' + esc(it.id) + '">' + grip + '<span>' + esc(it.text) + (it.url ? ' <a class="hl-link" href="' + esc(it.url) + '" target="_blank" rel="noopener">link</a>' : '') + '</span>' + actions + '</li>';
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
    var text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!text || !current) return;
    var list = tabs[current] || (tabs[current] = []);
    if (list.some(function (it) { return it.text.toLowerCase() === text.toLowerCase(); })) return;
    list.unshift({ id: nid(), text: text, t: Date.now(), ord: -1 });
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
    var text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 240);
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
    css.textContent = '#hl-app{color:#f4f7fb;overflow:hidden}.hl-tabs{display:flex;flex-wrap:wrap;gap:8px;overflow:visible}.hl-tab{flex:0 1 auto;border:0;border-radius:999px;padding:9px 12px;background:#17202b;color:#c5d0dc;font-weight:800;font-size:14px;cursor:pointer;white-space:nowrap}.hl-tab.on{background:#e6c878;color:#1a1406}.hl-tab.add{background:#243044;color:#f4f7fb}.hl-tab i{margin-left:6px;font-style:normal;font-size:11px;opacity:.75}.hl-tools,.hl-topic{display:flex;gap:8px;align-items:center;margin-top:12px}.hl-tools b{flex:1;font-size:16px}.hl-tools button,.hl-topic button,.hl-edit button{border:0;border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer;background:#243044;color:#f4f7fb}.hl-tools button[data-act=drop]{background:#2a1a22;color:#ff8b98}.hl-topic input,.hl-edit input{flex:1;min-width:0;padding:10px 12px;border:0;border-radius:12px;background:#141c27;color:#f4f7fb;font-size:16px;font-weight:700}.hl-topic button[type=submit],.hl-edit button[type=submit]{background:#e6c878;color:#1a1406}.hl-add{display:flex;gap:8px;align-items:center;margin:12px 0}.hl-add input{flex:1;min-width:0;padding:14px;border:0;border-radius:14px;background:#141c27;color:#f4f7fb;font-size:16px;font-weight:700}.hl-add button{border:0;border-radius:14px;padding:14px 16px;background:#e6c878;color:#1a1406;font-weight:900;cursor:pointer}.hl-add span{color:#8b95a5;font-size:12px;font-weight:700}.hl-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.hl-grip{width:28px;border:0;background:transparent;color:#7d8796;display:flex;align-items:center;justify-content:center;cursor:grab;touch-action:none;padding:0;flex:0 0 auto}.hl-row.hl-dragging{opacity:.55;background:#1c2836}.hl-row{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 14px;border-radius:16px;background:#10161f}.hl-row>span{flex:1;min-width:0;font-size:15px;font-weight:750;line-height:1.25;white-space:normal;overflow:visible}.hl-actions{margin-left:auto}.hl-arrange{border:0;border-radius:999px;padding:8px 12px;background:#243044;color:#f4f7fb;font-weight:800;cursor:pointer}.hl-arrange.on{background:#e6c878;color:#1a1406}.hl-actions{display:flex;gap:6px;align-items:center;flex:0 0 auto}.hl-pen{width:32px;height:32px;padding:0;border:0;border-radius:50%;background:#243044;color:#d5dde8;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto}.hl-tools .hl-pen,.hl-tools .hl-x{width:32px;height:32px;padding:0}.hl-x{width:32px;height:32px;border:0;border-radius:50%;background:#2a1a22;color:#ff8b98;font-size:18px;line-height:1;cursor:pointer}.hl-edit{display:flex;gap:8px;align-items:center;width:100%}.hl-ask{display:flex;gap:6px;align-items:center;flex-wrap:wrap;color:#ffb4be;font-size:13px;font-weight:800}.hl-ask.topic{margin-top:12px}.hl-ask button{border:0;border-radius:999px;padding:7px 10px;font-weight:800;cursor:pointer}.hl-ask button[data-act=yes],.hl-ask button[data-act=topic-yes]{background:#ff6f7c;color:#1a0c10}.hl-ask button[data-act=no],.hl-ask button[data-act=topic-cancel]{background:#243044;color:#f4f7fb}.hl-link{color:#e6c878;font-weight:800}';
    document.head.appendChild(css);
  }
  loadLocal();
  paint();
  var root = $('hl-app');
  if (root) {
    function applyOrder(ids) {
    var list = tabs[current] || [];
    var map = {};
    list.forEach(function (it) { map[it.id] = it; });
    var now = Date.now();
    var next = [];
    ids.forEach(function (id, i) {
      var it = map[id];
      if (!it) return;
      it.ord = i;
      it.t = now;
      next.push(it);
      delete map[id];
    });
    Object.keys(map).forEach(function (id) { next.push(map[id]); });
    tabs[current] = next;
    saveLocal();
    persist();
  }
  var drag = null;
  root.addEventListener('pointerdown', function (ev) {
    var handle = ev.target && ev.target.closest && ev.target.closest('[data-drag]');
    if (!handle) return;
    var row = handle.closest('.hl-row');
    if (!row) return;
    drag = { row: row };
    row.classList.add('hl-dragging');
    try { handle.setPointerCapture(ev.pointerId); } catch (e) {}
    ev.preventDefault();
  });
  root.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    var rows = root.querySelectorAll('.hl-row[data-id]');
    for (var i = 0; i < rows.length; i++) {
      var over = rows[i];
      if (over === drag.row) continue;
      var box = over.getBoundingClientRect();
      if (ev.clientY < box.top || ev.clientY > box.bottom) continue;
      var list = drag.row.parentNode;
      if (ev.clientY < box.top + box.height / 2) list.insertBefore(drag.row, over);
      else list.insertBefore(drag.row, over.nextSibling);
      break;
    }
  });
  function endDrag() {
    if (!drag) return;
    drag.row.classList.remove('hl-dragging');
    var ids = Array.prototype.map.call(root.querySelectorAll('.hl-row[data-id]'), function (row) {
      return row.getAttribute('data-id');
    });
    drag = null;
    applyOrder(ids);
  }
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  root.addEventListener('click', function (ev) {
      var tab = ev.target && ev.target.closest && ev.target.closest('[data-tab]');
      if (tab && !(ev.target.closest && ev.target.closest('[data-act]'))) {
        current = tab.getAttribute('data-tab') || current;
        asking = '';
        editingWord = '';
        topicMode = '';
        arranging = false;
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
      if (act === 'arrange') { arranging = true; asking = ''; editingWord = ''; paint(); }
      if (act === 'arrange-done') { arranging = false; paint(); }
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
  function dropStatus(text) {
    var el = $('hl-drop-status');
    if (el) el.textContent = text || '';
  }
  function topicPayload() {
    return topics.map(function (t) { return { id: t.id, name: t.name }; });
  }
  async function askHealth(payload) {
    var res = await fetch('https://trading-ohlcv.sasipudi.workers.dev/health-read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ topics: topicPayload() }, payload))
    });
    var data = await res.json();
    if (!data || !data.ok) throw new Error((data && data.error) || 'Could not read that');
    return data;
  }
  function storeTips(data) {
    var names = {};
    var count = 0;
    (data.items || []).forEach(function (it) {
      if (!it || !tabs[it.tab]) return;
      var text = String(it.text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      if (text.length < 3) return;
      var list = tabs[it.tab];
      if (list.some(function (row) { return row.text.toLowerCase() === text.toLowerCase(); })) return;
      list.unshift({ id: nid(), text: text, url: it.url || '', t: Date.now() });
      var topic = topicById(it.tab);
      names[topic ? topic.name : it.tab] = 1;
      count += 1;
    });
    if (!count) return data.titleOnly ? 'Only the title was readable, and it had no tip to file. The video itself was not watched.' : 'Nothing useful to file.';
    saveLocal();
    paint();
    persist();
    return 'Added ' + count + ' to ' + Object.keys(names).join(', ') + (data.titleOnly ? '. Only the title was read, not the video.' : '.');
  }
  function jpegFromCanvas(canvas) {
    return canvas.toDataURL('image/jpeg', 0.72).split(',')[1];
  }
  function imageJpeg(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, 1000 / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(jpegFromCanvas(canvas));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
      img.src = url;
    });
  }
  function videoFrames(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      video.onloadeddata = function () {
        var duration = video.duration || 0;
        if (!duration || !isFinite(duration)) duration = 1;
        var marks = [0.08, 0.35, 0.62, 0.88].map(function (p) { return Math.min(duration * p, Math.max(0, duration - 0.05)); });
        var shots = [];
        var i = 0;
        video.onseeked = function () {
          var canvas = document.createElement('canvas');
          var w = video.videoWidth || 640;
          var h = video.videoHeight || 360;
          var scale = Math.min(1, 900 / Math.max(w, h));
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          shots.push(jpegFromCanvas(canvas));
          i += 1;
          if (i < marks.length) video.currentTime = marks[i];
          else { URL.revokeObjectURL(url); resolve(shots); }
        };
        video.currentTime = marks[0];
      };
      video.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that video')); };
    });
  }
  function wavChunksFromBuffer(audio) {
    var src = audio.getChannelData(0);
    var srcRate = audio.sampleRate;
    var rate = 16000;
    var total = Math.max(1, Math.floor(src.length * rate / srcRate));
    var span = rate * 45;
    var chunks = [];
    function sample(i) {
      var at = Math.min(src.length - 1, Math.floor(i * srcRate / rate));
      var s = src[at] || 0;
      s = Math.max(-1, Math.min(1, s));
      return s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    for (var start = 0; start < total; start += span) {
      var n = Math.min(span, total - start);
      var header = 44;
      var bytes = new Uint8Array(header + n * 2);
      var view = new DataView(bytes.buffer);
      var write = function (off, str) { for (var k = 0; k < str.length; k++) bytes[off + k] = str.charCodeAt(k); };
      write(0, 'RIFF');
      view.setUint32(4, 36 + n * 2, true);
      write(8, 'WAVEfmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, rate, true);
      view.setUint32(28, rate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      write(36, 'data');
      view.setUint32(40, n * 2, true);
      for (var i = 0; i < n; i++) view.setInt16(header + i * 2, sample(start + i), true);
      var bin = '';
      for (var p = 0; p < bytes.length; p += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(p, p + 0x8000));
      chunks.push(btoa(bin));
    }
    return chunks;
  }
  function speechFromFile(file, onTick) {
    if (file.size > 40000000) return recordSpeech(file, onTick);
    return file.arrayBuffer().then(function (buf) {
      var ctx = new AudioContext();
      return ctx.decodeAudioData(buf.slice(0)).then(function (audio) {
        ctx.close();
        return wavChunksFromBuffer(audio).slice(0, 4);
      }).catch(function () {
        ctx.close();
        return recordSpeech(file, onTick);
      });
    });
  }
  function recordSpeech(file, onTick) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var video = document.createElement('video');
      video.playsInline = true;
      video.preload = 'auto';
      video.src = url;
      video.onloadedmetadata = function () {
        var cap = Math.min(isFinite(video.duration) ? video.duration : 0, 180);
        var stream = video.captureStream ? video.captureStream() : null;
        var tracks = stream && stream.getAudioTracks ? stream.getAudioTracks() : [];
        if (!cap || !tracks.length || !window.MediaRecorder) {
          URL.revokeObjectURL(url);
          resolve([]);
          return;
        }
        var mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].filter(function (t) {
          return MediaRecorder.isTypeSupported(t);
        })[0] || '';
        var rec;
        try { rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime } : undefined); }
        catch (e) { URL.revokeObjectURL(url); resolve([]); return; }
        var chunks = [];
        rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
        rec.onstop = function () {
          URL.revokeObjectURL(url);
          var blob = new Blob(chunks, { type: mime || 'audio/webm' });
          blob.arrayBuffer().then(function (buf) {
            var ctx = new AudioContext();
            return ctx.decodeAudioData(buf.slice(0)).then(function (audio) {
              ctx.close();
              resolve(wavChunksFromBuffer(audio).slice(0, 4));
            });
          }).catch(function () { resolve([]); });
        };
        try { rec.start(1000); } catch (e) { URL.revokeObjectURL(url); resolve([]); return; }
        var timer = setInterval(function () {
          if (onTick) onTick(video.currentTime || 0, cap);
          if ((video.currentTime || 0) >= cap - 0.25) {
            clearInterval(timer);
            video.pause();
            if (rec.state !== 'inactive') rec.stop();
          }
        }, 400);
        video.onended = function () {
          clearInterval(timer);
          if (rec.state !== 'inactive') rec.stop();
        };
        video.play().catch(function () {
          clearInterval(timer);
          if (rec.state !== 'inactive') rec.stop();
        });
      };
      video.onerror = function () { URL.revokeObjectURL(url); resolve([]); };
    });
  }
  async function tipsFromSpeech(chunks) {
    var items = [];
    for (var i = 0; i < chunks.length; i++) {
      dropStatus('Hearing the video ' + (i + 1) + ' of ' + chunks.length + '…');
      var data = await askHealth({ audio: chunks[i] });
      items = items.concat((data && data.items) || []);
    }
    return { items: items };
  }
  async function readImages(images, note) {
    var merged = { items: [], titleOnly: false };
    for (var i = 0; i < images.length; i++) {
      dropStatus((note || 'Reading') + ' ' + (i + 1) + ' of ' + images.length + '…');
      var data = await askHealth({ image: images[i] });
      merged.items = merged.items.concat(data.items || []);
    }
    return merged;
  }
  var linkForm = $('hl-link');
  if (linkForm) linkForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var input = $('hl-url');
    var url = input && input.value.trim();
    if (!url) return;
    dropStatus('Reading the link…');
    askHealth({ url: url }).then(function (data) {
      if (input) input.value = '';
      (data.items || []).forEach(function (it) { it.url = it.url || url; });
      dropStatus(storeTips(data));
    }).catch(function (e) {
      dropStatus((e && e.message) || 'Could not read that link');
    });
  });
  var fileInput = $('hl-file');
  if (fileInput) fileInput.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fileInput.files || []);
    fileInput.value = '';
    if (!files.length) return;
    dropStatus('Reading…');
    var chain = Promise.resolve({ items: [] });
    files.forEach(function (file) {
      chain = chain.then(function (acc) {
        if ((file.type || '').indexOf('video') === 0) {
          dropStatus('Listening to the video…');
          return Promise.all([
            videoFrames(file),
            speechFromFile(file, function (now, cap) {
              dropStatus('Listening ' + Math.round(now) + 's of ' + Math.round(cap) + 's…');
            })
          ]).then(function (pair) {
            return readImages(pair[0] || [], 'Reading the picture').then(function (seen) {
              return tipsFromSpeech(pair[1] || []).catch(function (err) {
                acc.speechError = err && err.message;
                return { items: [] };
              }).then(function (heard) {
                acc.items = acc.items.concat(seen.items || [], heard.items || []);
                return acc;
              });
            });
          });
        }
        return imageJpeg(file).then(function (jpeg) {
          return readImages([jpeg], 'Reading photo').then(function (seen) {
            acc.items = acc.items.concat(seen.items || []);
            return acc;
          });
        });
      });
    });
    chain.then(function (acc) {
      var msg = storeTips(acc);
      if (acc.speechError && (!acc.items || !acc.items.length)) msg = acc.speechError;
      dropStatus(msg);
    }).catch(function (e) {
      dropStatus((e && e.message) || 'Could not read that file');
    });
  });
  fetch(PATH + '?t=' + Date.now(), { cache: 'no-store' }).then(function (res) {
    return res.ok ? res.json() : null;
  }).then(function (data) {
    if (!data) return;
    merge(data);
    saveLocal();
    paint();
  }).catch(function () {});
})();
