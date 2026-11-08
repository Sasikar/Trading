/* Overview only. Search, daily tiles, and groups. Nothing moves to the Health page. */
(function () {
  var GROUPS = {
    health: ["sleeplog", "sleep", "diet", "saviour", "weight", "water"],
    trade: ["fe", "fomo", "experience", "entrywindow", "decision", "antifomo", "position", "btc", "memes", "coin", "breakouts", "alerts", "pumpfun", "fd", "emotion", "verdict", "fx"],
    scanners: ["soulscanner", "cabalhunter", "rugradar", "defade", "trenchradar", "trenchcoat", "memeassist"],
    time: ["1h", "4h", "1d", "1w", "1M", "trend", "struct", "macro"],
    research: ["gmgn", "gmgnai", "hstrength", "holders", "hunter", "tiers", "sentiment", "failures", "inmemory", "keep", "keywords", "gnotes", "whale", "coinstats", "solchain", "markets", "etflive", "dex", "wallets", "cal", "mandates", "wowdip", "omg", "pitfalls", "strategy", "memegate", "cadelete"]
  };
  var ORDER = { health: 10, trade: 20, scanners: 30, research: 40, time: 50 };
  var LABEL = { health: "Health", trade: "Trade", scanners: "Scanners", research: "Research", time: "Time" };
  var filter = "all";
  var q = "";

  function groupOf(id) {
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
    root.querySelectorAll(".tab").forEach(function (el) {
      var id = el.getAttribute("data-tf") || "";
      var group = groupOf(id);
      var text = (el.textContent || "").toLowerCase();
      var hit = !q || text.indexOf(q) >= 0 || id.indexOf(q) >= 0;
      var inGroup = filter === "all" || group === filter;
      el.style.display = arranging || (hit && inGroup) ? "" : "none";
      el.style.order = arranging || searching || filter !== "all" ? "0" : String(ORDER[group]);
    });
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
    var chips = box.querySelector("#og-chips");
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
      root.appendChild(label);
    });
    var css = document.createElement("style");
    css.textContent = "#og-bar{margin:8px 0 0}#og-chips{display:flex;flex-wrap:wrap;gap:6px}#og-find{width:100%;box-sizing:border-box;margin:0 0 8px;padding:12px 14px;border-radius:14px;border:1px solid #3d4a5c;background:#0e131a;color:#f4f7fb;font-size:16px;font-weight:700}#og-chips{margin-bottom:8px}#og-chips button{border:0;border-radius:999px;padding:8px 12px;background:#17202b;color:#c5d0dc;font-weight:800}#og-chips button.on{background:#e6c878;color:#1a1406}#tf-tabs .og-label{flex:1 0 100%;margin:8px 2px 2px;color:#8b93a7;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}body.tab-arranging #tf-tabs .og-label{display:none!important}body.tab-arranging #tf-tabs .tab{order:0!important}";
    document.head.appendChild(css);
    paint();
    new MutationObserver(paint).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
