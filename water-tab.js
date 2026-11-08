/* Water. Today on top. Day, week, and month change like weight. More is green. */
(function () {
  var API = "https://trading-ohlcv.sasipudi.workers.dev/life-log";
  var KEY = "water_log_v1";
  var days = {};
  var goal = 3000;

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function keyOf(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function todayKey() {
    var o = { year: 2026, month: 1, day: 1 };
    var date = new Date();
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).forEach(function (p) {
        if (p.type === "year" || p.type === "month" || p.type === "day") o[p.type] = +p.value;
      });
    } catch (e) {
      o.year = date.getFullYear();
      o.month = date.getMonth() + 1;
      o.day = date.getDate();
    }
    return keyOf(o.year, o.month, o.day);
  }
  function addDays(key, n) {
    var p = key.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    d.setUTCDate(d.getUTCDate() + n);
    return keyOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  function mlOf(day) {
    var row = days[day];
    var n = row ? Number(row.ml) : 0;
    return n > 0 ? Math.round(n) : 0;
  }
  function sumBack(end, n) {
    var total = 0;
    for (var i = 0; i < n; i++) total += mlOf(addDays(end, -i));
    return total;
  }
  function fmt(ml, signed) {
    var n = Math.round(ml);
    var sign = "";
    if (signed) sign = n > 0 ? "+" : "";
    var body = Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + " L" : n + " ml";
    if (signed && n < 0 && Math.abs(n) >= 1000) body = "-" + (Math.abs(n) / 1000).toFixed(1) + " L";
    if (signed && n >= 0) body = sign + body;
    return body;
  }
  function pill(label, n) {
    var color = n > 0 ? "#3dbe7a" : n < 0 ? "#ff6b6b" : "#9aa6b6";
    return '<div style="flex:1;padding:10px 6px;border-radius:14px;background:#12161d;text-align:center"><div style="color:#8b93a7;font-size:11px;font-weight:800">' + label + '</div><div style="margin-top:4px;color:' + color + ';font-size:18px;font-weight:900">' + fmt(n, true) + "</div></div>";
  }
  function streak(today) {
    var n = 0;
    var start = mlOf(today) >= goal ? 0 : 1;
    for (var i = start; i < 60; i++) {
      if (mlOf(addDays(today, -i)) < goal) break;
      n += 1;
    }
    return n;
  }
  function chart(today) {
    var keys = [];
    for (var i = 13; i >= 0; i--) keys.push(addDays(today, -i));
    var max = goal;
    keys.forEach(function (k) { if (mlOf(k) > max) max = mlOf(k); });
    var w = 640;
    var h = 160;
    var pad = 16;
    var gap = 6;
    var bw = (w - pad * 2 - gap * (keys.length - 1)) / keys.length;
    var bars = keys.map(function (k, i) {
      var v = mlOf(k);
      var bh = Math.max(v ? 4 : 0, (v / max) * (h - 36));
      var x = pad + i * (bw + gap);
      var y = h - 22 - bh;
      var fill = v >= goal ? "#3dbe7a" : "#e6c878";
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="4" fill="' + fill + '"/>';
    }).join("");
    return '<svg viewBox="0 0 ' + w + " " + h + '" style="width:100%;height:auto;margin-top:12px;background:#0e131a;border:1px solid #2a3140;border-radius:16px">' +
      bars +
      '<text x="' + pad + '" y="' + (h - 6) + '" fill="#8b93a7" font-size="11">' + keys[0].slice(5) + "</text>" +
      '<text x="' + (w - pad) + '" y="' + (h - 6) + '" fill="#8b93a7" font-size="11" text-anchor="end">Today</text></svg>';
  }
  function paint() {
    var root = $("wa-board");
    if (!root) return;
    var today = todayKey();
    var now = mlOf(today);
    var dayN = now - mlOf(addDays(today, -1));
    var weekN = sumBack(today, 7) - sumBack(addDays(today, -7), 7);
    var monthN = sumBack(today, 30) - sumBack(addDays(today, -30), 30);
    var pct = Math.max(0, Math.min(100, Math.round(now / goal * 100)));
    var left = Math.max(0, goal - now);
    var run = streak(today);
    var rows = "";
    for (var i = 0; i < 14; i++) {
      var key = addDays(today, -i);
      var v = mlOf(key);
      if (!v) continue;
      rows += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid #243041"><span style="color:#c5d0dc">' + (i ? key : "Today") + '</span><b style="color:' + (v >= goal ? "#3dbe7a" : "#f4f7fb") + '">' + fmt(v) + '</b><button type="button" data-clear="' + key + '" style="border:0;background:transparent;color:#ff8a7a;font-weight:800">Clear</button></div>';
    }
    root.innerHTML =
      '<div style="font-size:34px;font-weight:900;line-height:1">' + fmt(now) + "</div>" +
      '<div style="margin-top:4px;color:#8b93a7;font-size:13px">' + (left ? fmt(left) + " left today" : "Goal hit") + " · " + run + " day streak</div>" +
      '<div style="margin-top:10px;height:10px;border-radius:99px;background:#1a222e;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + (now >= goal ? "#3dbe7a" : "#e6c878") + '"></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:14px">' + pill("Day", dayN) + pill("Week", weekN) + pill("Month", monthN) + "</div>" +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<button type="button" data-add="250" style="flex:1;border:0;border-radius:14px;padding:14px 8px;font-weight:900;background:#e6c878;color:#1a1408">+1 glass</button>' +
      '<button type="button" data-add="500" style="flex:1;border:0;border-radius:14px;padding:14px 8px;font-weight:900;background:#1f8a4d;color:#fff">+500 ml</button></div>' +
      '<form id="wa-form" style="display:flex;gap:8px;margin-top:10px">' +
      '<input id="wa-date" type="date" value="' + today + '" style="color-scheme:dark;border:1px solid #3d4a5c;background:#0e131a;color:#f4f7fb;border-radius:12px;padding:10px">' +
      '<input id="wa-ml" type="number" inputmode="numeric" min="50" max="5000" step="50" placeholder="ml" style="flex:1;min-width:0;color-scheme:dark;border:1px solid #3d4a5c;background:#0e131a;color:#f4f7fb;border-radius:12px;padding:10px;font-weight:800">' +
      '<button type="submit" style="border:0;border-radius:12px;padding:10px 14px;font-weight:900;background:#243044;color:#f4f7fb">Add</button></form>' +
      chart(today) +
      '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;color:#8b93a7;font-size:12px">Daily goal ml<input id="wa-goal" type="number" min="250" max="8000" step="50" value="' + goal + '" style="width:96px;color-scheme:dark;border:1px solid #3d4a5c;background:#0e131a;color:#f4f7fb;border-radius:10px;padding:8px;font-weight:800"></label>' +
      '<div style="margin-top:8px">' + rows + "</div>";
    root.querySelectorAll("[data-add]").forEach(function (btn) {
      btn.addEventListener("click", function () { addMl(today, Number(btn.getAttribute("data-add"))); });
    });
    var form = $("wa-form");
    if (form) form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var day = ($("wa-date") && $("wa-date").value) || today;
      var ml = Math.round(Number($("wa-ml") && $("wa-ml").value));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(ml > 0 && ml <= 5000)) { status("Enter ml"); return; }
      addMl(day, ml);
    });
    var goalBox = $("wa-goal");
    if (goalBox) goalBox.addEventListener("change", function () {
      var n = Math.round(Number(goalBox.value));
      if (!(n >= 250 && n <= 8000)) return;
      goal = n;
      saveLocal();
      paint();
      post({ section: "water", goal: goal });
    });
    root.querySelectorAll("[data-clear]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var day = btn.getAttribute("data-clear");
        delete days[day];
        saveLocal();
        paint();
        post({ section: "water", day: day, clear: true });
      });
    });
  }
  function addMl(day, ml) {
    days[day] = { ml: Math.min(20000, mlOf(day) + ml), t: Date.now() };
    saveLocal();
    paint();
    post({ section: "water", day: day, ml: ml });
  }
  function status(text) {
    var el = $("wa-status");
    if (el) el.textContent = text || "";
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify({ goal: goal, days: days })); } catch (e) {}
  }
  function loadLocal() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
      days = saved.days && typeof saved.days === "object" ? saved.days : {};
      var n = Math.round(Number(saved.goal));
      if (n >= 250 && n <= 8000) goal = n;
    } catch (e) {}
  }
  function take(view) {
    if (!view || !view.water) return;
    days = view.water.days && typeof view.water.days === "object" ? view.water.days : {};
    var n = Math.round(Number(view.water.goal));
    if (n >= 250 && n <= 8000) goal = n;
    saveLocal();
  }
  function post(body) {
    status("Saving");
    return fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (view) {
      if (!view || view.ok === false) { status((view && view.error) || "Not saved"); return; }
      take(view);
      status("Saved");
      paint();
    }).catch(function () { status("Not saved"); });
  }
  function pull() {
    fetch(API, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (view) {
      if (!view || view.ok === false || !view.water) return;
      take(view);
      if ($("water-panel") && $("water-panel").style.display !== "none") paint();
    }).catch(function () {});
  }
  function show(on) {
    var p = $("water-panel");
    if (!p) return;
    if (!on) { p.style.display = "none"; p.classList.remove("on"); return; }
    document.querySelectorAll(".trend-panel, .struct-trend-panel").forEach(function (el) {
      if (el.id === "water-panel") return;
      el.style.display = "none";
      el.classList.remove("on");
    });
    ["tf-panels", "memegate-panel", "coin-panel", "antifomo-panel", "signal-panel"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.style.display = "none";
      el.classList.add("hidden");
    });
    p.style.display = "block";
    p.classList.add("on");
    paint();
    pull();
    if (p.scrollIntoView) p.scrollIntoView({ block: "start" });
  }
  window.showWater = show;
  loadLocal();
  var tabs = $("tf-tabs");
  if (tabs) tabs.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
    if (!b || b.getAttribute("data-tf") === "water") return;
    show(false);
  }, true);
  pull();
})();
