/* Sleep time + reason, and Diet (Sweet, Biryani, Carbs). Empty days stay green. Notes open only on a tap. */
(function () {
  var API = "https://trading-ohlcv.sasipudi.workers.dev/life-log";
  var KEY = "life_log_v1";
  var DIET = [["sweet", "Sweet"], ["biryani", "Biryani"], ["carbs", "Carbs"]];
  var data = { sleep: {}, diet: { sweet: {}, biryani: {}, carbs: {} } };
  var cursor = istParts(new Date());
  var dietTab = "sweet";
  var open = "";
  var which = "";

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function keyOf(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
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
    return { y: o.year, m: o.month, d: o.day };
  }
  function todayKey() {
    var t = istParts(new Date());
    return keyOf(t.y, t.m, t.d);
  }
  function monthLabel(y, m) {
    try { return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }); }
    catch (e) { return y + "-" + pad(m); }
  }
  function dayTitle(key) {
    var bits = key.split("-");
    try { return new Date(Date.UTC(+bits[0], +bits[1] - 1, +bits[2])).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }); }
    catch (e) { return key; }
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      return "&" + "quot;";
    });
  }
  function loadLocal() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
      data.sleep = saved.sleep && typeof saved.sleep === "object" ? saved.sleep : {};
      DIET.forEach(function (row) {
        var bag = saved.diet && saved.diet[row[0]];
        data.diet[row[0]] = bag && typeof bag === "object" ? bag : {};
      });
    } catch (e) {}
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }
  function take(remote) {
    if (!remote) return;
    if (remote.sleep && typeof remote.sleep === "object") data.sleep = remote.sleep;
    if (remote.diet) DIET.forEach(function (row) {
      if (remote.diet[row[0]] && typeof remote.diet[row[0]] === "object") data.diet[row[0]] = remote.diet[row[0]];
    });
    saveLocal();
  }
  function status(id, text) {
    var el = $(id);
    if (el) el.textContent = text || "";
  }
  function bag() {
    if (which === "diet") return data.diet[dietTab] || {};
    return data.sleep;
  }
  function shift(n) {
    var m = cursor.m + n;
    var y = cursor.y;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    cursor = { y: y, m: m, d: 1 };
    open = "";
    paint();
  }
  function paint() {
    var root = which === "diet" ? $("diet-cal") : $("slg-cal");
    if (!root || !which) return;
    var y = cursor.y;
    var m = cursor.m;
    var start = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    var count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var today = todayKey();
    var rows = bag();
    var cells = "";
    for (var i = 0; i < start; i++) cells += "<span></span>";
    for (var d = 1; d <= count; d++) {
      var key = keyOf(y, m, d);
      var hit = !!rows[key];
      var cls = "ll-day" + (hit ? (which === "sleep" ? " wrote" : " hit") : " clean") + (key === today ? " today" : "");
      cells += '<button type="button" class="' + cls + '" data-day="' + key + '"><span class="n">' + d + "</span></button>";
    }
    var have = open && rows[open];
    var popup = "";
    if (open) {
      var fields = which === "sleep"
        ? '<input id="ll-time" type="time" step="60" value="' + esc(have && have.time || "") + '" aria-label="Sleep time">' +
          '<textarea id="ll-note" rows="3" placeholder="Why this time" aria-label="Reason">' + esc(have && have.note || "") + "</textarea>"
        : '<textarea id="ll-note" rows="4" placeholder="What you had" aria-label="Notes">' + esc(have && have.note || "") + "</textarea>";
      popup = '<div class="ll-back" data-act="close"></div><div class="ll-pop"><div class="ll-pop-top"><strong>' + dayTitle(open) + "</strong></div>" +
        fields +
        '<div class="ll-row"><button type="button" data-act="close">Close</button>' +
        (have ? '<button type="button" data-act="clear">Clear</button>' : "") +
        '<button type="button" data-act="save">Save</button></div></div>';
    }
    var tabs = "";
    if (which === "diet") {
      tabs = '<div class="ll-tabs">' + DIET.map(function (row) {
        return '<button type="button" data-diet="' + row[0] + '"' + (row[0] === dietTab ? ' class="on"' : "") + ">" + row[1] + "</button>";
      }).join("") + "</div>";
    }
    root.innerHTML =
      tabs +
      '<div class="ll-top"><button type="button" class="ll-nav" data-act="prev" aria-label="Previous month">‹</button><h3>' + monthLabel(y, m) + '</h3><button type="button" class="ll-nav" data-act="next" aria-label="Next month">›</button></div>' +
      '<div class="ll-week"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div>' +
      '<div class="ll-grid">' + cells + "</div>" + popup;
  }
  function post(body) {
    var id = which === "diet" ? "diet-status" : "slg-status";
    status(id, "Saving");
    return fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (view) {
      if (!view || view.ok === false) {
        status(id, (view && view.error) || "Not saved");
        return;
      }
      take(view);
      status(id, "Saved");
      paint();
    }).catch(function () { status(id, "Not saved"); });
  }
  function saveOpen() {
    if (!open) return;
    var noteEl = $("ll-note");
    var note = noteEl ? noteEl.value : "";
    if (which === "sleep") {
      var timeEl = $("ll-time");
      var time = timeEl ? timeEl.value : "";
      if (!/^\d{2}:\d{2}$/.test(time || "")) {
        status("slg-status", "Add a sleep time");
        return;
      }
      data.sleep[open] = { time: time, note: String(note || "").trim(), t: Date.now() };
      saveLocal();
      var day = open;
      open = "";
      paint();
      post({ section: "sleep", day: day, time: time, note: note });
      return;
    }
    var text = String(note || "").trim();
    if (!text) {
      delete data.diet[dietTab][open];
      saveLocal();
      var blank = open;
      open = "";
      paint();
      post({ section: "diet", tab: dietTab, day: blank, clear: true });
      return;
    }
    data.diet[dietTab][open] = { note: text, t: Date.now() };
    saveLocal();
    var kept = open;
    open = "";
    paint();
    post({ section: "diet", tab: dietTab, day: kept, note: text });
  }
  function clearOpen() {
    if (!open) return;
    if (which === "sleep") delete data.sleep[open];
    else delete data.diet[dietTab][open];
    saveLocal();
    var day = open;
    var tab = dietTab;
    var section = which;
    open = "";
    paint();
    post({ section: section, tab: tab, day: day, clear: true });
  }
  function onClick(ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-act],[data-day],[data-diet]");
    if (!b) return;
    var diet = b.getAttribute("data-diet");
    if (diet) {
      dietTab = diet;
      open = "";
      paint();
      return;
    }
    var act = b.getAttribute("data-act");
    if (act === "prev") { shift(-1); return; }
    if (act === "next") { shift(1); return; }
    if (act === "close") { open = ""; paint(); return; }
    if (act === "save") { saveOpen(); return; }
    if (act === "clear") { clearOpen(); return; }
    var day = b.getAttribute("data-day");
    if (!day) return;
    open = day;
    paint();
    var box = document.querySelector(".ll-pop textarea, .ll-pop input");
    if (box) setTimeout(function () { try { box.focus(); } catch (e) {} }, 30);
  }
  function pull() {
    fetch(API, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (view) {
      if (!view || view.ok === false) return;
      take(view);
      if (which) paint();
    }).catch(function () {});
  }
  function hideBoth() {
    ["sleep-log-panel", "diet-panel"].forEach(function (id) {
      var p = $(id);
      if (!p) return;
      p.style.display = "none";
      p.classList.remove("on");
    });
    document.body.classList.remove("life-on");
    which = "";
    open = "";
  }
  function show(kind, on) {
    if (!on) {
      if (which === kind) hideBoth();
      return;
    }
    try { if (window.showSleep) window.showSleep(false); } catch (e) {}
    hideBoth();
    which = kind;
    open = "";
    var p = $(kind === "diet" ? "diet-panel" : "sleep-log-panel");
    if (!p) return;
    document.body.classList.add("life-on");
    p.style.display = "block";
    p.classList.add("on");
    paint();
    pull();
    var tabs = $("tf-tabs");
    if (tabs && tabs.scrollIntoView) tabs.scrollIntoView({ block: "start" });
  }
  window.showSleepLog = function (on) { show("sleep", on); };
  window.showDiet = function (on) { show("diet", on); };

  if (!document.getElementById("ll-style")) {
    var css = document.createElement("style");
    css.id = "ll-style";
    css.textContent = ".ll-top{display:flex;align-items:center;justify-content:space-between;margin:0 0 12px}.ll-top h3{margin:0;font-size:24px;font-weight:800}.ll-nav{width:36px;height:36px;border-radius:50%;border:0;background:#1a222e;color:#f4f7fb;font-size:20px;cursor:pointer}.ll-tabs{display:flex;gap:6px;margin:0 0 12px}.ll-tabs button{border:1px solid #2a3140;background:#12161d;color:#c5d0dc;border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer}.ll-tabs button.on{background:#1f8a4d;color:#fff;border-color:#1f8a4d}.ll-week,.ll-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px 0}.ll-week{margin-bottom:6px}.ll-week span{text-align:center;color:#8b95a5;font-size:11px;font-weight:800}.ll-day{border:0;background:transparent;padding:2px 0;cursor:pointer}.ll-day .n{width:36px;height:36px;margin:0 auto;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px}.ll-day.clean .n{background:#1f8a4d;color:#fff}.ll-day.hit .n{background:#e15d6a;color:#fff}.ll-day.wrote .n{background:#e6b023;color:#1a1406}.ll-day.today .n{box-shadow:0 0 0 2px #f4f7fb}.ll-back{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:40}.ll-pop{position:fixed;left:12px;right:12px;bottom:12px;z-index:41;padding:16px;border-radius:22px;background:#141b24;box-shadow:0 16px 50px rgba(0,0,0,.45)}.ll-pop-top{font-size:18px;margin-bottom:10px}#ll-time,#ll-note{width:100%;box-sizing:border-box;margin-top:8px;padding:12px;border:1px solid #3d4a5c;border-radius:12px;background:#0e131a;color:#f4f7fb;font-weight:700;color-scheme:dark}#ll-time{font-size:28px;font-weight:800}#ll-note{font-size:16px;resize:vertical}.ll-row{display:flex;gap:8px;margin-top:12px}.ll-row button{flex:1;padding:14px 8px;border:0;border-radius:12px;font-weight:800;cursor:pointer;background:#1a222e;color:#e8eef6}.ll-row button[data-act=save]{background:#f4f7fb;color:#111}.ll-row button[data-act=clear]{background:#3c1822;color:#ff9aa8}body.life-on main>section.section,body.life-on main>.trend-panel:not(#sleep-log-panel):not(#diet-panel),body.life-on #tf-panels{display:none!important}body.life-on #sleep-log-panel.on,body.life-on #diet-panel.on{display:block!important}";
    document.head.appendChild(css);
  }
  loadLocal();
  ["slg-cal", "diet-cal"].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener("click", onClick);
  });
  var tabs = $("tf-tabs");
  if (tabs) tabs.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
    if (!b) return;
    var tf = b.getAttribute("data-tf");
    if (tf !== "sleeplog" && tf !== "diet") hideBoth();
  }, true);
  pull();
})();
