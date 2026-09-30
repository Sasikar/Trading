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
  var page = 0;
  var pageSize = 10;
  try {
    var savedSize = parseInt(localStorage.getItem('gn_page_size') || '10', 10);
    if (savedSize >= 1 && savedSize <= 100) pageSize = savedSize;
  } catch (e) {}

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
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
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
      if (!it || !it.id || dead[it.id]) return;
      var text = it.text && typeof it.text === 'object' ? ((noteLine(it.text, 0)[0]) || '') : String(it.text || '').replace(/\s+/g, ' ').trim();
      if (!text || text === '[object Object]' || text.indexOf('[object Object]') >= 0) { markTomb(it.id, true); return; }
      var prev = map[it.id];
      if (!prev || (it.t || 0) >= (prev.t || 0)) map[it.id] = { id: it.id, text: text, t: it.t || 0 };
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
  function pageCount() {
    return Math.max(1, Math.ceil(items.length / pageSize) || 1);
  }
  function setPageSize(n) {
    n = parseInt(n, 10);
    if (!(n >= 1)) n = 10;
    if (n > 100) n = 100;
    pageSize = n;
    page = 0;
    try { localStorage.setItem('gn_page_size', String(pageSize)); } catch (e) {}
    paint();
  }
  function paint() {
    var list = $('gn-list');
    var pager = $('gn-pages');
    if (!list) return;
    document.querySelectorAll('#gn-tools [data-size]').forEach(function (b) {
      b.classList.toggle('on', parseInt(b.getAttribute('data-size'), 10) === pageSize);
    });
    var any = $('gn-any');
    if (any && document.activeElement !== any) any.value = pageSize === 10 || pageSize === 20 ? '' : String(pageSize);
    if (!items.length) {
      list.innerHTML = '<div class="gn-empty">No notes yet. Upload one or many tweet screenshots.</div>';
      if (pager) pager.innerHTML = '';
      return;
    }
    var max = pageCount();
    if (page > max - 1) page = max - 1;
    if (page < 0) page = 0;
    var start = page * pageSize;
    var slice = items.slice(start, start + pageSize);
    list.innerHTML = slice.map(function (it, i) {
      var n = start + i + 1;
      if (editing === it.id) {
        return '<div class="gn-card on"><div class="gn-no">' + n + '</div><div class="gn-body"><textarea id="gn-edit" rows="4">' + esc(it.text) + '</textarea><div class="gn-row"><button type="button" data-act="save" data-id="' + esc(it.id) + '">Save</button><button type="button" data-act="ask" data-id="' + esc(it.id) + '">Delete</button><button type="button" data-act="cancel">Cancel</button></div></div></div>';
      }
      return '<div class="gn-card"><div class="gn-no">' + n + '</div><button type="button" class="gn-body" data-act="edit" data-id="' + esc(it.id) + '"><div class="gn-text">' + esc(it.text) + '</div><div class="gn-time">' + esc(when(it.t)) + ' IST · tap to edit</div></button><button type="button" class="gn-x" data-act="ask" data-id="' + esc(it.id) + '" aria-label="Delete">×</button></div>';
    }).join('');
    if (!pager) return;
    var nums = [];
    var from = Math.max(0, page - 2);
    var to = Math.min(max - 1, page + 2);
    if (from > 0) nums.push(0);
    if (from > 1) nums.push(-1);
    for (var p = from; p <= to; p++) nums.push(p);
    if (to < max - 2) nums.push(-1);
    if (to < max - 1) nums.push(max - 1);
    pager.innerHTML =
      '<button type="button" data-page="prev"' + (page === 0 ? ' disabled' : '') + '>‹</button>' +
      nums.map(function (p) {
        if (p < 0) return '<span class="gn-gap">…</span>';
        return '<button type="button" data-page="' + p + '"' + (p === page ? ' class="on"' : '') + '>' + (p + 1) + '</button>';
      }).join('') +
      '<button type="button" data-page="next"' + (page >= max - 1 ? ' disabled' : '') + '>›</button>' +
      '<span class="gn-count">' + (start + 1) + '–' + (start + slice.length) + ' of ' + items.length + '</span>';
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
    var maxW = 900;
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
  var PROMPT = 'This is a screenshot of an X post, replies, or comments. Extract only the useful human sentences. Return JSON only: {"notes":["sentence"]}. One note per tweet or reply, in the person\'s own words. Drop names, @handles, times, view counts, likes, ads, buttons, and "Post your reply". Do not invent text. If nothing useful is readable, return {"notes":[]}.';
  function noteLine(value, depth) {
    if (depth > 4 || value == null) return [];
    if (typeof value === 'string' || typeof value === 'number') {
      var s = String(value).replace(/\s+/g, ' ').replace(/^[\s\-\"\u201c\u201d']+|[\s\"\u201c\u201d']+$/g, '').trim();
      if (!s || s === '[object Object]' || s.indexOf('[object Object]') >= 0) return [];
      if ((s.match(/[a-z]/gi) || []).length < 3) return [];
      if (/^(post your reply|relevant|view quotes|following|show more|reply|ad)$/i.test(s)) return [];
      return [s];
    }
    if (Array.isArray(value)) {
      var out = [];
      value.forEach(function (v) { out = out.concat(noteLine(v, depth + 1)); });
      return out;
    }
    if (typeof value === 'object') {
      var prefer = ['text', 'note', 'sentence', 'content', 'line', 'quote', 'body', 'message', 'caption'];
      for (var i = 0; i < prefer.length; i++) {
        if (value[prefer[i]] != null) {
          var hit = noteLine(value[prefer[i]], depth + 1);
          if (hit.length) return hit;
        }
      }
      var rest = [];
      Object.keys(value).forEach(function (k) { rest = rest.concat(noteLine(value[k], depth + 1)); });
      var sentences = rest.filter(function (line) { return line.split(/\s+/).length >= 3; });
      return sentences.length ? sentences : rest;
    }
    return [];
  }
  function notesFromAi(raw) {
    var text = '';
    if (typeof raw === 'string') text = raw;
    else if (raw && typeof raw.text === 'string') text = raw.text;
    else if (raw && raw.message && typeof raw.message.content === 'string') text = raw.message.content;
    else if (raw && raw.message && Array.isArray(raw.message.content)) text = raw.message.content.map(function (p) { return p && (p.text || p.content) || ''; }).join('\n');
    else {
      try { text = JSON.stringify(raw || ''); } catch (e) { text = ''; }
    }
    var notes = [];
    var match = String(text).match(/\{[\s\S]*\}/);
    if (match) {
      try {
        var parsed = JSON.parse(match[0]);
        if (parsed && parsed.notes != null) notes = noteLine(parsed.notes, 0);
        else if (Array.isArray(parsed)) notes = noteLine(parsed, 0);
      } catch (e) {}
    }
    if (!notes.length) notes = noteLine(String(text).split(/\n/), 0);
    var seen = {};
    return notes.filter(function (n) {
      var k = n.toLowerCase();
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });
  }
  function shotBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error('Could not read that image'));
        else resolve(blob);
      }, 'image/jpeg', 0.68);
    });
  }
  function blobB64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var s = String(reader.result || '');
        resolve(s.slice(s.indexOf(',') + 1));
      };
      reader.onerror = function () { reject(new Error('Could not read that image')); };
      reader.readAsDataURL(blob);
    });
  }
  async function readWithCloudflare(b64) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 25000);
    try {
      var res = await fetch('https://trading-ohlcv.sasipudi.workers.dev/golden-read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: b64 }),
        signal: ctrl.signal
      });
      var data = await res.json();
      if (!data || !data.ok || !data.notes) throw new Error((data && data.error) || 'Cloudflare reader missed');
      return notesFromAi(JSON.stringify({ notes: data.notes }));
    } finally {
      clearTimeout(timer);
    }
  }
  function loadPuter() {
    if (window.puter && window.puter.ai) return Promise.resolve(window.puter);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://js.puter.com/v2/';
      s.onload = function () {
        if (window.puter && window.puter.ai) resolve(window.puter);
        else reject(new Error('AI reader failed to start'));
      };
      s.onerror = function () { reject(new Error('AI reader failed to load')); };
      document.head.appendChild(s);
    });
  }
  async function readWithPuter(blob) {
    var puter = await loadPuter();
    var file = new File([blob], 'note.jpg', { type: 'image/jpeg' });
    var models = ['openai/gpt-5.4-nano', 'google/gemini-2.5-flash'];
    var last = null;
    for (var i = 0; i < models.length; i++) {
      try {
        var raw = await puter.ai.chat(PROMPT, file, { model: models[i] });
        var notes = notesFromAi(raw);
        if (notes.length) return notes;
        last = new Error('No useful lines in that screenshot');
      } catch (e) {
        last = e;
      }
    }
    throw last || new Error('AI reader failed');
  }
  async function readShot(canvas) {
    var blob = await shotBlob(canvas);
    var b64 = await blobB64(blob);
    try {
      var cloud = await readWithCloudflare(b64);
      if (cloud.length) return cloud;
    } catch (e) {}
    return readWithPuter(blob);
  }
  async function readFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length || busy) return;
    busy = true;
    var kept = 0;
    var missed = 0;
    var missed = 0;
    try {
      for (var n = 0; n < files.length; n++) {
        setStatus('Reading ' + (n + 1) + ' of ' + files.length + ' with AI…');
        var img = new Image();
        var url = URL.createObjectURL(files[n]);
        var canvas = null;
        try {
          await new Promise(function (resolve, reject) {
            img.onload = resolve;
            img.onerror = function () { reject(new Error('bad image')); };
            img.src = url;
          });
          canvas = trimShot(img);
          var lines = await readShot(canvas);
          if (!lines.length) missed++;
          var now = Date.now();
          lines.forEach(function (text, i) {
            items.unshift({ id: now.toString(36) + n.toString(36) + i.toString(36) + Math.random().toString(36).slice(2, 5), text: text, t: now + n * 1000 + i });
            kept++;
          });
          page = 0;
          saveLocal();
          paint();
        } catch (e) {
          missed++;
          setStatus(String(e && e.message ? e.message : e));
        } finally {
          URL.revokeObjectURL(url);
          destroyImage(img, canvas);
        }
      }
      setStatus(kept + ' notes from ' + files.length + ' images' + (missed ? ' · ' + missed + ' had nothing' : '') + ' · images discarded');
      persist();
    } catch (e) {
      setStatus(String(e && e.message ? e.message : e));
    } finally {
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
  function solo(on) {
    var main = document.querySelector('main');
    if (!main) return;
    Array.prototype.forEach.call(main.children, function (el) {
      if (el.id === 'tf-tabs' || el.id === 'dip-alert' || el.id === 'gnotes-panel') return;
      if (on) {
        if (el.getAttribute('data-gn-prev') == null) el.setAttribute('data-gn-prev', el.style.display || ' ');
        el.style.display = 'none';
      } else if (el.getAttribute('data-gn-prev') != null) {
        var prev = el.getAttribute('data-gn-prev');
        el.style.display = prev === ' ' ? '' : prev;
        el.removeAttribute('data-gn-prev');
      }
    });
  }
  function showGoldenNotes(on) {
    var p = $('gnotes-panel');
    if (!p) return;
    if (!on) {
      p.style.display = 'none';
      p.classList.remove('on');
      editing = null;
      solo(false);
      return;
    }
    solo(true);
    hideOthers();
    p.style.display = 'block';
    p.classList.add('on');
    paint();
    persist();
    var tabs = $('tf-tabs');
    if (tabs && tabs.scrollIntoView) tabs.scrollIntoView({ block: 'start' });
  }
  window.showGoldenNotes = showGoldenNotes;

  if (!document.getElementById('gn-style')) {
    var css = document.createElement('style');
    css.id = 'gn-style';
    css.textContent = '#gn-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-top:12px}.gn-sizes{display:flex;align-items:center;gap:6px;color:#a89058;font-size:12px;font-weight:800}.gn-sizes button,.gn-sizes input,#gn-pages button{border:1px solid #3d3420;background:#12100c;color:#f4e7c3;border-radius:999px;min-width:36px;height:34px;padding:0 12px;font-weight:900;cursor:pointer}.gn-sizes button.on,#gn-pages button.on{background:#e6b84d;color:#1a1406;border-color:#e6b84d}.gn-sizes input{width:72px;text-align:center}#gn-pages{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.gn-gap{color:#6d7688;padding:0 2px}.gn-count{color:#a89058;font-size:12px;font-weight:800;margin-left:4px}#gn-pages button:disabled{opacity:.35;cursor:default}.gn-empty{color:#8b93a7;font-weight:700;padding:8px 2px}.gn-card{display:flex;gap:12px;width:100%;text-align:left;border:1px solid #6b5420;background:linear-gradient(180deg,#1a150c,#100e0a);color:#f4e7c3;border-radius:18px;padding:14px;font-weight:700;line-height:1.45;cursor:pointer}.gn-card.on{border-color:#e6b84d}.gn-no{flex:0 0 auto;width:36px;height:36px;border-radius:12px;background:#e6b84d;color:#1a1406;display:flex;align-items:center;justify-content:center;font-weight:900}.gn-body{flex:1;min-width:0}.gn-text{font-size:16px;white-space:pre-wrap}.gn-time{margin-top:8px;color:#a89058;font-size:11px;font-weight:800;letter-spacing:.04em}.gn-card textarea{width:100%;box-sizing:border-box;min-height:110px;border-radius:12px;border:1px solid #e6b84d;background:#0b121a;color:#f4f7fb;font:700 15px/1.45 Inter,system-ui,sans-serif;padding:10px}.gn-row{display:flex;gap:8px;margin-top:8px}.gn-row button{padding:10px 12px;border:0;border-radius:10px;font-weight:900;cursor:pointer;background:#243041;color:#e8eef6}.gn-row button[data-act="save"]{background:#e6b84d;color:#1a1406}.gn-row button[data-act="ask"]{background:#3a1820;color:#ff8a9a}.gn-card .gn-body{display:block;background:none;border:0;color:inherit;font:inherit;text-align:left;padding:0;cursor:pointer}.gn-x{flex:0 0 auto;width:28px;height:28px;margin-top:2px;border-radius:999px;border:1px solid #7a3038;background:#241014;color:#ff8d9c;font:900 18px/1 Inter,system-ui,sans-serif;cursor:pointer;padding:0}.gn-modal{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.66);display:flex;align-items:flex-end;justify-content:center;padding:16px}.gn-modal[hidden]{display:none!important}.gn-sheet{width:min(440px,100%);background:#16130e;border:1px solid #e6b84d;border-radius:20px;padding:18px 16px 16px;color:#f4e7c3;box-shadow:0 18px 50px rgba(0,0,0,.45)}.gn-sheet h3{margin:0;font-size:18px;font-weight:900}.gn-sheet p{margin:8px 0 0;color:#a89058;font-size:13px;font-weight:800}.gn-sheet .gn-modal-line{margin:12px 0 16px;font-size:15px;font-weight:700;line-height:1.4;white-space:pre-wrap}.gn-sheet .gn-row{justify-content:flex-end}.gn-sheet button[data-act="modal-yes"]{background:#3a1820;color:#ff8a9a}';
    document.head.appendChild(css);
  }
  var pendingDelete = null;
  function askDelete(id) {
    var it = null;
    items.forEach(function (row) { if (row.id === id) it = row; });
    if (!it) return;
    pendingDelete = id;
    var line = $('gn-modal-line');
    if (line) line.textContent = it.text;
    var modal = $('gn-modal');
    if (modal) modal.hidden = false;
  }
  function closeAsk() {
    pendingDelete = null;
    var modal = $('gn-modal');
    if (modal) modal.hidden = true;
  }
  function confirmDelete() {
    var id = pendingDelete;
    if (!id) return closeAsk();
    markTomb(id, true);
    items = items.filter(function (it) { return it.id !== id; });
    editing = null;
    closeAsk();
    saveLocal();
    paint();
    persist();
  }
  if (!document.getElementById('gn-modal')) {
    var modal = document.createElement('div');
    modal.id = 'gn-modal';
    modal.className = 'gn-modal';
    modal.hidden = true;
    modal.innerHTML = '<div class="gn-sheet" role="dialog" aria-modal="true"><h3>Are you sure?</h3><p>This note will be deleted.</p><div class="gn-modal-line" id="gn-modal-line"></div><div class="gn-row"><button type="button" data-act="modal-no">Cancel</button><button type="button" data-act="modal-yes">Delete</button></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (ev) {
      var yes = ev.target && ev.target.closest && ev.target.closest('[data-act="modal-yes"]');
      if (yes) { confirmDelete(); return; }
      if (ev.target === modal || (ev.target.closest && ev.target.closest('[data-act="modal-no"]'))) closeAsk();
    });
  }

  loadLocal();
  var pick = $('gn-pick');
  var file = $('gn-file');
  if (pick && file) {
    pick.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () { if (file.files && file.files.length) readFiles(file.files); });
  }
  var tools = $('gn-tools');
  if (tools) tools.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest('[data-size],[data-page]');
    if (!b || b.disabled) return;
    if (b.hasAttribute('data-size')) { setPageSize(b.getAttribute('data-size')); return; }
    var go = b.getAttribute('data-page');
    if (go === 'prev') page = Math.max(0, page - 1);
    else if (go === 'next') page = Math.min(pageCount() - 1, page + 1);
    else page = parseInt(go, 10) || 0;
    editing = null;
    paint();
  });
  var any = $('gn-any');
  if (any) any.addEventListener('change', function () { if (any.value) setPageSize(any.value); });
  var list = $('gn-list');
  if (list) list.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    var id = b.getAttribute('data-id');
    if (act === 'edit') { editing = id; paint(); return; }
    if (act === 'cancel') { editing = null; paint(); return; }
    if (act === 'ask') { askDelete(id); return; }
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
