/* Mandates — a name, a hyphen, an amount in K or L, total above. */
(function () {
  var KEY = 'md_items_v1';
  var TOMB = 'md_tomb_v1';
  var PATH = 'data/mandates.json';
  var GH = 'https://api.github.com/repos/Sasikar/Trading/contents/' + PATH;
  var items = [];
  var editing = '';
  var asking = '';
  var syncing = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      if (c === '&') return '&' + 'amp;';
      if (c === '<') return '&' + 'lt;';
      if (c === '>') return '&' + 'gt;';
      return '&' + 'quot;';
    });
  }
  function token() {
    try { return localStorage.getItem('trading_github_token') || localStorage.getItem('trading_tax_github_token') || ''; }
    catch (e) { return ''; }
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
  function money(n) {
    n = Number(n);
    if (!isFinite(n)) n = 0;
    var sign = n < 0 ? '-' : '';
    var a = Math.abs(n);
    var unit = '';
    if (a >= 100000) { a = a / 100000; unit = 'L'; }
    else if (a >= 1000) { a = a / 1000; unit = 'K'; }
    var s = (Math.round(a * 100) / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    return sign + s + unit;
  }
  function num(raw) {
    var s = String(raw == null ? '' : raw).replace(/,/g, '').trim();
    if (!s) return null;
    var m = s.match(/^(-?\d+(?:\.\d+)?)\s*([kKlL])?$/);
    if (!m) return null;
    var n = Number(m[1]);
    if (!isFinite(n)) return null;
    var unit = (m[2] || '').toLowerCase();
    if (unit === 'k') n = n * 1000;
    if (unit === 'l') n = n * 100000;
    return Math.round(n * 100) / 100;
  }
  function keep(raw) { return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 80); }
  function loadLocal() {
    try { items = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { items = []; }
    if (!Array.isArray(items)) items = [];
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
  }
  function setStatus(text) {
    var el = $('md-status');
    if (el) el.textContent = text || '';
  }
  function merge(remote) {
    var dead = tombs();
    var map = {};
    items.concat(remote || []).forEach(function (it) {
      if (!it || !it.id || dead[it.id]) return;
      var text = keep(it.text);
      var amount = num(it.amount);
      if (!text || amount == null) return;
      var row = { id: String(it.id), text: text, amount: amount, t: it.t || 0 };
      var prev = map[row.id];
      if (!prev || row.t >= prev.t) map[row.id] = row;
    });
    items = Object.keys(map).map(function (k) { return map[k]; });
    items.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
  }
  function decodePack(gj) {
    var text = decodeURIComponent(escape(atob(String(gj.content || '').replace(/\s/g, ''))));
    var data = JSON.parse(text);
    return data && typeof data === 'object' ? data : {};
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
      if (!tok) { setStatus('Saved on this phone'); return; }
      var sha = null;
      var gr = await fetch(GH + '?ref=master', {
        headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' },
        cache: 'no-store'
      });
      if (gr.ok) {
        var gj = await gr.json();
        sha = gj.sha;
        try { merge(decodePack(gj).items || []); saveLocal(); paint(); } catch (e) {}
      } else if (gr.status !== 404) {
        setStatus('Saved on this phone');
        return;
      }
      var body = {
        message: 'Mandates',
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
  function paint() {
    var root = $('md-app');
    if (!root) return;
    var total = 0;
    items.forEach(function (row) { total = Math.round((total + row.amount) * 100) / 100; });
    var draftText = '';
    var draftAmt = '';
    var oldText = $('md-text');
    var oldAmt = $('md-amt');
    if (oldText) draftText = oldText.value;
    if (oldAmt) draftAmt = oldAmt.value;
    var body = items.map(function (row) {
      if (editing === row.id) {
        return '<li class="md-row"><form class="md-form" data-id="' + esc(row.id) + '"><input data-field="text" value="' + esc(row.text) + '" maxlength="80" aria-label="Text"><span class="md-hy">-</span><input data-field="amt" value="' + esc(money(row.amount)) + '" placeholder="2L" aria-label="Amount"><button type="submit">Save</button><button type="button" data-act="cancel" aria-label="Cancel">×</button></form></li>';
      }
      return '<li class="md-row"><span class="md-name">' + esc(row.text) + '</span><span class="md-hy">-</span><b>' + money(row.amount) + '</b><span class="md-acts"><button type="button" class="md-pen" data-act="edit" data-id="' + esc(row.id) + '" aria-label="Edit">Edit</button><button type="button" class="md-x" data-act="ask" data-id="' + esc(row.id) + '" aria-label="Delete">×</button></span></li>';
    }).join('');
    var ask = '';
    if (asking) {
      var hit = null;
      items.forEach(function (row) { if (row.id === asking) hit = row; });
      if (hit) ask = '<div class="md-ask">Delete ' + esc(hit.text) + '?<button type="button" data-act="yes" data-id="' + esc(hit.id) + '">Delete</button><button type="button" data-act="no">Keep</button></div>';
    }
    root.innerHTML =
      '<div class="md-total"><b>' + money(total) + '</b></div>' +
      '<form id="md-add" class="md-form"><input id="md-text" data-field="text" maxlength="80" placeholder="Text" value="' + esc(draftText) + '" aria-label="Text"><span class="md-hy">-</span><input id="md-amt" data-field="amt" placeholder="2L" value="' + esc(draftAmt) + '" aria-label="Amount"><button type="submit">Add</button></form>' +
      '<p id="md-status"></p>' + ask +
      (items.length ? '<ul class="md-list">' + body + '</ul>' : '');
  }
  function add(textRaw, amtRaw) {
    var text = keep(textRaw);
    var amount = num(amtRaw);
    if (!text || amount == null) return;
    items.unshift({ id: nid(), text: text, amount: amount, t: Date.now() });
    saveLocal();
    paint();
    var box = $('md-text');
    if (box) box.focus();
    persist();
  }
  function saveEdit(id, textRaw, amtRaw) {
    var text = keep(textRaw);
    var amount = num(amtRaw);
    if (!text || amount == null) return;
    items.forEach(function (row) {
      if (row.id !== id) return;
      row.text = text;
      row.amount = amount;
      row.t = Date.now();
    });
    editing = '';
    saveLocal();
    paint();
    persist();
  }
  function remove(id) {
    markTomb(id, true);
    items = items.filter(function (row) { return row.id !== id; });
    asking = '';
    editing = '';
    saveLocal();
    paint();
    persist();
  }
  function showMandates(on) {
    var p = $('md-panel');
    if (!p) return;
    document.body.classList.toggle('md-on', !!on);
    if (!on) {
      p.style.display = 'none';
      p.classList.remove('on');
      return;
    }
    var panels = $('tf-panels');
    if (panels) { panels.classList.add('hidden'); panels.style.display = 'none'; }
    p.style.display = 'block';
    p.classList.add('on');
    paint();
    var tabs = $('tf-tabs');
    if (tabs && tabs.scrollIntoView) tabs.scrollIntoView({ block: 'start' });
  }
  window.showMandates = showMandates;

  if (!document.getElementById('md-style')) {
    var css = document.createElement('style');
    css.id = 'md-style';
    css.textContent = '#md-panel .head p,#md-panel .source{display:none!important}#md-panel .card{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}#md-panel,#md-app{max-width:100%;overflow-x:hidden}.md-total{border-radius:18px;padding:16px;background:#2a2414;color:#f6e7b8;margin-bottom:12px}.md-total b{display:block;font-size:34px;line-height:1;letter-spacing:-.04em}.md-form{display:flex;flex-wrap:nowrap;gap:6px;align-items:center}.md-form input{flex:1;min-width:0;box-sizing:border-box;padding:8px 10px;border:0;border-radius:10px;background:#141c27;color:#f4f7fb;font:800 14px/1.2 Inter,system-ui,sans-serif}.md-form input[data-field=amt]{flex:0 0 72px}.md-hy{flex:0 0 auto;color:#8b95a5;font-weight:800}.md-form button{flex:0 0 auto;border:0;border-radius:10px;padding:8px 10px;background:#e6c878;color:#1a1406;font-weight:900;cursor:pointer}.md-form button[data-act=cancel]{background:#2a1a22;color:#ff8b98}#md-status{min-height:18px;margin:8px 0 0;color:#8b95a5;font-size:12px;font-weight:700}.md-list{list-style:none;margin:8px 0 0;padding:0}.md-row{display:flex;align-items:center;gap:6px;padding:12px 0;border-bottom:1px solid #1c2733}.md-name{flex:1;min-width:0;font-weight:800;word-break:break-word}.md-row b{flex:0 0 auto;font-size:15px}.md-acts{display:flex;gap:4px;margin-left:auto}.md-pen,.md-x{border:0;border-radius:999px;height:28px;cursor:pointer;font-weight:800}.md-pen{padding:0 8px;background:#243044;color:#f4f7fb;font-size:12px}.md-x{width:28px;background:#2a1a22;color:#ff8b98;font-size:18px}.md-ask{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px;color:#ffb4be;font-weight:800}.md-ask button{border:0;border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer}.md-ask button[data-act=yes]{background:#ff6f7c;color:#1a0c10}.md-ask button[data-act=no]{background:#243044;color:#f4f7fb}body.md-on main>section.section,body.md-on main>.trend-panel:not(#md-panel),body.md-on main>.struct-trend-panel,body.md-on main>.macro-panel,body.md-on #tf-panels{display:none!important}body.md-on #md-panel{display:block!important}';
    document.head.appendChild(css);
  }
  loadLocal();
  var root = $('md-app');
  if (root) {
    root.addEventListener('submit', function (ev) {
      var form = ev.target;
      if (!form) return;
      ev.preventDefault();
      if (form.id === 'md-add') {
        add(($('md-text') || {}).value, ($('md-amt') || {}).value);
        return;
      }
      var text = form.querySelector('[data-field="text"]');
      var amt = form.querySelector('[data-field="amt"]');
      saveEdit(form.getAttribute('data-id'), text && text.value, amt && amt.value);
    });
    root.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var id = btn.getAttribute('data-id') || '';
      if (act === 'edit') { editing = id; asking = ''; paint(); }
      if (act === 'cancel') { editing = ''; paint(); }
      if (act === 'ask') { asking = id; editing = ''; paint(); }
      if (act === 'no') { asking = ''; paint(); }
      if (act === 'yes') remove(id);
    });
  }
  var tabs = $('tf-tabs');
  if (tabs) tabs.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
    if (!b || b.getAttribute('data-tf') === 'mandates') return;
    showMandates(false);
  }, true);
  fetch(PATH + '?t=' + Date.now(), { cache: 'no-store' }).then(function (res) {
    return res.ok ? res.json() : null;
  }).then(function (data) {
    if (!data) return;
    merge(data.items || []);
    saveLocal();
    if (document.body.classList.contains('md-on')) paint();
  }).catch(function () {});
})();
