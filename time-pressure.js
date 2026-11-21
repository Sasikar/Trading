/* Time Pressure. Name, amount in k or L, exact total on top. Edit or delete any row. */
(function () {
  var API = "https://trading-ohlcv.sasipudi.workers.dev/life-log";
  var KEY = "tp_rows_v1";
  var rows = [];
  var editing = "";
  var asking = "";
  var gen = 0;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      return "&" + "quot;";
    });
  }
  function nid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function keep(raw) { return String(raw || "").replace(/\s+/g, " ").trim().slice(0, 80); }
  function num(raw) {
    var s = String(raw == null ? "" : raw).replace(/,/g, "").replace(/₹/g, "").trim();
    if (!s) return null;
    var m = s.match(/^(-?\d+(?:\.\d+)?)\s*(k|l|lac|lakh)?$/i);
    if (!m) return null;
    var n = Number(m[1]);
    if (!isFinite(n) || n === 0) return null;
    var unit = (m[2] || "").toLowerCase();
    if (unit === "k") n *= 1000;
    if (unit === "l" || unit === "lac" || unit === "lakh") n *= 100000;
    if (Math.abs(n) > 1e13) return null;
    return Math.round(n * 100) / 100;
  }
  function money(n) {
    n = Number(n);
    if (!isFinite(n)) n = 0;
    var sign = n < 0 ? "-" : "";
    var a = Math.abs(n);
    var unit = "";
    if (a >= 100000) { a = a / 100000; unit = "L"; }
    else if (a >= 1000) { a = a / 1000; unit = "k"; }
    var s = (Math.round(a * 100) / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
    return sign + s + unit;
  }
  function exact(n) {
    n = Number(n);
    if (!isFinite(n)) n = 0;
    var neg = n < 0;
    var v = Math.abs(Math.round(n * 100) / 100);
    var parts = v.toFixed(2).split(".");
    var s = parts[0];
    var head = s.slice(0, -3);
    var tail = s.slice(-3);
    if (head) tail = head.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + tail;
    var dec = parts[1] === "00" ? "" : "." + parts[1].replace(/0$/, "");
    return (neg ? "-" : "") + "₹" + tail + dec;
  }
  function cleanRow(row) {
    if (!row) return null;
    var id = String(row.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 24);
    var text = keep(row.text);
    var n = Number(row.n);
    if (!id || !text || !isFinite(n) || n === 0 || Math.abs(n) > 1e13) return null;
    return { id: id, text: text, n: Math.round(n * 100) / 100, t: Number(row.t) || 0 };
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) {}
  }
  function loadLocal() {
    try { rows = JSON.parse(localStorage.getItem(KEY) || "[]") || []; } catch (e) { rows = []; }
    if (!Array.isArray(rows)) rows = [];
    rows = rows.map(cleanRow).filter(Boolean);
    rows.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
  }
  function status(text) {
    var el = $("tp-status");
    if (el) el.textContent = text || "";
  }
  function sum() {
    var n = 0;
    rows.forEach(function (row) { n += row.n; });
    return Math.round(n * 100) / 100;
  }
  function paint() {
    var root = $("tp-app");
    if (!root) return;
    var draftText = "";
    var draftAmt = "";
    var oldText = $("tp-text");
    var oldAmt = $("tp-amt");
    if (oldText) draftText = oldText.value;
    if (oldAmt) draftAmt = oldAmt.value;
    var total = sum();
    var body = rows.map(function (row) {
      if (editing === row.id) {
        return '<li class="tp-row"><form class="tp-form" data-id="' + esc(row.id) + '"><input data-field="text" value="' + esc(row.text) + '" maxlength="80" aria-label="Name"><span class="tp-hy">-</span><input data-field="amt" value="' + esc(money(row.n)) + '" placeholder="50k or 2L" aria-label="Amount"><button type="submit">Save</button><button type="button" data-act="cancel" aria-label="Cancel">×</button></form></li>';
      }
      return '<li class="tp-row"><span class="tp-name">' + esc(row.text) + '</span><span class="tp-hy">-</span><b>' + money(row.n) + '</b><span class="tp-acts"><button type="button" class="tp-pen" data-act="edit" data-id="' + esc(row.id) + '">Edit</button><button type="button" class="tp-x" data-act="ask" data-id="' + esc(row.id) + '" aria-label="Delete">×</button></span></li>';
    }).join("");
    var ask = "";
    if (asking) {
      var hit = null;
      rows.forEach(function (row) { if (row.id === asking) hit = row; });
      if (hit) ask = '<div class="tp-ask">Delete ' + esc(hit.text) + '?<button type="button" data-act="yes" data-id="' + esc(hit.id) + '">Delete</button><button type="button" data-act="no">Keep</button></div>';
    }
    root.innerHTML =
      '<div class="tp-total"><b>' + exact(total) + '</b><span>' + money(total) + '</span></div>' +
      '<form id="tp-add" class="tp-form"><input id="tp-text" data-field="text" maxlength="80" placeholder="Name" value="' + esc(draftText) + '" aria-label="Name"><span class="tp-hy">-</span><input id="tp-amt" data-field="amt" placeholder="50k or 2L" inputmode="text" value="' + esc(draftAmt) + '" aria-label="Amount"><button type="submit">Add</button></form>' +
      '<p class="tp-hint">k = 1,000 · L = 1 lakh. Top number is the exact total.</p>' +
      '<p id="tp-status"></p>' + ask +
      '<ul class="tp-list">' + body + "</ul>";
  }
  function apply(view) {
    if (!view || !view.pressure || !Array.isArray(view.pressure.rows)) return false;
    var remote = view.pressure.rows.map(cleanRow).filter(Boolean);
    if (!remote.length && rows.length) return "seed";
    rows = remote.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
    saveLocal();
    return true;
  }
  function post() {
    var mine = ++gen;
    var body = { section: "pressure", act: "save", rows: rows };
    status("Saving");
    return fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (view) {
      if (mine !== gen) return;
      if (!view || view.ok === false) { status((view && view.error) || "Not saved"); return; }
      apply(view);
      if ($("tp-panel") && $("tp-panel").classList.contains("on")) paint();
      status("Saved");
    }).catch(function () {
      if (mine === gen) status("Saved on this phone");
    });
  }
  function pull() {
    fetch(API, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (view) {
      var took = apply(view);
      if (took === "seed") post();
      else if (took && $("tp-panel") && $("tp-panel").classList.contains("on")) paint();
    }).catch(function () {});
  }
  function add(textRaw, amtRaw) {
    var text = keep(textRaw);
    var n = num(amtRaw);
    if (!text || n == null) {
      paint();
      status("Type a name and an amount like 50k or 2L");
      return;
    }
    var row = { id: nid(), text: text, n: n, t: Date.now() };
    rows.unshift(row);
    saveLocal();
    paint();
    var again = $("tp-text");
    if (again) again.focus();
    post();
  }
  function saveEdit(id, textRaw, amtRaw) {
    var text = keep(textRaw);
    var n = num(amtRaw);
    if (!text || n == null) {
      status("Type a name and an amount like 50k or 2L");
      return;
    }
    rows.forEach(function (row) {
      if (row.id !== id) return;
      row.text = text;
      row.n = n;
      row.t = Date.now();
    });
    editing = "";
    saveLocal();
    paint();
    post();
  }
  function remove(id) {
    rows = rows.filter(function (row) { return row.id !== id; });
    asking = "";
    editing = "";
    saveLocal();
    paint();
    post();
  }
  function show(on) {
    var p = $("tp-panel");
    if (!p) return;
    document.body.classList.toggle("tp-on", !!on);
    if (!on) {
      p.style.display = "none";
      p.classList.remove("on");
      return;
    }
    document.body.classList.remove("life-on", "md-on", "cal-on");
    var panels = $("tf-panels");
    if (panels) { panels.classList.add("hidden"); panels.style.display = "none"; }
    document.querySelectorAll(".trend-panel, .struct-trend-panel").forEach(function (el) {
      if (el.id === "tp-panel") return;
      el.style.display = "none";
      el.classList.remove("on");
    });
    p.style.display = "block";
    p.classList.add("on");
    paint();
    pull();
  }
  window.showTimePressure = show;

  if (!document.getElementById("tp-style")) {
    var css = document.createElement("style");
    css.id = "tp-style";
    css.textContent = "#tp-panel .head p,#tp-panel .source{display:none!important}#tp-panel .card{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}#tp-panel,#tp-app{max-width:100%;overflow-x:hidden}.tp-total{border-radius:18px;padding:16px;background:#2a2414;color:#f6e7b8;margin-bottom:12px}.tp-total b{display:block;font-size:34px;line-height:1;letter-spacing:-.04em}.tp-total span{display:block;margin-top:6px;color:#e6c878;font-size:14px;font-weight:800}.tp-form{display:flex;flex-wrap:nowrap;gap:6px;align-items:center}.tp-form input{flex:1;min-width:0;box-sizing:border-box;padding:8px 10px;border:1px solid #3d4a5c;border-radius:10px;background:#0e131a;color:#f4f7fb;font:800 14px/1.2 Inter,system-ui,sans-serif;color-scheme:dark}.tp-form input[data-field=amt]{flex:0 0 108px}.tp-form input::placeholder{color:#6d7888;font-weight:600}.tp-hy{flex:0 0 auto;color:#8b95a5;font-weight:800}.tp-form button{flex:0 0 auto;border:0;border-radius:10px;padding:8px 10px;background:#e6c878;color:#1a1406;font-weight:900;cursor:pointer}.tp-form button[data-act=cancel]{background:#2a1a22;color:#ff8b98}.tp-hint{margin:8px 0 0;color:#8b95a5;font-size:12px;font-weight:700}#tp-status{min-height:18px;margin:4px 0 0;color:#8b95a5;font-size:12px;font-weight:700}.tp-list{list-style:none;margin:8px 0 0;padding:0}.tp-row{display:flex;align-items:center;gap:6px;padding:12px 0;border-bottom:1px solid #1c2733}.tp-name{flex:1;min-width:0;font-weight:800;word-break:break-word}.tp-row b{flex:0 0 auto;font-size:15px}.tp-acts{display:flex;gap:4px;margin-left:auto}.tp-pen,.tp-x{border:0;border-radius:999px;height:28px;cursor:pointer;font-weight:800}.tp-pen{padding:0 8px;background:#243044;color:#f4f7fb;font-size:12px}.tp-x{width:28px;background:#2a1a22;color:#ff8b98;font-size:18px}.tp-ask{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px;color:#ffb4be;font-weight:800}.tp-ask button{border:0;border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer}.tp-ask button[data-act=yes]{background:#ff6f7c;color:#1a0c10}.tp-ask button[data-act=no]{background:#243044;color:#f4f7fb}body.tp-on main>section.section,body.tp-on main>.trend-panel:not(#tp-panel),body.tp-on main>.struct-trend-panel,body.tp-on #tf-panels{display:none!important}body.tp-on #tp-panel{display:block!important}";
    document.head.appendChild(css);
  }
  loadLocal();
  var root = $("tp-app");
  if (root) {
    root.addEventListener("submit", function (ev) {
      var form = ev.target;
      if (!form) return;
      ev.preventDefault();
      if (form.id === "tp-add") {
        add(($("tp-text") || {}).value, ($("tp-amt") || {}).value);
        return;
      }
      var text = form.querySelector('[data-field="text"]');
      var amt = form.querySelector('[data-field="amt"]');
      saveEdit(form.getAttribute("data-id"), text && text.value, amt && amt.value);
    });
    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-act]");
      if (!btn || btn.closest("form") && btn.type === "submit") return;
      var act = btn.getAttribute("data-act");
      var id = btn.getAttribute("data-id") || "";
      if (act === "edit") { editing = id; asking = ""; paint(); }
      if (act === "cancel") { editing = ""; paint(); }
      if (act === "ask") { asking = id; editing = ""; paint(); }
      if (act === "no") { asking = ""; paint(); }
      if (act === "yes") remove(id);
    });
  }
  var tabs = $("tf-tabs");
  if (tabs) tabs.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
    if (!b || b.getAttribute("data-tf") === "pressure") return;
    show(false);
  }, true);
  pull();
})();
