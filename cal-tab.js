/* Cal — profit rows. Paid is 32% of profit. Remaining sits at the top. */
(function () {
  var KEY = 'cal_rows_v1';
  var TOMB = 'cal_rows_tomb_v1';
  var NKEY = 'cal_notes_v1';
  var NTOMB = 'cal_notes_tomb_v1';
  var PATH = 'data/cal.json';
  var GH = 'https://api.github.com/repos/Sasikar/Trading/contents/' + PATH;
  var RATE = 0.32;
  var rows = [];
  var notes = [];
  var view = 'pay';
  var editing = '';
  var asking = '';
  var nedit = '';
  var nask = '';
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
  function today() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (e) {
      var d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
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
  function shortDate(iso) {
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var p = String(iso || '').split('-');
    var day = String(+p[2] || '');
    var month = months[(+p[1] || 1) - 1] || '';
    return day + ' ' + month;
  }
  function paidOf(profit) {
    return Math.round(Number(profit) * RATE * 100) / 100;
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
  function loadLocal() {
    try { rows = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { rows = []; }
    if (!Array.isArray(rows)) rows = [];
    try { notes = JSON.parse(localStorage.getItem(NKEY) || '[]') || []; } catch (e) { notes = []; }
    if (!Array.isArray(notes)) notes = [];
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) {}
    try { localStorage.setItem(NKEY, JSON.stringify(notes)); } catch (e) {}
  }
  function noteTombs() {
    try {
      var o = JSON.parse(localStorage.getItem(NTOMB) || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch (e) { return {}; }
  }
  function markNoteTomb(id, on) {
    var map = noteTombs();
    if (on) map[id] = Date.now();
    else delete map[id];
    try { localStorage.setItem(NTOMB, JSON.stringify(map)); } catch (e) {}
  }
  function noteText(raw) {
    return String(raw || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function setStatus(text) {
    var el = $('cal-status');
    if (el) el.textContent = text || '';
  }
  function merge(remote) {
    var dead = tombs();
    var map = {};
    rows.concat(remote || []).forEach(function (it) {
      if (!it || !it.id || dead[it.id]) return;
      var profit = num(it.profit);
      var date = String(it.date || '');
      if (profit == null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      var gave = num(it.gave);
      if (gave == null) gave = 0;
      var row = { id: String(it.id), date: date, profit: profit, gave: gave, t: it.t || 0 };
      var prev = map[row.id];
      if (!prev || row.t >= prev.t) map[row.id] = row;
    });
    rows = Object.keys(map).map(function (k) { return map[k]; });
  }
  function mergeNotes(remote) {
    var dead = noteTombs();
    var map = {};
    notes.concat(remote || []).forEach(function (it) {
      if (!it || !it.id || dead[it.id]) return;
      var text = noteText(it.text);
      if (!text) return;
      var row = { id: String(it.id), text: text, t: it.t || 0 };
      var prev = map[row.id];
      if (!prev || row.t >= prev.t) map[row.id] = row;
    });
    notes = Object.keys(map).map(function (k) { return map[k]; });
    notes.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
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
          merge(pj.rows || []);
          mergeNotes(pj.notes || []);
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
        try {
          var pack = decodePack(gj);
          merge(pack.rows || []);
          mergeNotes(pack.notes || []);
          saveLocal();
          paint();
        } catch (e) {}
      } else if (gr.status !== 404) {
        setStatus('Saved on this phone');
        return;
      }
      var body = {
        message: 'Cal rows',
        content: btoa(unescape(encodeURIComponent(JSON.stringify({ updated: new Date().toISOString(), rows: rows, notes: notes }, null, 2)))),
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
  function ordered() {
    return rows.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.t || 0) - (b.t || 0);
    });
  }
  function switchHtml() {
    return '<div class="cal-switch"><button type="button" data-act="tab" data-tab="pay"' + (view === 'pay' ? ' class="on"' : '') + '>Cal</button><button type="button" data-act="tab" data-tab="notes"' + (view === 'notes' ? ' class="on"' : '') + '>Notes</button></div>';
  }
  function paintNotes() {
    var root = $('cal-app');
    if (!root) return;
    var draft = '';
    var old = $('cal-note');
    if (old) draft = old.value;
    var body = notes.map(function (row) {
      if (nedit === row.id) {
        return '<li class="cal-note"><form class="cal-note-edit" data-id="' + esc(row.id) + '"><textarea>' + esc(row.text) + '</textarea><button type="submit">Save</button><button type="button" data-act="cancel">×</button></form></li>';
      }
      return '<li class="cal-note"><p>' + esc(row.text) + '</p><span class="cal-acts"><button type="button" class="cal-pen" data-act="edit" data-id="' + esc(row.id) + '" aria-label="Edit">Edit</button><button type="button" class="cal-x" data-act="ask" data-id="' + esc(row.id) + '" aria-label="Delete">×</button></span></li>';
    }).join('');
    var ask = '';
    if (nask) {
      var hit = null;
      notes.forEach(function (row) { if (row.id === nask) hit = row; });
      if (hit) ask = '<div class="cal-ask">Delete this note?<button type="button" data-act="yes" data-id="' + esc(hit.id) + '">Delete</button><button type="button" data-act="no">Keep</button></div>';
    }
    root.innerHTML = switchHtml() +
      '<form id="cal-note-add" class="cal-note-form"><input id="cal-note" placeholder="Note" value="' + esc(draft) + '" autocomplete="off"><button type="submit">Add</button></form>' +
      '<p id="cal-status"></p>' + ask +
      (notes.length ? '<ul class="cal-notes">' + body + '</ul>' : '');
  }
  function paint() {
    if (view === 'notes') { paintNotes(); return; }
    var root = $('cal-app');
    if (!root) return;
    var list = ordered();
    var taxSum = 0;
    var gaveSum = 0;
    list.forEach(function (row) {
      row.tax = paidOf(row.profit);
      taxSum = Math.round((taxSum + row.tax) * 100) / 100;
      gaveSum = Math.round((gaveSum + (row.gave || 0)) * 100) / 100;
    });
    var remaining = Math.round((taxSum - gaveSum) * 100) / 100;
    var draftDate = today();
    var draftProfit = '';
    var draftGave = '';
    var oldDate = $('cal-date');
    var oldProfit = $('cal-profit');
    var oldGave = $('cal-gave');
    if (oldDate && oldDate.value) draftDate = oldDate.value;
    if (oldProfit) draftProfit = oldProfit.value;
    if (oldGave) draftGave = oldGave.value;
    var draftTax = '';
    var typed = num(draftProfit);
    if (typed != null) draftTax = money(paidOf(typed));
    var body = list.slice().reverse().map(function (row) {
      if (editing === row.id) {
        return '<li class="cal-item"><form class="cal-form" data-id="' + esc(row.id) + '"><label class="cal-date"><span>' + esc(shortDate(row.date)) + '</span><input type="date" value="' + esc(row.date) + '" aria-label="Date"></label><input data-field="profit" inputmode="text" autocapitalize="off" spellcheck="false" value="' + esc(money(row.profit)) + '" placeholder="2L" aria-label="Total profit"><input data-field="tax" readonly tabindex="-1" value="' + esc(money(row.tax)) + '" aria-label="32%"><input data-field="gave" inputmode="text" autocapitalize="off" spellcheck="false" value="' + esc(money(row.gave || 0)) + '" placeholder="50K" aria-label="Paid"><button type="submit">Save</button><button type="button" data-act="cancel" aria-label="Cancel">×</button></form></li>';
      }
      return '<li class="cal-item"><div class="cal-line"><b>' + esc(shortDate(row.date)) + '</b><span>' + money(row.profit) + '</span><span>' + money(row.tax) + '</span><span>' + money(row.gave || 0) + '</span><span class="cal-acts"><button type="button" class="cal-pen" data-act="edit" data-id="' + esc(row.id) + '" aria-label="Edit">Edit</button><button type="button" class="cal-x" data-act="ask" data-id="' + esc(row.id) + '" aria-label="Delete">×</button></span></div></li>';
    }).join('');
    var ask = '';
    if (asking) {
      var hit = null;
      rows.forEach(function (row) { if (row.id === asking) hit = row; });
      if (hit) ask = '<div class="cal-ask">Delete ' + esc(shortDate(hit.date)) + ' · ' + money(hit.profit) + '?<button type="button" data-act="yes" data-id="' + esc(hit.id) + '">Delete</button><button type="button" data-act="no">Keep</button></div>';
    }
    root.innerHTML =
      switchHtml() +
      '<div class="cal-remain"><b>' + money(remaining) + '</b></div>' +
      '<form id="cal-add" class="cal-form"><label class="cal-date"><span>' + esc(shortDate(draftDate)) + '</span><input id="cal-date" type="date" value="' + esc(draftDate) + '" aria-label="Date"></label><input id="cal-profit" data-field="profit" inputmode="text" autocapitalize="off" spellcheck="false" placeholder="2L" value="' + esc(draftProfit) + '" aria-label="Total profit"><input id="cal-tax" data-field="tax" readonly tabindex="-1" placeholder="32%" value="' + esc(draftTax) + '" aria-label="32%"><input id="cal-gave" data-field="gave" inputmode="text" autocapitalize="off" spellcheck="false" placeholder="50K" value="' + esc(draftGave) + '" aria-label="Paid"><button type="submit">Add</button></form>' +
      '<p id="cal-status"></p>' +
      ask +
      (list.length
        ? '<div class="cal-head"><span>Date</span><span>Profit</span><span>32%</span><span>Paid</span><span></span></div><ul class="cal-list">' + body + '</ul>'
        : '<p class="cal-empty"></p>');
  }
  function add(date, profitRaw, gaveRaw) {
    var profit = num(profitRaw);
    var gave = num(gaveRaw);
    if (gave == null) gave = 0;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || profit == null) return;
    rows.push({ id: nid(), date: date, profit: profit, gave: gave, t: Date.now() });
    var profitBox = $('cal-profit');
    var gaveBox = $('cal-gave');
    var taxBox = $('cal-tax');
    if (profitBox) profitBox.value = '';
    if (gaveBox) gaveBox.value = '';
    if (taxBox) taxBox.value = '';
    saveLocal();
    paint();
    var again = $('cal-profit');
    if (again) again.focus();
    persist();
  }
  function saveEdit(id, date, profitRaw, gaveRaw) {
    var profit = num(profitRaw);
    var gave = num(gaveRaw);
    if (gave == null) gave = 0;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || profit == null) return;
    rows.forEach(function (row) {
      if (row.id !== id) return;
      row.date = date;
      row.profit = profit;
      row.gave = gave;
      row.t = Date.now();
    });
    editing = '';
    saveLocal();
    paint();
    persist();
  }
  function remove(id) {
    markTomb(id, true);
    rows = rows.filter(function (row) { return row.id !== id; });
    asking = '';
    editing = '';
    saveLocal();
    paint();
    persist();
  }
  function addNote(raw) {
    var text = noteText(raw);
    if (!text) return;
    notes.unshift({ id: nid(), text: text, t: Date.now() });
    var box = $('cal-note');
    if (box) box.value = '';
    saveLocal();
    paint();
    var again = $('cal-note');
    if (again) again.focus();
    persist();
  }
  function saveNote(id, raw) {
    var text = noteText(raw);
    if (!text) return;
    notes.forEach(function (row) {
      if (row.id !== id) return;
      row.text = text;
      row.t = Date.now();
    });
    nedit = '';
    saveLocal();
    paint();
    persist();
  }
  function removeNote(id) {
    markNoteTomb(id, true);
    notes = notes.filter(function (row) { return row.id !== id; });
    nask = '';
    nedit = '';
    saveLocal();
    paint();
    persist();
  }
  function solo(on) {
    document.body.classList.toggle('cal-on', !!on);
  }
  function showCal(on) {
    var p = $('cal-panel');
    if (!p) return;
    if (!on) {
      p.style.display = 'none';
      p.classList.remove('on');
      solo(false);
      return;
    }
    var panels = $('tf-panels');
    if (panels) { panels.classList.add('hidden'); panels.style.display = 'none'; }
    solo(true);
    p.style.display = 'block';
    p.classList.add('on');
    paint();
    var tabs = $('tf-tabs');
    if (tabs && tabs.scrollIntoView) tabs.scrollIntoView({ block: 'start' });
  }
  window.showCal = showCal;

  if (!document.getElementById('cal-style')) {
    var css = document.createElement('style');
    css.id = 'cal-style';
    css.textContent = '#cal-panel .head p,#cal-panel .source{display:none!important}#cal-panel .card{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}.cal-remain{border-radius:18px;padding:16px 16px 14px;background:#2a2414;color:#f6e7b8;margin-bottom:12px}.cal-remain b{display:block;font-size:34px;line-height:1;letter-spacing:-.04em}.cal-switch{display:flex;gap:8px;margin:0 0 12px}.cal-switch button{border:0;border-radius:999px;padding:8px 14px;background:#1a222e;color:#c5d0dc;font-weight:800;cursor:pointer}.cal-switch button.on{background:#1f8a4d;color:#fff}.cal-note-form{display:flex;gap:6px;align-items:center}.cal-note-form input,.cal-note-edit textarea{flex:1;min-width:0;box-sizing:border-box;padding:8px 10px;border:0;border-radius:10px;background:#141c27;color:#f4f7fb;font:700 15px/1.35 Inter,system-ui,sans-serif}.cal-note-edit{display:flex;gap:6px;align-items:flex-start;width:100%}.cal-note-edit textarea{min-height:72px;resize:vertical}.cal-note-edit button,.cal-note-form button{flex:0 0 auto;border:0;border-radius:10px;padding:8px 10px;background:#e6c878;color:#1a1406;font-weight:900;cursor:pointer}.cal-note-edit button[data-act=cancel]{background:#2a1a22;color:#ff8b98}.cal-notes{list-style:none;margin:8px 0 0;padding:0}.cal-note{display:flex;gap:8px;align-items:flex-start;padding:12px 0;border-bottom:1px solid #1c2733}.cal-note p{flex:1;min-width:0;margin:0;white-space:pre-wrap;word-break:break-word;font-weight:700}.cal-form{display:flex;flex-wrap:nowrap;gap:4px;align-items:center}.cal-form input{flex:1 1 0;width:auto;min-width:0;box-sizing:border-box;padding:8px 6px;border:0;border-radius:10px;background:#141c27;color:#f4f7fb;font:800 13px/1.2 Inter,system-ui,sans-serif;color-scheme:dark}.cal-date{position:relative;flex:0 0 58px;height:34px}.cal-date span{display:flex;align-items:center;justify-content:center;height:34px;border-radius:10px;background:#141c27;color:#f4f7fb;font-size:12px;font-weight:800}.cal-date input{position:absolute;inset:0;width:100%;height:100%;opacity:0;padding:0}.cal-form input[readonly]{background:#0d141c;color:#e6c878}.cal-form button{flex:0 0 auto;border:0;border-radius:10px;padding:8px 10px;background:#e6c878;color:#1a1406;font-weight:900;font-size:13px;cursor:pointer}.cal-form button[data-act=cancel]{background:#2a1a22;color:#ff8b98}#cal-status{min-height:18px;margin:8px 0 0;color:#8b95a5;font-size:12px;font-weight:700}#cal-panel,#cal-app{max-width:100%;overflow-x:hidden}.cal-head,.cal-line{display:grid;grid-template-columns:52px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 64px;gap:4px;align-items:center}.cal-head{margin-top:14px;color:#8b95a5;font-size:11px;font-weight:800;text-transform:uppercase}.cal-list{list-style:none;margin:0;padding:0}.cal-line{padding:12px 0;border-bottom:1px solid #1c2733;font-weight:800;font-size:14px}.cal-line span,.cal-line b{min-width:0;overflow:hidden;text-overflow:ellipsis}.cal-acts{display:flex;gap:4px;justify-content:flex-end}.cal-pen,.cal-x{border:0;border-radius:999px;height:28px;cursor:pointer;font-weight:800}.cal-pen{padding:0 8px;background:#243044;color:#f4f7fb;font-size:12px}.cal-x{width:28px;background:#2a1a22;color:#ff8b98;font-size:18px}.cal-ask{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px;color:#ffb4be;font-weight:800}.cal-ask button{border:0;border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer}.cal-ask button[data-act=yes]{background:#ff6f7c;color:#1a0c10}.cal-ask button[data-act=no]{background:#243044;color:#f4f7fb}.cal-empty{margin:14px 0 0;color:#8b95a5;font-weight:700}body.cal-on main>section.section,body.cal-on main>.trend-panel:not(#cal-panel),body.cal-on main>.struct-trend-panel,body.cal-on main>.macro-panel,body.cal-on #tf-panels{display:none!important}body.cal-on #cal-panel{display:block!important}';
    document.head.appendChild(css);
  }
  loadLocal();
  var root = $('cal-app');
  if (root) {
    root.addEventListener('submit', function (ev) {
      var form = ev.target;
      if (!form) return;
      ev.preventDefault();
      if (form.id === 'cal-add') {
        add(($('cal-date') || {}).value, ($('cal-profit') || {}).value, ($('cal-gave') || {}).value);
        return;
      }
      if (form.id === 'cal-note-add') {
        addNote(($('cal-note') || {}).value);
        return;
      }
      if (form.classList && form.classList.contains('cal-note-edit')) {
        var area = form.querySelector('textarea');
        saveNote(form.getAttribute('data-id'), area && area.value);
        return;
      }
      if (form.classList && form.classList.contains('cal-form')) {
        var profit = form.querySelector('[data-field="profit"]');
        var gave = form.querySelector('[data-field="gave"]');
        var date = form.querySelector('input[type="date"]');
        saveEdit(form.getAttribute('data-id'), date && date.value, profit && profit.value, gave && gave.value);
      }
    });
    root.addEventListener('input', function (ev) {
      var box = ev.target;
      if (!box || box.getAttribute('data-field') !== 'profit') return;
      var form = box.closest && box.closest('form');
      var tax = form && form.querySelector('[data-field="tax"]');
      if (!tax) return;
      var n = num(box.value);
      tax.value = n == null ? '' : money(paidOf(n));
    });
    root.addEventListener('change', function (ev) {
      var box = ev.target;
      if (!box || box.type !== 'date') return;
      var span = box.parentNode && box.parentNode.querySelector('span');
      if (span) span.textContent = shortDate(box.value);
    });
    root.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var id = btn.getAttribute('data-id') || '';
      if (act === 'tab') { view = btn.getAttribute('data-tab') || 'pay'; editing = ''; asking = ''; nedit = ''; nask = ''; paint(); return; }
      if (view === 'notes') {
        if (act === 'edit') { nedit = id; nask = ''; paint(); }
        if (act === 'cancel') { nedit = ''; paint(); }
        if (act === 'ask') { nask = id; nedit = ''; paint(); }
        if (act === 'no') { nask = ''; paint(); }
        if (act === 'yes') removeNote(id);
        return;
      }
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
    if (!b || b.getAttribute('data-tf') === 'cal') return;
    showCal(false);
  }, true);
  fetch(PATH + '?t=' + Date.now(), { cache: 'no-store' }).then(function (res) {
    return res.ok ? res.json() : null;
  }).then(function (data) {
    if (!data) return;
    merge(data.rows || []);
    mergeNotes(data.notes || []);
    saveLocal();
    if (document.body.classList.contains('cal-on')) paint();
  }).catch(function () {});
})();
