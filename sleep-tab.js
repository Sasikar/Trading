/* Healthy Sleep — tap a day, log bedtime, colour the calendar. */
(function () {
  var KEY = 'sleep_days_v1';
  var TOMB = 'sleep_days_tomb_v1';
  var PATH = 'data/sleep.json';
  var GH = 'https://api.github.com/repos/Sasikar/Trading/contents/' + PATH;
  var days = {};
  var openKey = '';
  var focusNext = false;
  var syncing = false;
  var cursor = istParts(new Date());

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
  function istParts(date) {
    var o = { year: 2026, month: 1, day: 1 };
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).forEach(function (p) {
        if (p.type === 'year' || p.type === 'month' || p.type === 'day') o[p.type] = +p.value;
      });
    } catch (e) {
      o.year = date.getFullYear();
      o.month = date.getMonth() + 1;
      o.day = date.getDate();
    }
    return { y: o.year, m: o.month, d: o.day };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function keyOf(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function todayKey() {
    var t = istParts(new Date());
    return keyOf(t.y, t.m, t.d);
  }
  function bandOf(hhmm) {
    var bits = String(hhmm || '').split(':');
    var h = +bits[0];
    var m = +bits[1];
    if (!(h >= 0 && h <= 23) || !(m >= 0 && m <= 59)) return '';
    var mins = h * 60 + m;
    if (mins >= 12 * 60 && mins < 22 * 60) return 'green';
    if (mins >= 22 * 60 && mins <= 22 * 60 + 30) return 'yellow';
    return 'red';
  }
  function pretty(hhmm) {
    var h = +String(hhmm).slice(0, 2);
    var m = String(hhmm).slice(3, 5);
    var ap = h >= 12 ? 'pm' : 'am';
    var h12 = h % 12 || 12;
    return h12 + ':' + m + ' ' + ap;
  }
  function monthLabel(y, m) {
    try {
      return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    } catch (e) { return y + '-' + pad(m); }
  }
  function dayTitle(key) {
    var bits = key.split('-');
    try {
      return new Date(Date.UTC(+bits[0], +bits[1] - 1, +bits[2])).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    } catch (e) { return key; }
  }
  function loadLocal() {
    try { days = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { days = {}; }
    if (!days || typeof days !== 'object' || Array.isArray(days)) days = {};
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(days)); } catch (e) {}
  }
  function setStatus(text) {
    var el = $('sl-status');
    if (el) el.textContent = text || '';
  }
  function merge(remote) {
    var dead = tombs();
    Object.keys(remote || {}).forEach(function (k) {
      var row = remote[k];
      if (!row || !/^\d{2}:\d{2}$/.test(row.time || '')) return;
      if (dead[k] && dead[k] >= (row.t || 0)) return;
      if (dead[k]) markTomb(k, false);
      var prev = days[k];
      if (!prev || (row.t || 0) >= (prev.t || 0)) days[k] = { time: row.time, t: row.t || 0 };
    });
  }
  function decodeContent(gj) {
    var text = decodeURIComponent(escape(atob(String(gj.content || '').replace(/\s/g, ''))));
    var data = JSON.parse(text);
    return (data && data.days) || {};
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
          merge(pj.days || {});
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
        message: 'Healthy sleep (' + Object.keys(days).length + ')',
        content: btoa(unescape(encodeURIComponent(JSON.stringify({ updated: new Date().toISOString(), days: days }, null, 2)))),
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
  function shiftMonth(n) {
    var m = cursor.m + n;
    var y = cursor.y;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    cursor = { y: y, m: m, d: 1 };
    openKey = '';
    paint();
  }
  function paint() {
    var cal = $('sl-cal');
    if (!cal) return;
    var y = cursor.y;
    var m = cursor.m;
    var first = new Date(Date.UTC(y, m - 1, 1));
    var start = (first.getUTCDay() + 6) % 7;
    var count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var today = todayKey();
    var counts = { green: 0, yellow: 0, red: 0 };
    var cells = '';
    for (var i = 0; i < start; i++) cells += '<span></span>';
    for (var d = 1; d <= count; d++) {
      var key = keyOf(y, m, d);
      var row = days[key];
      var band = row ? bandOf(row.time) : '';
      if (band) counts[band] += 1;
      var cls = 'sl-day' + (band ? ' ' + band : '') + (key === today ? ' today' : '') + (key === openKey ? ' on' : '');
      cells += '<button type="button" class="' + cls + '" data-day="' + key + '"><span class="n">' + d + '</span>' +
        (row ? '<span class="tm">' + pretty(row.time) + '</span>' : '<span class="tm">&nbsp;</span>') + '</button>';
    }
    var logged = counts.green + counts.yellow + counts.red;
    var edit = '';
    if (openKey) {
      var have = days[openKey];
      edit = '<div class="sl-edit"><div class="sl-edit-top"><strong>' + dayTitle(openKey) + '</strong><span id="sl-preview" class="sl-preview' + (have ? ' ' + bandOf(have.time) : '') + '">' + (have ? pretty(have.time) : 'Pick a time') + '</span></div>' +
        '<input id="sl-time" type="time" step="60" aria-label="Sleep time">' +
        '<p>Before 10:00 pm green. 10:00 to 10:30 yellow. After 10:30, or after midnight, red.</p>' +
        '<div class="sl-row"><button type="button" data-act="cancel">Cancel</button>' +
        (have ? '<button type="button" data-act="clear">Clear</button>' : '') +
        '<button type="button" data-act="save">Save</button></div></div>';
    }
    cal.innerHTML =
      '<div class="sl-top"><button type="button" class="sl-nav" data-act="prev" aria-label="Previous month">‹</button><h3>' + monthLabel(y, m) + '</h3><button type="button" class="sl-nav" data-act="next" aria-label="Next month">›</button></div>' +
      '<div class="sl-legend"><span class="green">Before 10:00</span><span class="yellow">By 10:30</span><span class="red">After 10:30</span></div>' +
      '<div class="sl-stats">' + logged + ' logged · ' + counts.green + ' green · ' + counts.yellow + ' yellow · ' + counts.red + ' red</div>' +
      '<div class="sl-week"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>' +
      '<div class="sl-grid">' + cells + '</div>' + edit;
    var input = $('sl-time');
    if (input) {
      input.value = (days[openKey] && days[openKey].time) || '';
      if (focusNext) {
        focusNext = false;
        setTimeout(function () { try { input.focus(); } catch (e) {} }, 40);
      }
    }
  }
  function saveOpen() {
    var input = $('sl-time');
    var time = input && input.value;
    if (!openKey || !/^\d{2}:\d{2}$/.test(time || '')) return;
    days[openKey] = { time: time, t: Date.now() };
    markTomb(openKey, false);
    openKey = '';
    paint();
    persist();
  }
  function clearOpen() {
    if (!openKey) return;
    markTomb(openKey, true);
    delete days[openKey];
    openKey = '';
    paint();
    persist();
  }
  function solo(on) {
    var main = document.querySelector('main');
    if (!main) return;
    Array.prototype.forEach.call(main.children, function (el) {
      if (el.id === 'tf-tabs' || el.id === 'dip-alert' || el.id === 'sleep-panel') return;
      if (on) {
        if (el.getAttribute('data-sl-prev') == null) el.setAttribute('data-sl-prev', el.style.display || ' ');
        el.style.display = 'none';
      } else if (el.getAttribute('data-sl-prev') != null) {
        var prev = el.getAttribute('data-sl-prev');
        el.style.display = prev === ' ' ? '' : prev;
        el.removeAttribute('data-sl-prev');
      }
    });
  }
  function showSleep(on) {
    var p = $('sleep-panel');
    if (!p) return;
    if (!on) {
      p.style.display = 'none';
      p.classList.remove('on');
      openKey = '';
      solo(false);
      return;
    }
    solo(true);
    p.style.display = 'block';
    p.classList.add('on');
    paint();
    persist();
    var tabs = $('tf-tabs');
    if (tabs && tabs.scrollIntoView) tabs.scrollIntoView({ block: 'start' });
  }
  window.showSleep = showSleep;

  if (!document.getElementById('sl-style')) {
    var css = document.createElement('style');
    css.id = 'sl-style';
    css.textContent = '#sl-cal{color:#f4e7c3}.sl-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.sl-top h3{margin:0;font-size:20px;font-weight:900}.sl-nav{width:38px;height:38px;border-radius:999px;border:1px solid #3d3420;background:#12100c;color:#f4e7c3;font-size:22px;font-weight:900;cursor:pointer}.sl-legend{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 8px}.sl-legend span,.sl-preview{border-radius:999px;padding:6px 10px;font-size:11px;font-weight:900}.sl-legend .green,.sl-preview.green,.sl-day.green{background:#12331f;color:#b6f0c8}.sl-legend .yellow,.sl-preview.yellow,.sl-day.yellow{background:#3a2c0c;color:#ffe7a3}.sl-legend .red,.sl-preview.red,.sl-day.red{background:#3a1820;color:#ffb4be}.sl-stats{color:#a89058;font-size:12px;font-weight:800;margin-bottom:10px}.sl-week,.sl-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.sl-week{margin-bottom:6px}.sl-week span{text-align:center;color:#6d7688;font-size:10px;font-weight:800}.sl-day{min-height:62px;border-radius:14px;border:1px solid #2c2618;background:#12100c;color:#f4e7c3;padding:6px 2px 4px;font-weight:900;cursor:pointer}.sl-day .n{display:block;font-size:14px}.sl-day .tm{display:block;margin-top:4px;font-size:10px;font-weight:800;letter-spacing:.01em}.sl-day.today{box-shadow:inset 0 0 0 2px #e6b84d}.sl-day.on{outline:2px solid #f4e7c3;outline-offset:1px}.sl-edit{margin-top:12px;padding:12px;border-radius:16px;border:1px solid #6b5420;background:#1a150c}.sl-edit-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.sl-edit p{margin:8px 0 0;color:#a89058;font-size:12px;font-weight:700}#sl-time{width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid #3d3420;background:#0b121a;color:#f4f7fb;font-size:22px;font-weight:900;color-scheme:dark}.sl-row{display:flex;gap:8px;margin-top:10px}.sl-row button{flex:1;padding:12px 8px;border:0;border-radius:12px;font-weight:900;cursor:pointer;background:#243041;color:#e8eef6}.sl-row button[data-act="save"]{background:#e6b84d;color:#1a1406}.sl-row button[data-act="clear"]{background:#3a1820;color:#ff8a9a}';
    document.head.appendChild(css);
  }
  loadLocal();
  var cal = $('sl-cal');
  if (cal) {
    cal.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest('[data-act],[data-day]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'prev') { shiftMonth(-1); return; }
      if (act === 'next') { shiftMonth(1); return; }
      if (act === 'cancel') { openKey = ''; paint(); return; }
      if (act === 'save') { saveOpen(); return; }
      if (act === 'clear') { clearOpen(); return; }
      var day = b.getAttribute('data-day');
      if (!day) return;
      openKey = openKey === day ? '' : day;
      focusNext = !!openKey;
      paint();
    });
    cal.addEventListener('input', function (ev) {
      if (!ev.target || ev.target.id !== 'sl-time') return;
      var pill = $('sl-preview');
      if (!pill) return;
      var band = bandOf(ev.target.value);
      pill.className = 'sl-preview' + (band ? ' ' + band : '');
      pill.textContent = /^\d{2}:\d{2}$/.test(ev.target.value || '') ? pretty(ev.target.value) : 'Pick a time';
    });
  }
  var tabs = $('tf-tabs');
  if (tabs) tabs.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
    if (!b || b.getAttribute('data-tf') === 'sleep') return;
    showSleep(false);
  }, true);
  fetch(PATH + '?t=' + Date.now(), { cache: 'no-store' }).then(function (res) {
    return res.ok ? res.json() : null;
  }).then(function (data) {
    if (!data) return;
    merge(data.days || {});
    saveLocal();
    paint();
  }).catch(function () {});
})();
