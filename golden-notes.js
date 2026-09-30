/* Golden Notes — read an X screenshot, keep the lines, discard the image. */
(function () {
  var KEY = 'gn_notes_v1';
  var TOMB = 'gn_notes_tomb_v1';
  var PATH = 'data/golden-notes.json';
  var GH = 'https://api.github.com/repos/Sasikar/Trading/contents/' + PATH;
  var items = [];
  var editing = null;
  var syncing = false;
  var busy = false;

  function $(id) { return document.getElementById(id); }
  function token() {
    try { return localStorage.getItem('trading_github_token') || localStorage.getItem('trading_tax_github_token') || ''; }
    catch (e) { return ''; }
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
    var el = $('gn-status');
    if (el) el.textContent = text || '';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return c === '&' ? '&' : c === '<' ? '<' : c === '>' ? '>' : '"';
    });
  }
  function when(t) {
    try {
      return new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });
    } catch (e) { return ''; }
  }
  function merge(remote) {
    var dead = tombs();
    var map = {};
    items.concat(remote || []).forEach(function (it) {
      if (!it || !it.id || !it.text || dead[it.id]) return;
      var prev = map[it.id];
      if (!prev || (it.t || 0) >= (prev.t || 0)) map[it.id] = { id: it.id, text: String(it.text), t: it.t || 0 };
    });
    items = Object.keys(map).map(function (k) { return map[k]; });
    items.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
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
          paint();
        }
      } catch (e) {}
      var tok = token();
      if (!tok) { setStatus(items.length + ' notes · this phone'); return; }
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
        setStatus(items.length + ' notes · this phone');
        return;
      }
      var body = {
        message: 'Golden notes (' + items.length + ')',
        content: btoa(unescape(encodeURIComponent(JSON.stringify({ updated: new Date().toISOString(), items: items }, null, 2)))),
        branch: 'master'
      };
      if (sha) body.sha = sha;
      var pr = await fetch(GH, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      setStatus(pr.ok ? items.length + ' notes · GitHub' : items.length + ' notes · this phone');
    } catch (e) {
      setStatus(items.length + ' notes · this phone');
    } finally {
      syncing = false;
    }
  }
  function paint() {
    var list = $('gn-list');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<div style="color:#8b93a7;font-weight:700;padding:8px 2px">No notes yet. Upload a tweet screenshot.</div>';
      return;
    }
    list.innerHTML = items.map(function (it) {
      if (editing === it.id) {
        return '<div class="gn-card on"><textarea id="gn-edit" rows="4">' + esc(it.text) + '</textarea><div class="gn-row"><button type="button" data-act="save" data-id="' + esc(it.id) + '">Save</button><button type="button" data-act="del" data-id="' + esc(it.id) + '">Delete</button><button type="button" data-act="cancel">Cancel</button></div></div>';
      }
      return '<button type="button" class="gn-card" data-act="edit" data-id="' + esc(it.id) + '"><div class="gn-text">' + esc(it.text) + '</div><div class="gn-time">' + esc(when(it.t)) + ' IST · tap to edit</div></button>';
    }).join('');
  }
  function goodLines(text) {
    var junk = /^(reply|replies|repost|reposts|like|likes|share|bookmark|follow|following|more|show more|quote|view|views|home|search|notifications|messages|grok|post|posted|subscribe|sign up|log in|for you|following)$/i;
    var clock = /^(\d+\s*[smhdw]|\d{1,2}:\d{2}\s*(am|pm)?|·+)$/i;
    var kept = String(text || '').split(/\n/).map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(function (line) {
      if (!line || junk.test(line) || clock.test(line)) return false;
      if (/^@\w+$/.test(line)) return false;
      if (line.length < 8 && !/[a-z]{4,}/i.test(line)) return false;
      return true;
    });
    var notes = [];
    var buf = '';
    kept.forEach(function (line) {
      if (!buf) buf = line;
      else if (/[.!?…"”]$/.test(buf) && /^[A-Z@#"'“]/.test(line)) {
        notes.push(buf);
        buf = line;
      } else buf += ' ' + line;
    });
    if (buf) notes.push(buf);
    notes = notes.map(function (n) { return n.replace(/\s+/g, ' ').trim(); }).filter(function (n) {
      return n.split(/\s+/).length >= 4 || n.length >= 28;
    });
    if (!notes.length && kept.length) notes = [kept.join(' ')];
    var seen = {};
    return notes.filter(function (n) {
      var k = n.toLowerCase();
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });
  }
  function trimShot(img) {
    var maxW = 1280;
    var scale = Math.min(1, maxW / (img.naturalWidth || img.width || 1));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    c.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, c.width, c.height);
    var data = ctx.getImageData(0, 0, c.width, c.height).data;
    function rowVar(y) {
      var min = 255, max = 0, i0 = y * c.width * 4;
      for (var x = 0; x < c.width; x += 3) {
        var g = data[i0 + x * 4];
        if (g < min) min = g;
        if (g > max) max = g;
      }
      return max - min;
    }
    function colVar(x) {
      var min = 255, max = 0;
      for (var y = 0; y < c.height; y += 3) {
        var g = data[(y * c.width + x) * 4];
        if (g < min) min = g;
        if (g > max) max = g;
      }
      return max - min;
    }
    var top = 0, bottom = c.height - 1, left = 0, right = c.width - 1;
    while (top < bottom && rowVar(top) < 16) top++;
    while (bottom > top && rowVar(bottom) < 16) bottom--;
    while (left < right && colVar(left) < 16) left++;
    while (right > left && colVar(right) < 16) right--;
    var w = right - left + 1, h = bottom - top + 1;
    if (w < 40 || h < 40) return c;
    var out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(c, left, top, w, h, 0, 0, w, h);
    c.width = 1;
    c.height = 1;
    return out;
  }
  function destroyImage(img, canvas) {
    try { if (img) img.src = ''; } catch (e) {}
    try { if (canvas) { canvas.width = 1; canvas.height = 1; } } catch (e) {}
  }
  async function readFile(file) {
    if (!file || busy) return;
    busy = true;
    setStatus('Reading screenshot…');
    var img = new Image();
    var url = URL.createObjectURL(file);
    var canvas = null;
    try {
      await new Promise(function (resolve, reject) {
        img.onload = resolve;
        img.onerror = function () { reject(new Error('Could not read that image')); };
        img.src = url;
      });
      canvas = trimShot(img);
      setStatus('Pulling the good lines…');
      var mod = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js');
      var worker = await mod.createWorker('eng');
      var result = await worker.recognize(canvas);
      await worker.terminate();
      var lines = goodLines(result && result.data && result.data.text);
      if (!lines.length) throw new Error('No useful lines in that screenshot');
      var now = Date.now();
      lines.forEach(function (text, i) {
        items.unshift({ id: now.toString(36) + i.toString(36) + Math.random().toString(36).slice(2, 5), text: text, t: now + i });
      });
      saveLocal();
      paint();
      setStatus(lines.length + ' lines kept · image discarded');
      persist();
    } catch (e) {
      setStatus(String(e && e.message ? e.message : e));
    } finally {
      URL.revokeObjectURL(url);
      destroyImage(img, canvas);
      var input = $('gn-file');
      if (input) input.value = '';
      busy = false;
    }
  }
  function hideOthers() {
    ['tf-panels','fe-panel','alerts-panel','keywords-panel','trend-panel','struct-panel','macro-panel','signal-panel','memegate-panel','coin-panel','antifomo-panel','hunter-panel','breakouts-panel','holders-panel','failures-panel','inmemory-panel','sentiment-panel','keep-panel','verdict-panel','entrywindow-panel','position-panel','wowdip-panel','omg-panel','pitfalls-panel','strategy-panel','decision-panel','gmgn-panel','wallets-panel','pumpfun-panel','fomo-panel','fx-panel','fd-panel','coinstats-panel','emotion-panel','tiers-panel'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
  }
  function showGoldenNotes(on) {
    var p = $('gnotes-panel');
    if (!p) return;
    if (!on) {
      p.style.display = 'none';
      p.classList.remove('on');
      editing = null;
      return;
    }
    hideOthers();
    p.style.display = 'block';
    p.classList.add('on');
    paint();
    persist();
  }
  window.showGoldenNotes = showGoldenNotes;

  if (!document.getElementById('gn-style')) {
    var css = document.createElement('style');
    css.id = 'gn-style';
    css.textContent = '.gn-card{display:block;width:100%;text-align:left;border:1px solid #6b5420;background:#141006;color:#f4e7c3;border-radius:16px;padding:14px;font-weight:700;line-height:1.45;cursor:pointer}.gn-card.on{border-color:#e6b84d}.gn-text{font-size:16px;white-space:pre-wrap}.gn-time{margin-top:8px;color:#a89058;font-size:11px;font-weight:800;letter-spacing:.04em}.gn-card textarea{width:100%;box-sizing:border-box;min-height:110px;border-radius:12px;border:1px solid #e6b84d;background:#0b121a;color:#f4f7fb;font:700 15px/1.45 Inter,system-ui,sans-serif;padding:10px}.gn-row{display:flex;gap:8px;margin-top:8px}.gn-row button{padding:10px 12px;border:0;border-radius:10px;font-weight:900;cursor:pointer;background:#243041;color:#e8eef6}.gn-row button[data-act="save"]{background:#e6b84d;color:#1a1406}.gn-row button[data-act="del"]{background:#3a1820;color:#ff8a9a}';
    document.head.appendChild(css);
  }
  loadLocal();
  var pick = $('gn-pick');
  var file = $('gn-file');
  if (pick && file) {
    pick.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () { if (file.files && file.files[0]) readFile(file.files[0]); });
  }
  var list = $('gn-list');
  if (list) list.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    var id = b.getAttribute('data-id');
    if (act === 'edit') { editing = id; paint(); return; }
    if (act === 'cancel') { editing = null; paint(); return; }
    if (act === 'del') {
      markTomb(id, true);
      items = items.filter(function (it) { return it.id !== id; });
      editing = null;
      saveLocal();
      paint();
      persist();
      return;
    }
    if (act === 'save') {
      var box = $('gn-edit');
      var text = (box && box.value || '').trim();
      if (!text) return;
      items.forEach(function (it) { if (it.id === id) { it.text = text; it.t = Date.now(); } });
      editing = null;
      saveLocal();
      paint();
      persist();
    }
  });
  var tabs = $('tf-tabs');
  if (tabs) tabs.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
    if (!b || b.getAttribute('data-tf') === 'gnotes') return;
    showGoldenNotes(false);
  }, true);
})();
