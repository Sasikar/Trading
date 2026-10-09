/* Cal — profit rows. Paid is 32% of profit. Remaining sits at the top. */
(function () {
  var KEY = 'cal_rows_v1';
  var TOMB = 'cal_rows_tomb_v1';
  var PATH = 'data/cal.json';
  var GH = 'https://api.github.com/repos/Sasikar/Trading/contents/' + PATH;
  var RATE = 0.32;
  var rows = [];
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
    var n = Number(String(raw == null ? '' : raw).replace(/,/g, '').trim());
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  function loadLocal() {
    try { rows = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { rows = []; }
    if (!Array.isArray(rows)) rows = [];
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) {}
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
  function decodeContent(gj) {
    var text = decodeURIComponent(escape(atob(String(gj.content || '').replace(/\s/g, ''))));
    var data = JSON.parse(text);
    return (data && data.rows) || [];
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
        message: 'Cal rows',
        content: btoa(unescape(encodeURIComponent(JSON.stringify({ updated: new Date().toISOString(), rows: rows }, null, 2)))),
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
  function paint() {
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
        return '<li class="cal-item"><form class="cal-form" data-id="' + esc(row.id) + '"><input type="date" value="' + esc(row.date) + '" aria-label="Date"><input data-field="profit" inputmode="decimal" value="' + esc(row.profit) + '" placeholder="Total profit" aria-label="Total profit"><input data-field="tax" readonly tabindex="-1" value="' + esc(money(row.tax)) + '" aria-label="32%"><input data-field="gave" inputmode="decimal" value="' + esc(row.gave) + '" placeholder="Paid" aria-label="Paid"><button type="submit">Save</button><button type="button" data-act="cancel">Cancel</button></form></li>';
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
      '<div class="cal-remain"><b>' + money(remaining) + '</b></div>' +
      '<form id="cal-add" class="cal-form"><input id="cal-date" type="date" value="' + esc(draftDate) + '" aria-label="Date"><input id="cal-profit" data-field="profit" inputmode="decimal" placeholder="Total profit" value="' + esc(draftProfit) + '" aria-label="Total profit"><input id="cal-tax" data-field="tax" readonly tabindex="-1" placeholder="32%" value="' + esc(draftTax) + '" aria-label="32%"><input id="cal-gave" data-field="gave" inputmode="decimal" placeholder="Paid" value="' + esc(draftGave) + '" aria-label="Paid"><button type="submit">Add</button></form>' +
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
    saveLocal();
    paint();
    var profitBox = $('cal-profit');
    if (profitBox) { profitBox.value = ''; profitBox.focus(); }
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
    css.textContent = '#cal-panel .head p,#cal-panel .source{display:none!important}#cal-panel .card{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}.cal-remain{border-radius:18px;padding:16px 16px 14px;background:#2a2414;color:#f6e7b8;margin-bottom:12px}.cal-remain b{display:block;font-size:34px;line-height:1;letter-spacing:-.04em}.cal-form{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cal-form input{grid-column:1 / -1;width:100%;min-width:0;box-sizing:border-box;padding:12px 14px;border:0;border-radius:14px;background:#141c27;color:#f4f7fb;font:700 16px/1.3 Inter,system-ui,sans-serif;color-scheme:dark}.cal-form input[readonly]{background:#0d141c;color:#e6c878}.cal-form button{border:0;border-radius:14px;padding:12px 16px;background:#e6c878;color:#1a1406;font-weight:900;cursor:pointer}.cal-form button[data-act=cancel]{background:#243044;color:#f4f7fb}#cal-status{min-height:18px;margin:8px 0 0;color:#8b95a5;font-size:12px;font-weight:700}#cal-panel,#cal-app{max-width:100%;overflow-x:hidden}.cal-head,.cal-line{display:grid;grid-template-columns:52px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 64px;gap:4px;align-items:center}.cal-head{margin-top:14px;color:#8b95a5;font-size:11px;font-weight:800;text-transform:uppercase}.cal-list{list-style:none;margin:0;padding:0}.cal-line{padding:12px 0;border-bottom:1px solid #1c2733;font-weight:800;font-size:14px}.cal-line span,.cal-line b{min-width:0;overflow:hidden;text-overflow:ellipsis}.cal-acts{display:flex;gap:4px;justify-content:flex-end}.cal-pen,.cal-x{border:0;border-radius:999px;height:28px;cursor:pointer;font-weight:800}.cal-pen{padding:0 8px;background:#243044;color:#f4f7fb;font-size:12px}.cal-x{width:28px;background:#2a1a22;color:#ff8b98;font-size:18px}.cal-ask{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px;color:#ffb4be;font-weight:800}.cal-ask button{border:0;border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer}.cal-ask button[data-act=yes]{background:#ff6f7c;color:#1a0c10}.cal-ask button[data-act=no]{background:#243044;color:#f4f7fb}.cal-empty{margin:14px 0 0;color:#8b95a5;font-weight:700}body.cal-on main>section.section,body.cal-on main>.trend-panel:not(#cal-panel),body.cal-on main>.struct-trend-panel,body.cal-on main>.macro-panel,body.cal-on #tf-panels{display:none!important}body.cal-on #cal-panel{display:block!important}';
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
    if (!b || b.getAttribute('data-tf') === 'cal') return;
    showCal(false);
  }, true);
  fetch(PATH + '?t=' + Date.now(), { cache: 'no-store' }).then(function (res) {
    return res.ok ? res.json() : null;
  }).then(function (data) {
    if (!data) return;
    merge(data.rows || []);
    saveLocal();
    if (document.body.classList.contains('cal-on')) paint();
  }).catch(function () {});
})();
