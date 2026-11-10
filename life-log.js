/* Sleep time + reason, and Diet (Sweet, Biryani, Carbs). Empty days stay green. Notes open only on a tap. */
(function () {
  var API = "https://trading-ohlcv.sasipudi.workers.dev/life-log";
  var KEY = "life_log_v1";
  var DIET = [["biryani", "Biryani"], ["sweet", "Sweets"], ["carbs", "Carbs"]];
  var data = { sleep: {}, diet: { sweet: {}, biryani: {}, carbs: {} }, saviour: { topics: [], logs: {} }, gym: {}, food: {}, steps: {}, custom: { topics: [], logs: {} } };
  var cursor = istParts(new Date());
  var dietTab = "biryani";
  var saviourTab = "";
  var customTab = "";
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
      var topics = [];
      var rawTopics = saved.saviour && Array.isArray(saved.saviour.topics) ? saved.saviour.topics : [];
      rawTopics.forEach(function (name) {
        name = String(name || "").replace(/\s+/g, " ").trim().slice(0, 32);
        if (name && topics.indexOf(name) < 0) topics.push(name);
      });
      var logs = {};
      topics.forEach(function (name) {
        var bag = saved.saviour && saved.saviour.logs && saved.saviour.logs[name];
        logs[name] = bag && typeof bag === "object" ? bag : {};
      });
      data.saviour = { topics: topics, logs: logs };
      if (topics.indexOf(saviourTab) < 0) saviourTab = topics[0] || "";
      data.gym = saved.gym && typeof saved.gym === "object" ? saved.gym : {};
      data.food = saved.food && typeof saved.food === "object" ? saved.food : {};
      data.steps = saved.steps && typeof saved.steps === "object" ? saved.steps : {};
      var customTopics = [];
      var rawCustom = saved.custom && Array.isArray(saved.custom.topics) ? saved.custom.topics : [];
      rawCustom.forEach(function (name) {
        name = String(name || "").replace(/\s+/g, " ").trim().slice(0, 32);
        if (name && customTopics.indexOf(name) < 0) customTopics.push(name);
      });
      var customLogs = {};
      customTopics.forEach(function (name) {
        var bag = saved.custom && saved.custom.logs && saved.custom.logs[name];
        customLogs[name] = bag && typeof bag === "object" ? bag : {};
      });
      data.custom = { topics: customTopics, logs: customLogs };
      if (customTopics.indexOf(customTab) < 0) customTab = customTopics[0] || "";
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
    if (remote.saviour && Array.isArray(remote.saviour.topics)) {
      data.saviour = { topics: remote.saviour.topics.slice(), logs: remote.saviour.logs || {} };
      if (data.saviour.topics.indexOf(saviourTab) < 0) saviourTab = data.saviour.topics[0] || "";
    }
    if (remote.gym && typeof remote.gym === "object") data.gym = remote.gym;
    if (remote.food && typeof remote.food === "object") data.food = remote.food;
    if (remote.steps && typeof remote.steps === "object") data.steps = remote.steps;
    if (remote.custom && Array.isArray(remote.custom.topics)) {
      data.custom = { topics: remote.custom.topics.slice(), logs: remote.custom.logs || {} };
      if (data.custom.topics.indexOf(customTab) < 0) customTab = data.custom.topics[0] || "";
    }
    saveLocal();
  }
  function status(id, text) {
    var el = $(id);
    if (el) el.textContent = text || "";
  }
  function bag() {
    if (which === "diet") return data.diet[dietTab] || {};
    if (which === "gym") return data.gym || {};
    if (which === "food") return data.food || {};
    if (which === "steps") return data.steps || {};
    if (which === "custom") return (data.custom.logs && data.custom.logs[customTab]) || {};
    if (which === "saviour") return (data.saviour.logs && data.saviour.logs[saviourTab]) || {};
    return data.sleep;
  }
  function panelId() {
    if (which === "diet") return "diet-cal";
    if (which === "gym") return "gym-cal";
    if (which === "food") return "food-cal";
    if (which === "steps") return "steps-cal";
    if (which === "custom") return "mine-cal";
    if (which === "saviour") return "sv-cal";
    return "slg-cal";
  }
  function statusId() {
    if (which === "diet") return "diet-status";
    if (which === "gym") return "gym-status";
    if (which === "food") return "food-status";
    if (which === "steps") return "steps-status";
    if (which === "custom") return "mine-status";
    if (which === "saviour") return "sv-status";
    return "slg-status";
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
    var root = $(panelId());
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
      var band = "";
      if (which === "steps") {
        var steps = rows[key] ? Number(rows[key].n) : null;
        band = steps == null || !isFinite(steps) ? " none" : steps >= 5000 ? " hi" : steps >= 3000 ? " mid" : " zero";
      }
      var cls = "ll-day" + (which === "steps" ? band : (hit ? " hit" : " clean")) + (key === today ? " today" : "");
      cells += '<button type="button" class="' + cls + '" data-day="' + key + '"><span class="n">' + d + "</span></button>";
    }
    var have = open && rows[open];
    var popup = "";
    if (open) {
      var fields = which === "sleep"
        ? '<input id="ll-time" type="time" step="60" value="' + esc(have && have.time || "") + '" aria-label="Sleep time">' +
          '<textarea id="ll-note" rows="3" placeholder="Why this time" aria-label="Reason">' + esc(have && have.note || "") + "</textarea>"
        : which === "steps"
        ? '<input id="ll-steps" type="number" inputmode="numeric" min="0" max="100000" step="100" placeholder="Steps" value="' + esc(have && have.n != null ? have.n : "") + '" aria-label="Steps">'
        : '<textarea id="ll-note" rows="4" placeholder="' + (which === "custom" ? "Notes" : which === "saviour" ? "What happened" : which === "gym" ? "What you did" : which === "food" ? "What you ate" : "What you had") + '" aria-label="Notes">' + esc(have && have.note || "") + "</textarea>";
      popup = '<div class="ll-back" data-act="close"></div><div class="ll-pop"><div class="ll-pop-top"><strong>' + dayTitle(open) + "</strong></div>" +
        fields +
        '<div class="ll-row"><button type="button" data-act="close">Close</button>' +
        (have ? '<button type="button" data-act="clear">Clear</button>' : "") +
        '<button type="button" data-act="save">Save</button></div></div>';
    }
    var tabs = "";
    if (which === "custom" && customTab) {
      tabs = '<div class="ll-mine"><b>' + esc(customTab) + '</b><button type="button" data-act="drop-mine">Remove</button></div>';
    }
    if (which === "diet") {
      tabs = '<div class="ll-tabs">' + DIET.map(function (row) {
        return '<button type="button" data-diet="' + row[0] + '"' + (row[0] === dietTab ? ' class="on"' : "") + ">" + row[1] + "</button>";
      }).join("") + "</div>";
    }
    if (which === "saviour") {
      tabs = '<form class="ll-add" data-act="add-topic"><input id="sv-topic" placeholder="New topic" maxlength="32" autocomplete="off" style="flex:1;min-width:0;color-scheme:dark;border:1px solid #3d4a5c;background:#0e131a;color:#f4f7fb;border-radius:12px;padding:10px;font-size:14px"><button type="submit">Add</button></form>' +
        '<div class="ll-tabs">' + data.saviour.topics.map(function (name) {
          return '<button type="button" data-sav="' + esc(name) + '"' + (name === saviourTab ? ' class="on"' : "") + ">" + esc(name) +
            (name === saviourTab ? ' <i data-drop-topic="1">×</i>' : "") + "</button>";
        }).join("") + "</div>";
    }
    root.innerHTML =
      tabs +
      '<div class="ll-top"><button type="button" class="ll-nav" data-act="prev" aria-label="Previous month">‹</button><h3>' + monthLabel(y, m) + '</h3><button type="button" class="ll-nav" data-act="next" aria-label="Next month">›</button></div>' +
      '<div class="ll-week"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div>' +
      '<div class="ll-grid">' + cells + "</div>" +
      (which === "steps" ? '<div class="ll-key"><i class="hi"></i>5k+<i class="mid"></i>3k–5k<i class="zero"></i>Under 3k</div>' : "") +
      popup;
  }
  function post(body) {
    var id = statusId();
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
    if (which === "steps") {
      var stepEl = $("ll-steps");
      var steps = Math.round(Number(stepEl && stepEl.value));
      if (!(steps >= 0 && steps <= 100000)) {
        status("steps-status", "Add steps");
        return;
      }
      data.steps[open] = { n: steps, t: Date.now() };
      saveLocal();
      var stepDay = open;
      open = "";
      paint();
      post({ section: "steps", day: stepDay, n: steps });
      return;
    }
    if (which === "custom" && !customTab) {
      status("mine-status", "Name the tab");
      return;
    }
    if (which === "saviour" && !saviourTab) {
      status("sv-status", "Add a topic first");
      return;
    }
    var text = String(note || "").trim();
    var store = which === "saviour" ? data.saviour.logs[saviourTab] : which === "custom" ? data.custom.logs[customTab] : which === "gym" ? data.gym : which === "food" ? data.food : data.diet[dietTab];
    var tab = which === "saviour" ? saviourTab : which === "custom" ? customTab : dietTab;
    if (!text) {
      delete store[open];
      saveLocal();
      var blank = open;
      open = "";
      paint();
      post({ section: which, tab: tab, day: blank, clear: true });
      return;
    }
    store[open] = { note: text, t: Date.now() };
    saveLocal();
    var kept = open;
    open = "";
    paint();
    post({ section: which, tab: tab, day: kept, note: text });
  }
  function clearOpen() {
    if (!open) return;
    if (which === "sleep") delete data.sleep[open];
    else if (which === "gym") delete data.gym[open];
    else if (which === "food") delete data.food[open];
    else if (which === "steps") delete data.steps[open];
    else if (which === "custom" && data.custom.logs[customTab]) delete data.custom.logs[customTab][open];
    else if (which === "saviour" && data.saviour.logs[saviourTab]) delete data.saviour.logs[saviourTab][open];
    else delete data.diet[dietTab][open];
    saveLocal();
    var day = open;
    var tab = which === "saviour" ? saviourTab : which === "custom" ? customTab : dietTab;
    var section = which;
    open = "";
    paint();
    post({ section: section, tab: tab, day: day, clear: true });
  }
  function addTopic(ev) {
    if (ev) ev.preventDefault();
    var input = $("sv-topic");
    var name = String(input && input.value || "").replace(/\s+/g, " ").trim().slice(0, 32);
    if (!name) return;
    if (data.saviour.topics.indexOf(name) < 0) data.saviour.topics.push(name);
    if (!data.saviour.logs[name]) data.saviour.logs[name] = {};
    saviourTab = name;
    saveLocal();
    open = "";
    paint();
    post({ section: "saviour", topicAct: "add", topic: name });
  }
  function dropTopic(name) {
    data.saviour.topics = data.saviour.topics.filter(function (item) { return item !== name; });
    delete data.saviour.logs[name];
    if (saviourTab === name) saviourTab = data.saviour.topics[0] || "";
    saveLocal();
    open = "";
    paint();
    post({ section: "saviour", topicAct: "drop", topic: name });
  }
  function renderMine() {
    var root = $("tf-tabs");
    if (!root || !data.custom) return;
    root.querySelectorAll(".tab[data-mine]").forEach(function (el) { el.remove(); });
    data.custom.topics.forEach(function (name) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tab";
      b.setAttribute("data-mine", "1");
      b.setAttribute("data-tf", "mine:" + name);
      b.textContent = name;
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        document.querySelectorAll("#tf-tabs .tab").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        var panels = $("tf-panels");
        if (panels) { panels.classList.add("hidden"); panels.style.display = "none"; }
        customTab = name;
        show("custom", true);
      });
      root.appendChild(b);
    });
    if (window.ogPaint) window.ogPaint();
  }
  function addMineTab(name) {
    name = String(name || "").replace(/\s+/g, " ").trim().slice(0, 32);
    if (!name) return;
    if (!data.custom.logs) data.custom = { topics: [], logs: {} };
    if (data.custom.topics.indexOf(name) < 0) {
      if (data.custom.topics.length >= 24) {
        status("mine-status", "24 tabs is the limit");
        return;
      }
      data.custom.topics.push(name);
      data.custom.logs[name] = {};
    }
    customTab = name;
    saveLocal();
    renderMine();
    post({ section: "custom", topicAct: "add", topic: name });
    var btn = null;
    document.querySelectorAll("#tf-tabs .tab[data-mine]").forEach(function (el) {
      if (el.textContent === name) btn = el;
    });
    if (btn) btn.click();
  }
  function dropMine(name) {
    data.custom.topics = data.custom.topics.filter(function (item) { return item !== name; });
    delete data.custom.logs[name];
    if (customTab === name) customTab = "";
    saveLocal();
    open = "";
    hideBoth();
    renderMine();
    post({ section: "custom", topicAct: "drop", topic: name });
  }
  function onClick(ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-act],[data-day],[data-diet],[data-sav],[data-drop-topic]");
    if (!b) return;
    if (b.getAttribute("data-drop-topic")) {
      ev.preventDefault();
      dropTopic(saviourTab);
      return;
    }
    var sav = b.getAttribute("data-sav");
    if (sav) {
      saviourTab = sav;
      open = "";
      paint();
      return;
    }
    var diet = b.getAttribute("data-diet");
    if (diet) {
      dietTab = diet;
      open = "";
      paint();
      return;
    }
    var act = b.getAttribute("data-act");
    if (act === "drop-mine") { dropMine(customTab); return; }
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
      renderMine();
      if (which) paint();
    }).catch(function () {});
  }
  function hideBoth() {
    ["sleep-log-panel", "diet-panel", "saviour-panel", "gym-panel", "food-panel", "steps-panel", "mine-panel"].forEach(function (id) {
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
    var panels = { diet: "diet-panel", gym: "gym-panel", food: "food-panel", steps: "steps-panel", custom: "mine-panel", saviour: "saviour-panel", sleep: "sleep-log-panel" };
    var p = $(panels[which] || "sleep-log-panel");
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
  window.showGym = function (on) { show("gym", on); };
  window.showFood = function (on) { show("food", on); };
  window.showSteps = function (on) { show("steps", on); };
  window.showSaviour = function (on) { show("saviour", on); };
  window.addMineTab = addMineTab;

  if (!document.getElementById("ll-style")) {
    var css = document.createElement("style");
    css.id = "ll-style";
    css.textContent = ".ll-top{display:flex;align-items:center;justify-content:space-between;margin:0 0 12px}.ll-top h3{margin:0;font-size:24px;font-weight:800}.ll-nav{width:36px;height:36px;border-radius:50%;border:0;background:#1a222e;color:#f4f7fb;font-size:20px;cursor:pointer}.ll-tabs{display:flex;gap:6px;margin:0 0 12px}.ll-tabs button{border:1px solid #2a3140;background:#12161d;color:#c5d0dc;border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer}.ll-tabs button.on{background:#1f8a4d;color:#fff;border-color:#1f8a4d}.ll-week,.ll-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px 0}.ll-week{margin-bottom:6px}.ll-week span{text-align:center;color:#8b95a5;font-size:11px;font-weight:800}.ll-day{border:0;background:transparent;padding:2px 0;cursor:pointer}.ll-day .n{width:36px;height:36px;margin:0 auto;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px}.ll-day.clean .n{background:#1f8a4d;color:#fff}.ll-day.hit .n,.ll-day.wrote .n{background:#e15d6a;color:#fff}.ll-day.today .n{box-shadow:0 0 0 2px #f4f7fb}.ll-back{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:40}.ll-pop{position:fixed;left:12px;right:12px;bottom:12px;z-index:41;padding:16px;border-radius:22px;background:#141b24;box-shadow:0 16px 50px rgba(0,0,0,.45)}.ll-pop-top{font-size:18px;margin-bottom:10px}#ll-time,#ll-note{width:100%;box-sizing:border-box;margin-top:8px;padding:12px;border:1px solid #3d4a5c;border-radius:12px;background:#0e131a;color:#f4f7fb;font-weight:700;color-scheme:dark}#ll-time{font-size:28px;font-weight:800}#ll-note{font-size:16px;resize:vertical}.ll-row{display:flex;gap:8px;margin-top:12px}.ll-row button{flex:1;padding:14px 8px;border:0;border-radius:12px;font-weight:800;cursor:pointer;background:#1a222e;color:#e8eef6}.ll-row button[data-act=save]{background:#f4f7fb;color:#111}.ll-row button[data-act=clear]{background:#3c1822;color:#ff9aa8}body.life-on main>section.section{display:none!important}.ll-day.hi .n{background:#1f8a4d;color:#fff}.ll-day.mid .n{background:#e6b84d;color:#1a1406}.ll-day.zero .n{background:#3a4150;color:#c5d0dc}.ll-day.none .n{background:#1a222e;color:#6d7688}.ll-key{display:flex;gap:8px;align-items:center;margin-top:12px;color:#9aa6b5;font-size:12px;font-weight:800}.ll-key i{width:12px;height:12px;border-radius:50%;display:inline-block}.ll-key i.hi{background:#1f8a4d}.ll-key i.mid{background:#e6b84d}.ll-key i.zero{background:#3a4150}#ll-steps{width:100%;box-sizing:border-box;margin-top:8px;padding:12px;border:1px solid #3d4a5c;border-radius:12px;background:#0e131a;color:#f4f7fb;font-size:28px;font-weight:800;color-scheme:dark}.ll-mine{display:flex;justify-content:space-between;align-items:center;margin:0 0 12px}.ll-mine button{border:0;background:transparent;color:#ff8a7a;font-weight:800}body.life-on main>.trend-panel:not(#sleep-log-panel):not(#diet-panel):not(#saviour-panel):not(#gym-panel):not(#food-panel):not(#steps-panel):not(#mine-panel),body.life-on #tf-panels{display:none!important}body.life-on #sleep-log-panel.on,body.life-on #diet-panel.on,body.life-on #saviour-panel.on,body.life-on #gym-panel.on,body.life-on #food-panel.on,body.life-on #steps-panel.on,body.life-on #mine-panel.on{display:block!important}.ll-add{display:flex;gap:8px;margin:0 0 12px}.ll-add button{border:0;border-radius:12px;padding:10px 14px;font-weight:900;background:#e6c878;color:#1a1408}.ll-tabs{flex-wrap:wrap}.ll-tabs i{font-style:normal;margin-left:6px;color:#ffb4bc}";
    document.head.appendChild(css);
  }
  loadLocal();
  renderMine();
  ["slg-cal", "diet-cal", "sv-cal", "gym-cal", "food-cal", "steps-cal", "mine-cal"].forEach(function (id) {
    var el = $(id);
    if (el) {
      el.addEventListener("click", onClick);
      el.addEventListener("submit", function (ev) {
        if (ev.target && ev.target.getAttribute("data-act") === "add-topic") addTopic(ev);
      });
    }
  });
  var tabs = $("tf-tabs");
  if (tabs) tabs.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
    if (!b) return;
    var tf = b.getAttribute("data-tf");
    if (tf.indexOf("mine:") === 0 || tf === "sleeplog" || tf === "diet" || tf === "gym" || tf === "food" || tf === "steps" || tf === "saviour") return;
    hideBoth();
  }, true);
  pull();
})();
