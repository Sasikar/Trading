/* Overview only. Search, daily tiles, and groups. Nothing moves to the Health page. */
(function () {
  var GROUPS = {
    health: ["sleeplog", "diet", "gym", "saviour", "weight"],
    sindhu: ["steps", "food"],
    surya: ["water"],
    trade: ["fe", "fomo", "experience", "entrywindow", "decision", "antifomo", "position", "btc", "memes", "coin", "breakouts", "alerts", "pumpfun", "fd", "emotion", "verdict", "fx"],
    scanners: ["soulscanner", "cabalhunter", "rugradar", "defade", "trenchradar", "trenchcoat", "memeassist"],
    time: ["1h", "4h", "1d", "1w", "1M", "trend", "struct", "macro", "elliott"],
    research: ["cvd", "gmgn", "gmgnai", "hstrength", "holders", "hunter", "tiers", "sentiment", "failures", "inmemory", "keep", "keywords", "gnotes", "whale", "coinstats", "solchain", "markets", "etflive", "dex", "wallets", "cal", "mandates", "wowdip", "omg", "pitfalls", "strategy", "memegate", "cadelete"]
  };
  var ORDER = { mine: 8, health: 10, sindhu: 12, surya: 14, trade: 20, scanners: 30, research: 40, time: 50 };
  var LABEL = { mine: "Mine", health: "Health", sindhu: "Sindhu", surya: "Surya", trade: "Trade", scanners: "Scanners", research: "Research", time: "Time" };
  var filter = "all";
  var q = "";

  function groupOf(id) {
    if (String(id).indexOf("mine:") === 0) return "mine";
    var name;
    Object.keys(GROUPS).forEach(function (key) {
      if (GROUPS[key].indexOf(id) >= 0) name = key;
    });
    return name || "research";
  }
  function bar() { return document.getElementById("tf-tabs"); }
  function paint() {
    var root = bar();
    if (!root) return;
    var arranging = document.body.classList.contains("tab-arranging");
    var searching = q.length > 0;
    var showLabels = !arranging && !searching && filter === "all";
    root.querySelectorAll(".og-label").forEach(function (el) {
      el.style.display = showLabels ? "" : "none";
    });
    var mineLabel = root.querySelector(".og-label.og-mine");
    if (mineLabel && !root.querySelector('.tab[data-mine]')) mineLabel.style.display = "none";
    root.querySelectorAll(".tab").forEach(function (el) {
      var id = el.getAttribute("data-tf") || "";
      var group = groupOf(id);
      var text = (el.textContent || "").toLowerCase();
      var hit = !q || text.indexOf(q) >= 0 || id.indexOf(q) >= 0;
      var inGroup = filter === "all" || group === filter;
      el.style.display = arranging || (hit && inGroup) ? "" : "none";
      el.style.order = arranging || searching || filter !== "all" ? "0" : String(ORDER[group]);
      el.classList.toggle("og-health", group === "health");
      el.classList.toggle("og-sindhu", group === "sindhu");
      el.classList.toggle("og-surya", group === "surya");
    });
    var mineChip = document.querySelector('#og-chips [data-og="mine"]');
    if (mineChip) mineChip.style.display = root.querySelector(".tab[data-mine]") ? "" : "none";
    var arrange = document.getElementById("tab-arrange");
    if (arrange) arrange.style.order = "80";
  }
  function boot() {
    var root = bar();
    if (!root || document.getElementById("og-bar")) return;
    var box = document.createElement("div");
    box.id = "og-bar";
    box.innerHTML =
      '<input id="og-find" type="search" placeholder="Search tabs" autocomplete="off">' +
      '<div id="og-chips"></div>';
    root.parentNode.insertBefore(box, root);
    var fold = document.createElement("button");
    fold.id = "og-fold";
    fold.type = "button";
    fold.innerHTML = '<span id="og-fold-name">Tabs</span><span class="og-arrow">▾</span>';
    root.parentNode.insertBefore(fold, box);
    fold.addEventListener("click", function () {
      document.body.classList.remove("og-collapsed");
    });
    root.addEventListener("click", function (ev) {
      if (document.body.classList.contains("tab-arranging")) return;
      var tab = ev.target && ev.target.closest && ev.target.closest(".tab");
      if (!tab || tab.tagName === "A") return;
      var name = fold.querySelector("#og-fold-name");
      if (name) name.textContent = String(tab.textContent || "Tab").replace(/\s+/g, " ").trim();
      document.body.classList.add("og-collapsed");
      setTimeout(function () {
        var open = document.querySelector(".trend-panel.on, .struct-trend-panel.on");
        if (!open) {
          var panels = document.getElementById("tf-panels");
          if (panels && panels.style.display !== "none" && !panels.classList.contains("hidden")) open = panels;
        }
        if (open && open.scrollIntoView) open.scrollIntoView({ block: "start" });
      }, 40);
    }, true);
    var chips = box.querySelector("#og-chips");
    var plus = document.createElement("button");
    plus.id = "og-plus";
    plus.type = "button";
    plus.setAttribute("aria-label", "New tab");
    plus.textContent = "+";
    var maker = document.createElement("form");
    maker.id = "og-new";
    maker.innerHTML = '<input id="og-new-name" maxlength="32" placeholder="Tab name" autocomplete="off"><button type="submit">Add</button>';
    box.insertBefore(maker, chips);
    chips.insertBefore(plus, chips.firstChild);
    plus.addEventListener("click", function () {
      maker.style.display = maker.style.display === "flex" ? "none" : "flex";
      var input = maker.querySelector("input");
      if (maker.style.display === "flex" && input) input.focus();
    });
    maker.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var input = maker.querySelector("input");
      var name = String(input && input.value || "").replace(/\s+/g, " ").trim();
      if (!name || !window.addMineTab) return;
      window.addMineTab(name);
      input.value = "";
      maker.style.display = "none";
    });
    [["all", "All"]].concat(Object.keys(LABEL).map(function (key) { return [key, LABEL[key]]; })).forEach(function (item) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = item[1];
      b.setAttribute("data-og", item[0]);
      if (item[0] === "all") b.className = "on";
      b.addEventListener("click", function () {
        filter = item[0];
        chips.querySelectorAll("button").forEach(function (x) { x.className = x === b ? "on" : ""; });
        paint();
      });
      chips.appendChild(b);
    });
    box.querySelector("#og-find").addEventListener("input", function (ev) {
      q = String(ev.target.value || "").trim().toLowerCase();
      paint();
    });
    Object.keys(LABEL).forEach(function (key) {
      var label = document.createElement("div");
      label.className = "og-label";
      label.textContent = LABEL[key];
      label.style.order = String(ORDER[key] - 1);
      if (key === "health" || key === "sindhu" || key === "surya" || key === "mine") label.classList.add("og-" + key);
      root.appendChild(label);
    });
    var css = document.createElement("style");
    css.textContent = "#og-bar{margin:8px 0 0}#og-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}#og-plus{width:36px;height:36px;border:0;border-radius:50%;background:#e6c878;color:#1a1406;font-size:24px;font-weight:900;line-height:1}#og-new{display:none;gap:8px;margin:0 0 8px}#og-new input{flex:1;min-width:0;box-sizing:border-box;padding:12px 14px;border-radius:14px;border:1px solid #3d4a5c;background:#0e131a;color:#f4f7fb;font-size:16px;font-weight:700;color-scheme:dark}#og-new button{border:0;border-radius:12px;padding:0 14px;background:#e6c878;color:#1a1406;font-weight:900}#tf-tabs .og-label.og-mine{color:#ffe3a3;font-size:13px}#tf-tabs .tab[data-mine='1']{background:#2a2414;color:#ffe3a3;box-shadow:inset 0 0 0 1px #8a6a2a}#og-find{width:100%;box-sizing:border-box;margin:0 0 8px;padding:12px 14px;border-radius:14px;border:1px solid #3d4a5c;background:#0e131a;color:#f4f7fb;font-size:16px;font-weight:700}#og-chips{margin-bottom:8px}#og-chips button{border:0;border-radius:999px;padding:8px 12px;background:#17202b;color:#c5d0dc;font-weight:800}#og-chips button.on{background:#e6c878;color:#1a1406}#og-chips button[data-og=health]{background:#14382c;color:#c8ffe2;box-shadow:inset 0 0 0 1px #2f8a62}#og-chips button[data-og=health].on{background:#3dbe7a;color:#062015}#og-chips button[data-og=sindhu]{background:#2a2414;color:#ffe3a3;box-shadow:inset 0 0 0 1px #8a6a2a}#og-chips button[data-og=sindhu].on{background:#e6c878;color:#1a1406}#og-chips button[data-og=surya]{background:#102a38;color:#b7ecff;box-shadow:inset 0 0 0 1px #2a7a9a}#og-chips button[data-og=surya].on{background:#3db7e0;color:#062018}#tf-tabs .og-label.og-sindhu{color:#ffe3a3;font-size:13px}#tf-tabs .og-label.og-surya{color:#7fd4ff;font-size:13px}#tf-tabs .tab.og-sindhu[data-tf=steps]{color:#eafff4;background:#12352c;box-shadow:inset 0 0 0 1px #1f6b52}#tf-tabs .tab.og-sindhu[data-tf=food]{color:#ffd0d6;background:#2a161c;box-shadow:inset 0 0 0 1px #8a3a48}#tf-tabs .tab.og-surya[data-tf=water]{background:#102a38;color:#b7ecff;box-shadow:inset 0 0 0 1px #2a7a9a}#tf-tabs .og-label{flex:1 0 100%;margin:8px 2px 2px;color:#8b93a7;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}#tf-tabs .og-label.og-health{color:#7dffa9;font-size:13px}#tf-tabs .tab.og-health{color:#eafff4;background:#12352c;box-shadow:inset 0 0 0 1px #1f6b52}#tf-tabs .tab.og-health[data-tf=sleeplog]{background:#1a2744;color:#d6e4ff;box-shadow:inset 0 0 0 1px #3d5f99}#tf-tabs .tab.og-health[data-tf=diet]{background:#2a2414;color:#ffe3a3;box-shadow:inset 0 0 0 1px #8a6a2a}#tf-tabs .tab.og-health[data-tf=gym]{background:#2a1c12;color:#ffc9a3;box-shadow:inset 0 0 0 1px #c46a32}#tf-tabs .tab.og-health[data-tf=weight]{background:#2a1a28;color:#ffd0e4;box-shadow:inset 0 0 0 1px #8a4a6a}#tf-tabs .tab.og-health[data-tf=water]{background:#102a38;color:#b7ecff;box-shadow:inset 0 0 0 1px #2a7a9a}#tf-tabs .tab.og-health[data-tf=saviour]{background:#1e2a14;color:#d8f5a2;box-shadow:inset 0 0 0 1px #5a7a28}#tf-tabs .tab.og-health[data-tf=sleep]{background:#241c38;color:#e4d4ff;box-shadow:inset 0 0 0 1px #6a4a9a}#tf-tabs .tab.og-health.active{color:#fff!important;box-shadow:inset 0 0 0 2px #e6c878}body.tab-arranging #tf-tabs .og-label{display:none!important}body.tab-arranging #tf-tabs .tab{order:0!important}#og-fold{display:none;width:100%;margin:8px 0 0;padding:10px 14px;border:1px solid #3d4a5c;border-radius:14px;background:#121820;color:#f4f7fb;font-weight:800;font-size:15px;align-items:center;justify-content:space-between}#og-fold .og-arrow{color:#e6c878;font-size:22px;line-height:1}body.og-collapsed #og-fold{display:flex}body.og-collapsed #og-bar,body.og-collapsed #tf-tabs{display:none!important}";
    document.head.appendChild(css);
    window.ogPaint = paint;
    paint();
    new MutationObserver(paint).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
