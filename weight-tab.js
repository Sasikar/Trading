/* Daily weight. Day, week, and month deltas on top. Up is green, down is red. */
(function () {
  var API = "https://trading-ohlcv.sasipudi.workers.dev/life-log";
  var KEY = "weight_log_v1";
  var days = {};
  var goal = 80;

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function istParts(date) {
    var o = { year: 2026, month: 1, day: 1 };
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
  function keyOf(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function todayKey() { return istParts(new Date()); }
  function addDays(key, n) {
    var p = key.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    d.setUTCDate(d.getUTCDate() + n);
    return keyOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      return "&" + "quot;";
    });
  }
  function kgOf(v) {
    var n = Number(v);
    return n >= 20 && n <= 400 ? Math.round(n * 10) / 10 : null;
  }
  function sorted() {
    return Object.keys(days).filter(function (k) { return days[k] && kgOf(days[k].kg) != null; }).sort();
  }
  function onOrBefore(key) {
    var keys = sorted();
    var hit = "";
    keys.forEach(function (k) { if (k <= key) hit = k; });
    return hit;
  }
  function delta(fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey || !days[fromKey] || !days[toKey]) return null;
    return Math.round((days[toKey].kg - days[fromKey].kg) * 10) / 10;
  }
  function pill(label, n) {
    var color = "#9aa6b6";
    var text = "—";
    if (n != null) {
      color = n > 0 ? "#3dbe7a" : n < 0 ? "#ff6b6b" : "#9aa6b6";
      text = (n > 0 ? "+" : "") + n.toFixed(1);
    }
    return '<div style="flex:1;padding:10px 6px;border-radius:14px;background:#12161d;text-align:center"><div style="color:#8b93a7;font-size:11px;font-weight:800">' + label + '</div><div style="margin-top:4px;color:' + color + ';font-size:22px;font-weight:900">' + text + "</div></div>";
  }
  function chart(keys) {
    if (!keys.length) return '<div style="margin-top:14px;color:#8b93a7;font-size:13px">No weight yet.</div>';
    var w = 640;
    var h = 220;
    var pad = { l: 36, r: 12, t: 16, b: 28 };
    var vals = keys.map(function (k) { return days[k].kg; });
    var min = Math.min.apply(null, vals.concat([goal]));
    var max = Math.max.apply(null, vals.concat([goal]));
    if (max - min < 1) { min -= 0.5; max += 0.5; }
    var span = max - min || 1;
    function x(i) { return pad.l + (keys.length === 1 ? (w - pad.l - pad.r) / 2 : i * (w - pad.l - pad.r) / (keys.length - 1)); }
    function y(v) { return pad.t + (max - v) * (h - pad.t - pad.b) / span; }
    var line = keys.map(function (k, i) { return x(i).toFixed(1) + "," + y(days[k].kg).toFixed(1); }).join(" ");
    var gy = y(goal);
    var dots = keys.map(function (k, i) {
      return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(days[k].kg).toFixed(1) + '" r="3.5" fill="#e6c878"/>';
    }).join("");
    var first = keys[0].slice(5);
    var last = keys[keys.length - 1].slice(5);
    return '<svg viewBox="0 0 ' + w + " " + h + '" style="width:100%;height:auto;margin-top:12px;background:#0e131a;border:1px solid #2a3140;border-radius:16px">' +
      '<line x1="' + pad.l + '" y1="' + gy.toFixed(1) + '" x2="' + (w - pad.r) + '" y2="' + gy.toFixed(1) + '" stroke="#3d4a5c" stroke-dasharray="4 4"/>' +
      '<text x="' + (pad.l + 4) + '" y="' + Math.max(12, gy - 4).toFixed(1) + '" fill="#8b93a7" font-size="11">' + goal + "</text>" +
      '<polyline fill="none" stroke="#e6c878" stroke-width="2.5" points="' + line + '"/>' + dots +
      '<text x="' + pad.l + '" y="' + (h - 8) + '" fill="#8b93a7" font-size="11">' + first + "</text>" +
      '<text x="' + (w - pad.r) + '" y="' + (h - 8) + '" fill="#8b93a7" font-size="11" text-anchor="end">' + last + "</text></svg>";
  }
  function paint() {
    var root = $("wt-board");
    if (!root) return;
    var keys = sorted();
    var latest = keys[keys.length - 1] || "";
    var prev = keys.length > 1 ? keys[keys.length - 2] : "";
    var dayN = delta(prev, latest);
    var weekN = latest ? delta(onOrBefore(addDays(latest, -7)), latest) : null;
    var monthN = latest ? delta(onOrBefore(addDays(latest, -30)), latest) : null;
    var rows = keys.slice().reverse().slice(0, 21).map(function (k) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid #243041"><span style="color:#c5d0dc">' + k + '</span><b>' + days[k].kg.toFixed(1) + '</b><button type="button" data-clear="' + k + '" style="border:0;background:transparent;color:#ff8a7a;font-weight:800">Clear</button></div>';
    }).join("");
    root.innerHTML =
      '<div style="display:flex;gap:8px">' + pill("Day", dayN) + pill("Week", weekN) + pill("Month", monthN) + "</div>" +
      '<div style="margin-top:12px;font-size:28px;font-weight:900">' + (latest ? days[latest].kg.toFixed(1) : "80.0") + ' <span style="font-size:14px;color:#8b93a7">kg</span></div>' +
      chart(keys) +
      '<form id="wt-form" style="display:flex;gap:8px;margin-top:14px">' +
      '<input id="wt-date" type="date" value="' + esc(todayKey()) + '" style="color-scheme:dark;border:1px solid #3d4a5c;background:#0e131a;color:#f4f7fb;border-radius:12px;padding:10px">' +
      '<input id="wt-kg" type="number" inputmode="decimal" min="20" max="400" step="0.1" placeholder="80.0" style="flex:1;min-width:0;color-scheme:dark;border:1px solid #3d4a5c;background:#0e131a;color:#f4f7fb;border-radius:12px;padding:10px;font-weight:800">' +
      '<button type="submit" style="border:0;border-radius:12px;padding:10px 14px;font-weight:900;background:#e6c878;color:#1a1408">Save</button></form>' +
      '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;color:#8b93a7;font-size:12px">Goal line<input id="wt-goal" type="number" min="20" max="400" step="0.1" value="' + goal + '" style="width:88px;color-scheme:dark;border:1px solid #3d4a5c;background:#0e131a;color:#f4f7fb;border-radius:10px;padding:8px;font-weight:800"></label>' +
      '<div style="margin-top:8px">' + rows + "</div>";
    var form = $("wt-form");
    if (form) form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      saveDay();
    });
    var goalBox = $("wt-goal");
    if (goalBox) goalBox.addEventListener("change", function () {
      var n = kgOf(goalBox.value);
      if (n == null) return;
      goal = n;
      saveLocal();
      paint();
      post({ section: "weight", goal: goal });
    });
    root.querySelectorAll("[data-clear]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var day = btn.getAttribute("data-clear");
        delete days[day];
        saveLocal();
        paint();
        post({ section: "weight", day: day, clear: true });
      });
    });
  }
  function saveDay() {
    var day = ($("wt-date") && $("wt-date").value) || todayKey();
    var kg = kgOf($("wt-kg") && $("wt-kg").value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || kg == null) {
      status("Enter a weight");
      return;
    }
    days[day] = { kg: kg, t: Date.now() };
    saveLocal();
    paint();
    post({ section: "weight", day: day, kg: kg });
  }
  function status(text) {
    var el = $("wt-status");
    if (el) el.textContent = text || "";
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify({ goal: goal, days: days })); } catch (e) {}
  }
  function loadLocal() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
      days = saved.days && typeof saved.days === "object" ? saved.days : {};
      var n = kgOf(saved.goal);
      if (n != null) goal = n;
    } catch (e) {}
  }
  function take(view) {
    if (!view || !view.weight) return;
    days = view.weight.days && typeof view.weight.days === "object" ? view.weight.days : {};
    var n = kgOf(view.weight.goal);
    if (n != null) goal = n;
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
      if (!view || view.ok === false || !view.weight) return;
      take(view);
      if ($("weight-panel") && $("weight-panel").style.display !== "none") paint();
    }).catch(function () {});
  }
  function show(on) {
    var p = $("weight-panel");
    if (!p) return;
    if (!on) {
      p.style.display = "none";
      p.classList.remove("on");
      return;
    }
    document.querySelectorAll(".trend-panel, .struct-trend-panel").forEach(function (el) {
      if (el.id === "weight-panel") return;
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
  window.showWeight = show;
  loadLocal();
  var tabs = $("tf-tabs");
  if (tabs) tabs.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
    if (!b || b.getAttribute("data-tf") === "weight") return;
    show(false);
  }, true);
  pull();
})();
