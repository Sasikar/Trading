/* Banned list — add a value, delete it, keep it saved. */
(function () {
  var KEY = 'bn_items_v1';
  var TOMB = 'bn_tomb_v1';
  var PATH = 'data/banned.json';
  var GH = 'https://api.github.com/repos/Sasikar/Trading/contents/' + PATH;
  var items = [];
  var syncing = false;
  var asking = '';
  var editing = '';
  var PEN = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

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
  function keep(raw) { return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 500); }
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
    var el = $('bn-status');
    if (el) el.textContent = text || '';
  }
  function merge(remote) {
    var dead = tombs();
    var map = {};
    items.concat(remote || []).forEach(function (it) {
      if (!it || !it.id || !it.text || dead[it.id]) return;
      var text = keep(it.text);
      if (!text) return;
      var prev = map[it.id];
      if (!prev || (it.t || 0) >= (prev.t || 0)) map[it.id] = { id: String(it.id), text: text, t: it.t || 0 };
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
        message: 'My rules',
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
    var list = $('bn-list');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<li class="bn-empty">No rules yet.</li>';
      return;
    }
    list.innerHTML = items.map(function (it) {
      if (editing === it.id) {
        return '<li class="bn-row"><form class="bn-edit" data-id="' + esc(it.id) + '"><textarea>' + esc(it.text) + '</textarea><span class="bn-edit-actions"><button type="submit">Save</button><button type="button" data-act="cancel">Cancel</button></span></form></li>';
      }
      return '<li class="bn-row"><span class="bn-text">' + esc(it.text) + '</span><span class="bn-actions"><button type="button" class="bn-pen" data-act="edit" data-id="' + esc(it.id) + '" aria-label="Edit">' + PEN + '</button><button type="button" class="bn-x" data-act="delete" data-id="' + esc(it.id) + '" aria-label="Delete">×</button></span></li>';
    }).join('');
    if (editing) {
      var field = list.querySelector('textarea');
      if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
    }
  }
  function saveEdit(id, raw) {
    var text = keep(raw);
    if (!text) return;
    items.forEach(function (it) {
      if (it.id !== id) return;
      it.text = text;
      it.t = Date.now();
    });
    editing = '';
    saveLocal();
    paint();
    persist();
  }
  function add(raw) {
    var text = keep(raw);
    if (!text) return;
    if (items.some(function (it) { return it.text.toLowerCase() === text.toLowerCase(); })) return;
    items.unshift({ id: nid(), text: text, t: Date.now() });
    saveLocal();
    paint();
    persist();
  }
  function remove(id) {
    markTomb(id, true);
    items = items.filter(function (it) { return it.id !== id; });
    asking = '';
    saveLocal();
    paint();
    persist();
  }
  function openAsk(id) {
    var it = null;
    items.forEach(function (row) { if (row.id === id) it = row; });
    if (!it) return;
    asking = id;
    var modal = $('bn-modal');
    var label = $('bn-ask');
    if (label) label.textContent = it.text;
    if (modal) modal.hidden = false;
  }
  function closeAsk() {
    asking = '';
    var modal = $('bn-modal');
    if (modal) modal.hidden = true;
  }

  loadLocal();
  paint();
  var form = $('bn-form');
  if (form) form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var input = $('bn-input');
    add(input && input.value);
    if (input) input.value = '';
  });
  var list = $('bn-list');
  if (list) {
    list.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var id = btn.getAttribute('data-id') || '';
      if (act === 'edit') { editing = id; paint(); }
      if (act === 'cancel') { editing = ''; paint(); }
      if (act === 'delete') openAsk(id);
    });
    list.addEventListener('submit', function (ev) {
      var form = ev.target;
      if (!form || !form.classList || !form.classList.contains('bn-edit')) return;
      ev.preventDefault();
      var field = form.querySelector('textarea');
      saveEdit(form.getAttribute('data-id'), field && field.value);
    });
  }
  var yes = $('bn-yes');
  var no = $('bn-no');
  if (yes) yes.addEventListener('click', function () { if (asking) remove(asking); closeAsk(); });
  if (no) no.addEventListener('click', closeAsk);
  fetch(PATH + '?t=' + Date.now(), { cache: 'no-store' }).then(function (res) {
    return res.ok ? res.json() : null;
  }).then(function (data) {
    if (!data) return;
    merge(data.items || []);
    saveLocal();
    paint();
  }).catch(function () {});
})();
