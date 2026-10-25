(function () {
  if (window.__experienceEntry) return;
  window.__experienceEntry = 1;
  var KEY = "trading_experience_entry_v1";
  var state = { total: "", count: "", log: [] };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      return "&" + "quot;";
    });
  }
  function read() {
    try { state = JSON.parse(localStorage.getItem(KEY) || ""); } catch (e) { state = null; }
    if (!state || typeof state !== "object") state = { total: "", count: "", log: [] };
    if (!state.total && state.cap) state.total = state.cap;
    if (!Array.isArray(state.log)) state.log = [];
  }
  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function num(v) {
    var n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function weekKey(v) {
    var d;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      var p = v.split("-");
      d = new Date(+p[0], +p[1] - 1, +p[2]);
    } else d = new Date(v || Date.now());
    var day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function rowWhen(row) { return row.date || row.t; }
  function thisWeek() {
    var k = weekKey(today());
    return state.log.filter(function (row) { return weekKey(rowWhen(row)) === k; })
      .sort(function (a, b) { return String(rowWhen(a)).localeCompare(String(rowWhen(b))) || (a.t - b.t); });
  }
  function money(n) {
    if (n == null) return "—";
    return "$" + (Math.round(n * 100) / 100);
  }
  function hideOthers() {
    document.body.classList.remove("md-on", "wh-on", "cal-on", "sl-on");
    document.querySelectorAll(".trend-panel, .struct-trend-panel").forEach(function (p) {
      if (p.id === "experience-panel") return;
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
    try { window.showBtc && window.showBtc(false); } catch (e) {}
    try { window.showMemes && window.showMemes(false); } catch (e) {}
    try { window.showMarkets && window.showMarkets(false); } catch (e) {}
  }
  function field(label, id, value, type) {
    return '<label style="display:block;margin-top:10px;color:#8b93a7;font-size:12px;font-weight:700">' + label +
      '<input id="' + id + '" type="' + (type || "text") + '" value="' + esc(value) + '" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:12px;border:0;border-radius:12px;background:#0b1016;color:#fff;font-size:16px;font-weight:800">' +
      "</label>";
  }
  function paint() {
    var root = $("experience-tools");
    if (!root) return;
    var week = thisWeek();
    var total = num(state.total);
    var capN = num(state.count);
    var sum = 0;
    var rows = week.map(function (row, i) {
      var amount = num(row.amount != null ? row.amount : row.risk);
      var target = num(row.target);
      if (amount != null) sum += amount;
      var pct = total && amount != null ? Math.round(amount / total * 1000) / 10 : null;
      var over = capN != null && i + 1 > capN;
      var when = row.date || "";
      return '<article data-id="' + row.t + '" style="margin-top:10px;padding:12px;border-radius:14px;background:' + (over ? "#2a1416" : "#0b1016") + ';border:1px solid ' + (over ? "#ff6b6b" : "#243041") + '">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="color:' + (over ? "#ff8a7a" : "#7dffb3") + '">#' + (i + 1) + "</b><span style=\"color:#8b93a7;font-size:12px\">" + esc(when) + (over ? " · over trade" : "") + "</span></div>" +
        '<div style="margin-top:8px;font-size:14px">Target ' + money(target) + "</div>" +
        '<div style="margin-top:4px;font-size:14px">Amount ' + money(amount) + "</div>" +
        '<div style="margin-top:6px;font-size:18px;font-weight:900;color:' + (over ? "#ff8a7a" : "#fff") + '">' + (pct == null ? "Set a total amount" : pct + "% of total") + "</div>" +
        '<button type="button" data-drop="' + row.t + '" style="margin-top:8px;border:0;background:transparent;color:#ff8a7a;font-weight:800;padding:0">Remove</button></article>';
    }).join("");
    var sumPct = total ? Math.round(sum / total * 1000) / 10 : null;
    root.innerHTML =
      '<article style="margin:0 0 14px;padding:14px;border-radius:16px;background:#12161d;border:1px solid #243041">' +
      "<b>Total, then each buy</b>" +
      field("Total amount", "ee-total", state.total || "", "number") +
      field("Fixed entries per week", "ee-count", state.count || "", "number") +
      '<button type="button" id="ee-save" style="margin-top:12px;border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#f4f7fb;color:#111">Save</button>' +
      '<div style="margin-top:16px;font-size:13px;font-weight:800">New</div>' +
      '<select id="ee-kind" style="display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:12px;border:0;border-radius:12px;background:#0b1016;color:#fff;font-size:16px;font-weight:800"><option>New</option></select>' +
      field("Date", "ee-date", today(), "date") +
      field("Target USD", "ee-target", "", "number") +
      field("Amount", "ee-amount", "", "number") +
      '<button type="button" id="ee-add" style="margin-top:12px;border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#1c2430;color:#e8eef6">Add entry</button>' +
      '<div style="margin-top:12px;font-size:13px;line-height:1.45;color:#9aa6b6">This week: ' + week.length + (capN != null ? " / " + capN : "") + " entries" +
      (sumPct == null ? "" : " · " + sumPct + "% of total") + "</div>" +
      rows + "</article>";
    $("ee-save").onclick = function () {
      state.total = $("ee-total").value.trim();
      state.count = $("ee-count").value.trim();
      write();
      paint();
    };
    $("ee-add").onclick = function () {
      var amount = $("ee-amount").value.trim();
      var target = $("ee-target").value.trim();
      if (num(amount) == null) return;
      state.log.unshift({
        t: Date.now(),
        kind: $("ee-kind").value || "New",
        date: $("ee-date").value || today(),
        target: target,
        amount: amount
      });
      state.log = state.log.slice(0, 80);
      write();
      paint();
    };
    root.querySelectorAll("[data-drop]").forEach(function (btn) {
      btn.onclick = function () {
        var t = Number(btn.getAttribute("data-drop"));
        state.log = state.log.filter(function (row) { return row.t !== t; });
        write();
        paint();
      };
    });
  }
  function show(on) {
    var p = $("experience-panel");
    if (!p) return;
    if (!on) {
      p.style.display = "none";
      p.classList.remove("on");
      return;
    }
    hideOthers();
    p.style.display = "block";
    p.classList.add("on");
    read();
    paint();
    if (p.scrollIntoView) p.scrollIntoView({ block: "start" });
  }
  window.showExperience = show;
  var tabs = $("tf-tabs");
  if (tabs) tabs.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
    if (!b || b.getAttribute("data-tf") === "experience") return;
    show(false);
  }, true);
})();
