(function () {
  if (window.__fomoEntry) return;
  window.__fomoEntry = 1;

  var KEY = "fomo_entry_checks_v1";
  var CHECKS = [
    "DCA entry please",
    "Always chunk entries. No big entry at once please"
  ];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&" + "amp;")
      .replace(/</g, "&" + "lt;")
      .replace(/>/g, "&" + "gt;")
      .replace(/"/g, "&" + "quot;");
  }
  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }
  function save(ticks) {
    try { localStorage.setItem(KEY, JSON.stringify(ticks)); } catch (e) {}
  }
  function hideOthers() {
    document.querySelectorAll(".trend-panel").forEach(function (p) {
      if (p.id === "fomo-panel") return;
      p.style.display = "none";
      p.classList.remove("on");
    });
    ["tf-panels", "memegate-panel", "coin-panel", "antifomo-panel", "signal-panel"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.style.display = "none";
      el.classList.add("hidden");
      el.classList.remove("on");
    });
  }
  function show(on) {
    var p = $("fomo-panel");
    if (!p) return;
    if (on) {
      hideOthers();
      p.style.display = "block";
      p.classList.add("on");
      paint();
    } else {
      p.style.display = "none";
      p.classList.remove("on");
    }
  }
  window.showFomoEntry = show;

  function paint() {
    var box = $("fomo-board");
    if (!box) return;
    var ticks = load();
    var html = "";
    CHECKS.forEach(function (text, i) {
      html += "<label style=\"display:flex;gap:12px;align-items:flex-start;padding:14px 0;border-bottom:1px solid #243041;color:#e8eef6;font-size:15px;line-height:1.45;font-weight:700\">" +
        "<input data-fomo=\"" + i + "\" type=\"checkbox\"" + (ticks[i] ? " checked" : "") + " style=\"width:18px;height:18px;margin-top:2px;accent-color:#f5a14a\">" +
        "<span>" + esc(text) + "</span></label>";
    });
    var ready = CHECKS.every(function (_t, i) { return ticks[i]; });
    html += "<div style=\"margin-top:14px;font-size:13px;font-weight:800;color:" + (ready ? "#3dbe7a" : "#8491a1") + "\">" +
      (ready ? "Both checked. Chunk the entry." : "Leave these ticked before a FOMO entry.") + "</div>";
    box.innerHTML = html;
    box.querySelectorAll("[data-fomo]").forEach(function (input) {
      input.addEventListener("change", function () {
        var next = load();
        next[Number(input.getAttribute("data-fomo"))] = input.checked;
        save(next);
        var st = $("fomo-status");
        if (st) st.textContent = CHECKS.every(function (_t, i) { return next[i]; }) ? "READY" : "CHECK";
        paint();
      });
    });
  }

  var tabs = document.getElementById("tf-tabs");
  if (tabs) {
    tabs.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
      if (!b || b.getAttribute("data-tf") === "fomo") return;
      show(false);
    });
  }
})();
