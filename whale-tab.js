/* Whale wallets — one holders screenshot per calendar day, compare two days. */
/* whale-pure */
function whaleNorm(addr) {
  return String(addr || '').toLowerCase().replace(/\s/g, '').replace(/\u2026/g, '...');
}
function whaleParseAmt(label) {
  var m = String(label || '').replace(/,/g, '').match(/([0-9]*\.?[0-9]+)\s*([kmb])?/i);
  if (!m) return null;
  var n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  var u = (m[2] || '').toLowerCase();
  if (u === 'k') n *= 1e3;
  if (u === 'm') n *= 1e6;
  if (u === 'b') n *= 1e9;
  return n;
}
function whaleFmt(n, signed) {
  if (n == null || !isFinite(n)) return '—';
  var sign = '';
  if (signed) sign = n > 0 ? '+' : (n < 0 ? '-' : '');
  var v = Math.abs(n);
  var body;
  if (v >= 1e9) body = (v / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
  else if (v >= 1e6) body = (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  else if (v >= 1e3) body = (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  else body = String(Math.round(v));
  return sign + body;
}
function whaleCompare(earlier, later) {
  var FLAT = 250000;
  var prev = {};
  (earlier.rows || []).forEach(function (row) {
    var k = whaleNorm(row.addr);
    if (k) prev[k] = row;
  });
  var next = {};
  (later.rows || []).forEach(function (row) {
    var k = whaleNorm(row.addr);
    if (k) next[k] = row;
  });
  var acc = [], sold = [], held = [], fresh = [], gone = [];
  Object.keys(next).forEach(function (k) {
    var b = next[k];
    var a = prev[k];
    if (!a) { fresh.push(b); return; }
    var d = (b.n != null ? b.n : 0) - (a.n != null ? a.n : 0);
    if (Math.abs(d) < FLAT) held.push({ row: b, d: d });
    else if (d > 0) acc.push({ row: b, was: a, d: d });
    else sold.push({ row: b, was: a, d: d });
  });
  Object.keys(prev).forEach(function (k) {
    if (!next[k]) gone.push(prev[k]);
  });
  acc.sort(function (a, b) { return b.d - a.d; });
  sold.sort(function (a, b) { return a.d - b.d; });
  return { acc: acc, sold: sold, held: held, fresh: fresh, gone: gone };
}
/* whale-pure-end */
(function () {
  var KEY = 'wh_days_v1';
  var TOMB = 'wh_days_tomb_v1';
  var PATH = 'data/whale-days.json';
  var GH = 'https://api.github.com/repos/Sasikar/Trading/contents/' + PATH;
  var days = {};
  var picked = {};
  var syncing = false;
  var busy = false;
  var reportHtml = '';
  var errorText = '';

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
  function markTomb(date, on) {
    var map = tombs();
    if (on) map[date] = Date.now();
    else delete map[date];
    try { localStorage.setItem(TOMB, JSON.stringify(map)); } catch (e) {}
  }
  function loadLocal() {
    try { days = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { days = {}; }
    if (!days || typeof days !== 'object' || Array.isArray(days)) days = {};
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(days)); } catch (e) {}
  }
  function setStatus(text) {
    var el = $('wh-status');
    if (el) el.textContent = text || '';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&', '<': '<', '>': '>', '"': '"' }[c];
    });
  }
  function todayISO() {
    try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function dayLabel(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return iso;
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    try { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
    catch (e) { return iso; }
  }
  function dates() {
    return Object.keys(days).filter(function (k) { return days[k] && days[k].rows && days[k].rows.length; }).sort();
  }
  function merge(remote) {
    var dead = tombs();
    var next = {};
    function take(src) {
      if (!src || typeof src !== 'object') return;
      Object.keys(src).forEach(function (date) {
        if (dead[date]) return;
        var row = src[date];
        if (!row || !Array.isArray(row.rows) || row.rows.length < 3) return;
        var prev = next[date];
        if (!prev || (row.t || 0) >= (prev.t || 0)) next[date] = row;
      });
    }
    take(days);
    take(remote);
    days = next;
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
      var n = dates().length;
      if (!tok) { setStatus(n + ' days · this phone'); return; }
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
        setStatus(n + ' days · this phone');
        return;
      }
      var body = {
        message: 'Whale days (' + dates().length + ')',
        content: btoa(unescape(encodeURIComponent(JSON.stringify({ updated: new Date().toISOString(), days: days }, null, 2)))),
        branch: 'master'
      };
      if (sha) body.sha = sha;
      var pr = await fetch(GH, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      setStatus(pr.ok ? dates().length + ' days · GitHub' : dates().length + ' days · this phone');
    } catch (e) {
      setStatus(dates().length + ' days · this phone');
    } finally {
      syncing = false;
    }
  }
  function line(row, extra) {
    var pct = row.pct != null && isFinite(+row.pct) ? ' · ' + (+row.pct).toFixed(2) + '%' : '';
    return '<li><b>' + esc(row.addr) + '</b> ' + esc(extra) + esc(pct) + '</li>';
  }
  function writeReport(list) {
    errorText = '';
    if (list.length < 2) {
      reportHtml = '';
      errorText = 'Need at least 2 screenshots to compare.';
      return;
    }
    var ordered = list.slice().sort();
    var a = days[ordered[0]];
    var b = days[ordered[ordered.length - 1]];
    var diff = whaleCompare(a, b);
    var coin = a.coin && b.coin && a.coin !== b.coin ? (a.coin + ' → ' + b.coin) : (b.coin || a.coin || 'Token');
    var hold = '';
    if (a.holders || b.holders) {
      var dh = (b.holders || 0) - (a.holders || 0);
      hold = 'Holders ' + (a.holders || '—') + ' → ' + (b.holders || '—') + (a.holders && b.holders ? ' (' + (dh > 0 ? '+' : '') + dh + ').' : '.');
    }
    var html = '<div class="wh-report"><div class="wh-kicker">' + esc(coin) + '</div><h3>' + esc(dayLabel(ordered[0])) + ' → ' + esc(dayLabel(ordered[ordered.length - 1])) + '</h3>';
    if (ordered.length > 2) html += '<p class="wh-sub">Using the oldest and newest of the ' + ordered.length + ' days you picked.</p>';
    html += '<p>' + esc(hold) + ' This is the holder table only. It is not a buy.</p>';
    function block(title, items) {
      if (!items.length) return '<h4>' + title + '</h4><p class="wh-none">None.</p>';
      return '<h4>' + title + '</h4><ul>' + items + '</ul>';
    }
    html += block('Accumulators', diff.acc.map(function (x) {
      return line(x.row, 'added ' + whaleFmt(x.d, true) + ' (now ' + whaleFmt(x.row.n, false) + ')');
    }).join(''));
    html += block('Sellers', diff.sold.map(function (x) {
      return line(x.row, 'sold ' + whaleFmt(Math.abs(x.d), false) + ' (' + whaleFmt(x.was.n, false) + ' → ' + whaleFmt(x.row.n, false) + ')');
    }).join(''));
    html += block('New in the later list', diff.fresh.map(function (row) {
      return line(row, 'entered with ' + whaleFmt(row.n, false));
    }).join(''));
    html += block('Left the later list', diff.gone.map(function (row) {
      return line(row, 'was ' + whaleFmt(row.n, false) + ' and dropped out');
    }).join(''));
    html += block("Didn't sell", diff.held.map(function (x) {
      return line(x.row, 'still ' + whaleFmt(x.row.n, false));
    }).join(''));
    var biggestAdd = diff.acc[0];
    var biggestSell = diff.sold[0];
    var lean = 'The top list barely moved.';
    if (biggestSell && (!biggestAdd || Math.abs(biggestSell.d) > biggestAdd.d * 1.4)) lean = 'The largest move is a sale. One wallet is feeding the dip more than the others are absorbing it.';
    else if (biggestAdd && diff.acc.length >= diff.sold.length) lean = 'The bigger wallets added while the holder count did the other thing. That is accumulation inside the top list, not the whole market.';
    html += '<h4>Read</h4><p>' + esc(lean) + '</p>';
    html += '<p class="wh-foot">On Dexscreener the first row is often the liquidity pool, not a person. Check that address before you call it a whale.</p></div>';
    reportHtml = html;
  }
  function paint() {
    var root = $('wh-app');
    if (!root) return;
    var list = dates();
    var dateVal = todayISO();
    var coinVal = '';
    var dateEl = $('wh-date');
    var coinEl = $('wh-coin');
    if (dateEl) dateVal = dateEl.value || dateVal;
    if (coinEl) coinVal = coinEl.value || '';
    var chips = list.map(function (date) {
      var snap = days[date];
      var on = picked[date] ? ' on' : '';
      return '<button type="button" class="wh-day' + on + '" data-date="' + esc(date) + '"><b>' + esc(dayLabel(date)) + '</b><span>' + esc(snap.coin || 'Saved') + ' · ' + snap.rows.length + ' wallets</span></button>';
    }).join('');
    root.innerHTML =
      '<div class="wh-save"><label>Day<input id="wh-date" type="date" value="' + esc(dateVal) + '"></label><label>Coin<input id="wh-coin" type="text" maxlength="32" placeholder="Optional" value="' + esc(coinVal) + '"></label></div>' +
      '<input id="wh-file" type="file" accept="image/*" hidden>' +
      '<button type="button" class="wh-upload" data-act="upload"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Reading the table…' : 'Upload holders screenshot') + '</button>' +
      '<div class="wh-label">Saved days · tap two or more</div>' +
      '<div class="wh-days">' + (chips || '<p class="wh-none">No days yet.</p>') + '</div>' +
      '<button type="button" class="wh-go" data-act="compare">Compare</button>' +
      (errorText ? '<div class="wh-error">' + esc(errorText) + '</div>' : '') +
      reportHtml;
  }
  function shotBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error('Could not read that image'));
        else resolve(blob);
      }, 'image/jpeg', 0.72);
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
  function fitImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        var scale = Math.min(1, 1400 / Math.max(w, h));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
      img.src = url;
    });
  }
  async function saveShot(file) {
    var dateEl = $('wh-date');
    var coinEl = $('wh-coin');
    var date = dateEl && dateEl.value;
    var typed = coinEl && coinEl.value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      errorText = 'Pick the calendar date for this screenshot.';
      paint();
      return;
    }
    busy = true;
    errorText = '';
    paint();
    try {
      var canvas = await fitImage(file);
      var b64 = await blobB64(await shotBlob(canvas));
      var res = await fetch('https://trading-ohlcv.sasipudi.workers.dev/whale-read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: b64 })
      });
      var data = await res.json();
      if (!data || !data.ok || !data.rows || data.rows.length < 3) throw new Error((data && data.error) || 'Could not read wallets in that screenshot');
      var rows = data.rows.map(function (row) {
        return { addr: row.addr, pct: isFinite(+row.pct) ? +row.pct : null, amount: row.amount, value: row.value || '', n: whaleParseAmt(row.amount) };
      }).filter(function (row) { return row.addr && row.n != null; });
      if (rows.length < 3) throw new Error('Could not read the amounts in that screenshot');
      markTomb(date, false);
      days[date] = {
        coin: typed || data.coin || '',
        holders: Number(data.holders) || 0,
        rows: rows,
        t: Date.now()
      };
      reportHtml = '';
      setStatus('Saved ' + dayLabel(date));
      paint();
      persist();
    } catch (e) {
      errorText = (e && e.message) || 'Could not read that screenshot';
      paint();
    } finally {
      busy = false;
      paint();
    }
  }
  function comparePicked() {
    var list = Object.keys(picked).filter(function (d) { return picked[d] && days[d]; });
    writeReport(list);
    paint();
  }
  function solo(on) {
    document.body.classList.toggle('wh-on', !!on);
  }
  function showWhale(on) {
    var p = $('whale-panel');
    if (!p) return;
    if (!on) {
      p.style.display = 'none';
      p.classList.remove('on');
      solo(false);
      return;
    }
    solo(true);
    p.style.display = 'block';
    p.classList.add('on');
    paint();
    var tabs = $('tf-tabs');
    if (tabs && tabs.scrollIntoView) tabs.scrollIntoView({ block: 'start' });
  }
  window.showWhale = showWhale;

  if (!document.getElementById('wh-style')) {
    var css = document.createElement('style');
    css.id = 'wh-style';
    css.textContent = '#whale-panel .card{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}#wh-app{color:#f4f7fb}.wh-save{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.wh-save label{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:800;color:#8b95a5}.wh-save input{width:100%;box-sizing:border-box;padding:12px;border:0;border-radius:14px;background:#141b24;color:#f4f7fb;font-size:16px;font-weight:700}.wh-upload,.wh-go{width:100%;padding:14px;border:0;border-radius:14px;font-weight:800;cursor:pointer}.wh-upload{background:#1a222e;color:#f4f7fb}.wh-go{margin-top:12px;background:#f4f7fb;color:#111}.wh-label{margin:16px 0 8px;color:#8b95a5;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.wh-days{display:flex;flex-direction:column;gap:8px}.wh-day{display:flex;justify-content:space-between;gap:10px;align-items:center;text-align:left;padding:12px 14px;border-radius:16px;border:0;background:#141b24;color:#f4f7fb;cursor:pointer}.wh-day b{display:block;font-size:15px}.wh-day span{display:block;margin-top:3px;color:#8b95a5;font-size:12px;font-weight:700}.wh-day.on{background:#1f8a4d;color:#fff}.wh-day.on span{color:#d9ffe8}.wh-error{margin-top:12px;padding:12px 14px;border-radius:14px;background:#3c1822;color:#ffb4be;font-weight:800}.wh-report{margin-top:16px;padding:16px;border-radius:18px;background:#10161f}.wh-report h3{margin:4px 0 8px;font-size:22px;letter-spacing:-.03em}.wh-report h4{margin:14px 0 6px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#8b95a5}.wh-report p,.wh-report li{font-size:14px;line-height:1.45}.wh-report ul{margin:0;padding-left:18px}.wh-kicker{color:#7ddea8;font-size:12px;font-weight:800}.wh-sub,.wh-none,.wh-foot{color:#8b95a5}.wh-foot{font-size:12px!important}body.wh-on main>section.section,body.wh-on main>.trend-panel:not(#whale-panel),body.wh-on main>.struct-trend-panel,body.wh-on main>.macro-panel,body.wh-on #tf-panels{display:none!important}body.wh-on #whale-panel{display:block!important}';
    document.head.appendChild(css);
  }
  loadLocal();
  var root = $('wh-app');
  if (root) {
    root.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest('[data-act],[data-date]');
      if (!b) return;
      if (b.getAttribute('data-date')) {
        var date = b.getAttribute('data-date');
        if (picked[date]) delete picked[date];
        else picked[date] = 1;
        errorText = '';
        paint();
        return;
      }
      var act = b.getAttribute('data-act');
      if (act === 'upload') {
        var input = $('wh-file');
        if (input) input.click();
      }
      if (act === 'compare') comparePicked();
    });
    root.addEventListener('change', function (ev) {
      if (!ev.target || ev.target.id !== 'wh-file') return;
      var f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (f) saveShot(f);
    });
  }
  var tabs = $('tf-tabs');
  if (tabs) tabs.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
    if (!b || b.getAttribute('data-tf') === 'whale') return;
    showWhale(false);
  }, true);
  fetch(PATH + '?t=' + Date.now(), { cache: 'no-store' }).then(function (res) {
    return res.ok ? res.json() : null;
  }).then(function (data) {
    if (!data) return;
    merge(data.days || {});
    saveLocal();
    paint();
  }).catch(function () {});
  paint();
})();
