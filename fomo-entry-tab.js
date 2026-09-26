(function () {
  if (window.__fomoEntry) return;
  window.__fomoEntry = 1;

  var KEY = "fomo_entry_checks_v2";
  var OLD = "fomo_entry_checks_v1";
  var DEFAULTS = [
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
  function seed() {
    var old = [];
    try { old = JSON.parse(localStorage.getItem(OLD) || "[]"); } catch (e) { old = []; }
    return DEFAULTS.map(function (text, i) {
      return { text: text, on: !!(Array.isArray(old) && old[i]), custom: false };
    });
  }
  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && Array.isArray(raw.items) && raw.items.length) {
        return raw.items.map(function (row) {
          return { text: String(row.text || "").slice(0, 160), on: !!row.on, custom: !!row.custom };
        }).filter(function (row) { return row.text; });
      }
    } catch (e) {}
    var items = seed();
    save(items);
    return items;
  }
  function save(items) {
    try { localStorage.setItem(KEY, JSON.stringify({ items: items })); } catch (e) {}
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
    var items = load();
    var ready = items.length && items.every(function (row) { return row.on; });
    var html = "<div style=\"display:flex;flex-direction:column;gap:10px\">";
    items.forEach(function (row, i) {
      html += "<label style=\"display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:14px;background:#121a24;border:1px solid #243041;color:#e8eef6;font-size:15px;line-height:1.45;font-weight:700\">" +
        "<input data-fomo=\"" + i + "\" type=\"checkbox\"" + (row.on ? " checked" : "") + " style=\"width:20px;height:20px;margin-top:1px;flex:none;accent-color:#f5a14a\">" +
        "<span style=\"flex:1\">" + esc(row.text) + "</span>" +
        (row.custom ? "<button type=\"button\" data-drop=\"" + i + "\" aria-label=\"Remove check\" style=\"border:0;background:transparent;color:#8491a1;font-weight:800;cursor:pointer;padding:0 2px\">×</button>" : "") +
        "</label>";
    });
    html += "</div>";
    html += "<form id=\"fomo-add\" style=\"display:flex;gap:8px;margin-top:14px\">" +
      "<input id=\"fomo-text\" maxlength=\"160\" placeholder=\"Add a check\" style=\"flex:1;min-width:0;padding:12px 14px;border-radius:12px;border:1px solid #243041;background:#0b121a;color:#e8eef6;font-size:14px\">" +
      "<button type=\"submit\" style=\"padding:12px 16px;border:0;border-radius:12px;background:#f5a14a;color:#1a1006;font-weight:900;cursor:pointer\">Add</button></form>";
    html += "<div style=\"margin-top:12px;font-size:13px;font-weight:800;color:" + (ready ? "#3dbe7a" : "#8491a1") + "\">" +
      (ready ? "All checked. Chunk the entry." : "Tick every line before a FOMO entry.") + "</div>";
    box.innerHTML = html;
    var st = $("fomo-status");
    if (st) st.textContent = ready ? "READY" : "CHECK";
    box.querySelectorAll("[data-fomo]").forEach(function (input) {
      input.addEventListener("change", function () {
        var next = load();
        var i = Number(input.getAttribute("data-fomo"));
        if (next[i]) next[i].on = input.checked;
        save(next);
        paint();
      });
    });
    box.querySelectorAll("[data-drop]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var next = load();
        next.splice(Number(btn.getAttribute("data-drop")), 1);
        save(next);
        paint();
      });
    });
    var form = $("fomo-add");
    if (form) form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var input = $("fomo-text");
      var text = (input && input.value || "").trim().slice(0, 160);
      if (!text) return;
      var next = load();
      if (next.length >= 30) return;
      next.push({ text: text, on: false, custom: true });
      save(next);
      paint();
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
