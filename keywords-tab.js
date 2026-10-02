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
  function radiusFor(text, n, w, h) {
    var fit = Math.sqrt((w * h * 0.46) / (Math.max(1, n) * Math.PI));
    return Math.max(42, Math.min(fit, 78, w * 0.22, h * 0.18));
  }
  function place(st, w, h, i, n) {
    var cols = Math.max(1, Math.round(Math.sqrt((n * w) / Math.max(1, h))));
    var rows = Math.ceil(n / cols);
    var col = i % cols;
    var row = Math.floor(i / cols);
    st.x = ((col + 0.5) / cols) * w;
    st.y = ((row + 0.5) / rows) * h;
    st.x = Math.max(st.r, Math.min(w - st.r, st.x));
    st.y = Math.max(st.r, Math.min(h - st.r, st.y));
  }
  function sync() {
    var stage = $('kw-stage');
    if (!stage) return;
    var w = stage.clientWidth || 320;
    var h = stage.clientHeight || 480;
    var keep = {};
    items.forEach(function (item, i) {
      keep[item.id] = 1;
      var st = nodes[item.id];
      var r = radiusFor(item.text, items.length, w, h);
      if (!st) {
        var el = document.createElement('div');
        el.className = 'kw-bubble';
        var lab = document.createElement('button');
        lab.type = 'button';
        lab.className = 'kw-lab';
        lab.addEventListener('click', function () { openEdit(item.id); });
        st = {
          id: item.id,
          el: el,
          lab: lab,
          r: r,
          x: 0,
          y: 0,
          vx: (Math.random() * 0.35 + 0.12) * (Math.random() < 0.5 ? -1 : 1),
          vy: (Math.random() * 0.35 + 0.12) * (Math.random() < 0.5 ? -1 : 1)
        };
        place(st, w, h, i, items.length);
        stage.appendChild(el);
        stage.appendChild(lab);
        nodes[item.id] = st;
      }
      st.lab.textContent = item.text;
      st.r = r;
      st.el.style.width = r * 2 + 'px';
      st.el.style.height = r * 2 + 'px';
      st.el.style.background =
        'radial-gradient(circle at 32% 28%, rgba(255,255,255,.35), ' + (item.color || COLORS[0]) + ' 46%, #070b10 100%)';
      var words = String(item.text).trim().split(/\s+/);
      var longest = words.reduce(function (m, word) { return Math.max(m, word.length); }, 1);
      st.lab.style.fontSize = Math.max(13, Math.min(18, 220 / longest)) + 'px';
    });
    Object.keys(nodes).forEach(function (id) {
      if (keep[id]) return;
      if (nodes[id].el && nodes[id].el.parentNode) nodes[id].el.parentNode.removeChild(nodes[id].el);
      if (nodes[id].lab && nodes[id].lab.parentNode) nodes[id].lab.parentNode.removeChild(nodes[id].lab);
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
        var min = a.r + b.r + 14;
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
      if (s.x < s.r) s.x = s.r;
      if (s.x > w - s.r) s.x = w - s.r;
      if (s.y < s.r) s.y = s.r;
      if (s.y > h - s.r) s.y = h - s.r;
      var wobble = 1 + Math.sin(Date.now() / 900 + s.x) * 0.015;
      s.el.style.transform = 'translate(' + (s.x - s.r) + 'px,' + (s.y - s.r) + 'px) scale(' + wobble + ')';
      if (s.lab) s.lab.style.transform = 'translate(' + s.x + 'px,' + s.y + 'px) translate(-50%,-50%)';
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
    ['tf-panels','fe-panel','alerts-panel','trend-panel','struct-panel','macro-panel','signal-panel','memegate-panel','coin-panel','antifomo-panel','hunter-panel','breakouts-panel','holders-panel','failures-panel','inmemory-panel','sentiment-panel','keep-panel','verdict-panel','entrywindow-panel','position-panel','wowdip-panel','omg-panel','pitfalls-panel','strategy-panel','decision-panel','gmgn-panel','wallets-panel','pumpfun-panel','fomo-panel','fx-panel','fd-panel','coinstats-panel','emotion-panel','tiers-panel','gnotes-panel'].forEach(function (id) {
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
    css.textContent = '#kw-stage{position:relative;height:min(74vh,760px);margin-top:12px;border-radius:22px;overflow:hidden;background:radial-gradient(circle at 50% 40%,#162033,#070a0f 72%);border:1px solid #243041}#kw-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#6d7688;font-weight:800;padding:24px;text-align:center}.kw-bubble{position:absolute;left:0;top:0;z-index:1;border-radius:50%;pointer-events:none;box-shadow:0 10px 24px #0006}.kw-lab{position:absolute;left:0;top:0;z-index:5;max-width:78%;padding:7px 12px;border:0;border-radius:999px;background:rgba(7,10,16,.82);color:#fff;font-weight:800;line-height:1.15;text-align:center;cursor:pointer;box-shadow:0 6px 16px #000a}#kw-edit{display:none;gap:8px;align-items:center;margin-top:10px}#kw-edit.on{display:flex}#kw-edit input{flex:1;min-width:0;padding:12px 14px;border-radius:12px;border:1px solid #e6b84d;background:#0b121a;color:#f4f7fb;font-size:16px;font-weight:800}#kw-edit button{padding:12px 12px;border-radius:12px;border:0;font-weight:900;cursor:pointer}#kw-edit-save{background:#e6b84d;color:#1a1406}#kw-edit-del{background:#3a1820;color:#ff8a9a}#kw-edit-x{background:#243041;color:#e8eef6}';
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
