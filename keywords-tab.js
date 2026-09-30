/* Keywords tab — typed words as drifting bubbles, saved locally and on GitHub. */
(function () {
  var KEY = 'kw_bubbles_v1';
  var TOMB = 'kw_bubbles_tomb_v1';
  var PATH = 'data/keywords.json';
  var GH = 'https://api.github.com/repos/Sasikar/Trading/contents/' + PATH;
  var COLORS = ['#1f8a4d', '#d4a017', '#2f6fdb', '#c43b6e', '#7c4ddb', '#0f8f8a', '#d4652f', '#3aa0c8'];
  var items = [];
  var nodes = {};
  var running = false;
  var raf = 0;
  var editing = null;
  var syncing = false;

  function $(id) { return document.getElementById(id); }
  function token() {
    try {
      return localStorage.getItem('trading_github_token') || localStorage.getItem('trading_tax_github_token') || '';
    } catch (e) { return ''; }
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
  function loadLocal() {
    try { items = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { items = []; }
    if (!Array.isArray(items)) items = [];
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
  }
  function setStatus(text) {
    var el = $('kw-status');
    if (el) el.textContent = text || '';
  }
  function merge(remote) {
    var dead = tombs();
    var map = {};
    items.concat(remote || []).forEach(function (it) {
      if (!it || !it.id || !it.text || dead[it.id]) return;
      var prev = map[it.id];
      if (!prev || (it.t || 0) >= (prev.t || 0)) map[it.id] = { id: it.id, text: String(it.text).slice(0, 32), color: it.color || COLORS[0], t: it.t || 0 };
    });
    items = Object.keys(map).map(function (k) { return map[k]; });
  }
  function decodeContent(gj) {
    var text = decodeURIComponent(escape(atob(String(gj.content || '').replace(/\s/g, ''))));
    var data = JSON.parse(text);
    return (data && data.items) || [];
  }
  async function persist() {
    saveLocal();
    if (syncing) return;
    syncing = true;
    try {
      try {
        var pub = await fetch(PATH + '?t=' + Date.now(), { cache: 'no-store' });
        if (pub.ok) {
          var pj = await pub.json();
          merge(pj.items || []);
          saveLocal();
          sync();
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
        try { merge(decodeContent(gj)); saveLocal(); sync(); } catch (e) {}
      } else if (gr.status !== 404) {
        setStatus('Saved on this phone');
        return;
      }
      var body = {
        message: 'Keywords (' + items.length + ')',
        content: btoa(unescape(encodeURIComponent(JSON.stringify({ updated: new Date().toISOString(), items: items }, null, 2)))),
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
  function radiusFor(text, n) {
    var base = Math.max(86, Math.min(150, 70 + String(text).length * 6));
    if (n > 10) return base * 0.62;
    if (n > 6) return base * 0.78;
    return base;
  }
  function place(st, w, h) {
    var guard = 0;
    do {
      st.x = st.r + Math.random() * Math.max(1, w - st.r * 2);
      st.y = st.r + Math.random() * Math.max(1, h - st.r * 2);
      guard++;
    } while (guard < 20 && Object.keys(nodes).some(function (id) {
      var o = nodes[id];
      if (!o || o === st) return false;
      return Math.hypot(o.x - st.x, o.y - st.y) < (o.r + st.r) * 0.7;
    }));
  }
  function sync() {
    var stage = $('kw-stage');
    if (!stage) return;
    var w = stage.clientWidth || 320;
    var h = stage.clientHeight || 480;
    var keep = {};
    items.forEach(function (item) {
      keep[item.id] = 1;
      var st = nodes[item.id];
      var r = radiusFor(item.text, items.length);
      if (!st) {
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'kw-bubble';
        el.setAttribute('data-id', item.id);
        var span = document.createElement('span');
        el.appendChild(span);
        st = {
          id: item.id,
          el: el,
          r: r,
          x: 0,
          y: 0,
          vx: (Math.random() * 0.7 + 0.25) * (Math.random() < 0.5 ? -1 : 1),
          vy: (Math.random() * 0.7 + 0.25) * (Math.random() < 0.5 ? -1 : 1),
          rot: Math.random() * 360,
          vr: (Math.random() * 0.18 + 0.06) * (Math.random() < 0.5 ? -1 : 1)
        };
        place(st, w, h);
        el.addEventListener('click', function () { openEdit(el.getAttribute('data-id')); });
        stage.appendChild(el);
        nodes[item.id] = st;
      }
      var label = st.el.querySelector('span');
      if (label) label.textContent = item.text;
      st.r = r;
      st.el.style.width = r * 2 + 'px';
      st.el.style.height = r * 2 + 'px';
      st.el.style.background =
        'radial-gradient(circle at 32% 28%, rgba(255,255,255,.45), rgba(255,255,255,0) 36%), radial-gradient(circle at 50% 58%, ' +
        (item.color || COLORS[0]) + ', rgba(0,0,0,.35))';
      st.el.style.fontSize = Math.max(15, Math.min(34, r * (item.text.length > 12 ? 0.2 : 0.28))) + 'px';
    });
    Object.keys(nodes).forEach(function (id) {
      if (keep[id]) return;
      if (nodes[id].el && nodes[id].el.parentNode) nodes[id].el.parentNode.removeChild(nodes[id].el);
      delete nodes[id];
    });
    var empty = $('kw-empty');
    if (!empty && !items.length) {
      empty = document.createElement('div');
      empty.id = 'kw-empty';
      empty.textContent = 'Your keywords show up here as big bubbles.';
      stage.appendChild(empty);
    } else if (empty && items.length && empty.parentNode) {
      empty.parentNode.removeChild(empty);
    }
  }
  function step() {
    var stage = $('kw-stage');
    var panel = $('keywords-panel');
    if (!stage || !panel || panel.style.display === 'none') { running = false; return; }
    var w = stage.clientWidth || 320;
    var h = stage.clientHeight || 480;
    var list = Object.keys(nodes).map(function (id) { return nodes[id]; });
    list.forEach(function (s) {
      s.x += s.vx;
      s.y += s.vy;
      s.rot += s.vr;
      if (s.x < s.r) { s.x = s.r; s.vx = Math.abs(s.vx); }
      if (s.x > w - s.r) { s.x = w - s.r; s.vx = -Math.abs(s.vx); }
      if (s.y < s.r) { s.y = s.r; s.vy = Math.abs(s.vy); }
      if (s.y > h - s.r) { s.y = h - s.r; s.vy = -Math.abs(s.vy); }
    });
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        var a = list[i], b = list[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var dist = Math.hypot(dx, dy) || 0.01;
        var min = a.r + b.r - 6;
        if (dist < min) {
          var nx = dx / dist, ny = dy / dist, push = (min - dist) / 2;
          a.x -= nx * push; b.x += nx * push;
          a.y -= ny * push; b.y += ny * push;
          a.vx -= nx * 0.04; b.vx += nx * 0.04;
          a.vy -= ny * 0.04; b.vy += ny * 0.04;
        }
      }
    }
    list.forEach(function (s) {
      var wobble = 1 + Math.sin(Date.now() / 700 + s.rot) * 0.025;
      s.el.style.transform = 'translate(' + (s.x - s.r) + 'px,' + (s.y - s.r) + 'px) rotate(' + s.rot + 'deg) scale(' + wobble + ')';
    });
    raf = requestAnimationFrame(step);
  }
  function kick() {
    if (running) return;
    running = true;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(step);
  }
  function add(raw) {
    String(raw || '').split(/[,\n]/).forEach(function (part) {
      var text = part.trim().replace(/\s+/g, ' ').slice(0, 32);
      if (!text) return;
      if (items.some(function (it) { return it.text.toLowerCase() === text.toLowerCase(); })) return;
      if (items.length >= 24) return;
      items.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        text: text,
        color: COLORS[items.length % COLORS.length],
        t: Date.now()
      });
    });
    saveLocal();
    sync();
    kick();
    persist();
  }
  function openEdit(id) {
    var item = null;
    items.forEach(function (it) { if (it.id === id) item = it; });
    if (!item) return;
    editing = id;
    var box = $('kw-edit');
    var input = $('kw-edit-text');
    if (input) input.value = item.text;
    if (box) box.classList.add('on');
    if (input) setTimeout(function () { try { input.focus(); input.select(); } catch (e) {} }, 30);
  }
  function closeEdit() {
    editing = null;
    var box = $('kw-edit');
    if (box) box.classList.remove('on');
  }
  function saveEdit() {
    var input = $('kw-edit-text');
    var text = (input && input.value || '').trim().replace(/\s+/g, ' ').slice(0, 32);
    if (!editing || !text) return;
    items.forEach(function (it) {
      if (it.id === editing) { it.text = text; it.t = Date.now(); }
    });
    saveLocal();
    sync();
    closeEdit();
    persist();
  }
  function deleteEdit() {
    if (!editing) return;
    markTomb(editing, true);
    items = items.filter(function (it) { return it.id !== editing; });
    saveLocal();
    sync();
    closeEdit();
    persist();
  }
  function hideOthers() {
    ['tf-panels','fe-panel','alerts-panel','trend-panel','struct-panel','macro-panel','signal-panel','memegate-panel','coin-panel','antifomo-panel','hunter-panel','breakouts-panel','holders-panel','failures-panel','inmemory-panel','sentiment-panel','keep-panel','verdict-panel','entrywindow-panel','position-panel','wowdip-panel','omg-panel','pitfalls-panel','strategy-panel','decision-panel','gmgn-panel','wallets-panel','pumpfun-panel','fomo-panel','fx-panel','fd-panel','coinstats-panel','emotion-panel','tiers-panel'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
  }
  function showKeywords(on) {
    var p = $('keywords-panel');
    if (!p) return;
    if (!on) {
      p.style.display = 'none';
      p.classList.remove('on');
      running = false;
      cancelAnimationFrame(raf);
      closeEdit();
      return;
    }
    hideOthers();
    p.style.display = 'block';
    p.classList.add('on');
    sync();
    kick();
    persist();
  }
  window.showKeywords = showKeywords;

  if (!document.getElementById('kw-style')) {
    var css = document.createElement('style');
    css.id = 'kw-style';
    css.textContent = '#kw-stage{position:relative;height:min(74vh,760px);margin-top:12px;border-radius:22px;overflow:hidden;background:radial-gradient(circle at 50% 40%,#162033,#070a0f 72%);border:1px solid #243041}#kw-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#6d7688;font-weight:800;padding:24px;text-align:center}.kw-bubble{position:absolute;left:0;top:0;border:0;border-radius:50%;padding:12px;color:#fff;font-weight:900;letter-spacing:.01em;line-height:1.05;cursor:pointer;box-shadow:0 16px 40px #0008, inset 0 0 0 2px rgba(255,255,255,.18);text-shadow:0 2px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden}#kw-edit{display:none;gap:8px;align-items:center;margin-top:10px}#kw-edit.on{display:flex}#kw-edit input{flex:1;min-width:0;padding:12px 14px;border-radius:12px;border:1px solid #e6b84d;background:#0b121a;color:#f4f7fb;font-size:16px;font-weight:800}#kw-edit button{padding:12px 12px;border-radius:12px;border:0;font-weight:900;cursor:pointer}#kw-edit-save{background:#e6b84d;color:#1a1406}#kw-edit-del{background:#3a1820;color:#ff8a9a}#kw-edit-x{background:#243041;color:#e8eef6}';
    document.head.appendChild(css);
  }
  loadLocal();
  var form = $('kw-form');
  if (form) form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var input = $('kw-input');
    add(input && input.value);
    if (input) input.value = '';
  });
  var saveBtn = $('kw-edit-save');
  var delBtn = $('kw-edit-del');
  var xBtn = $('kw-edit-x');
  var editInput = $('kw-edit-text');
  if (saveBtn) saveBtn.addEventListener('click', saveEdit);
  if (delBtn) delBtn.addEventListener('click', deleteEdit);
  if (xBtn) xBtn.addEventListener('click', closeEdit);
  if (editInput) editInput.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); saveEdit(); }
    if (ev.key === 'Escape') closeEdit();
  });
  var tabs = $('tf-tabs');
  if (tabs) tabs.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
    if (!b || b.getAttribute('data-tf') === 'keywords') return;
    showKeywords(false);
  }, true);
})();
