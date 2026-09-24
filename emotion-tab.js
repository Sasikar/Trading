(function () {
  if (window.__emotionTab) return;
  window.__emotionTab = 1;

  var KEY = "emotion_checks_v1";
  var CHECKS = [
    "If you're in profit, take your initial capital out. Then the rest is a free ride and you don't need to guess the top.",
    "No analysis can guarantee, only position sizing can help.",
    "New wallet for gamblers strictly.",
    "You have a lot of OGs. Fine to miss 10x to 100x on new coins.",
    "Paper sign is mandatory for any entry other than above $500.",
    "You are going to have a lot of runners every week. Once the bull starts, start saving 20% of gains on OGs to a new wallet.",
    "Protect the capital. Only gamble money with profits."
  ];
  var month = new Date();
  month.setDate(1);
  var picked = "";

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&" + "amp;")
      .replace(/</g, "&" + "lt;")
      .replace(/>/g, "&" + "gt;")
      .replace(/"/g, "&" + "quot;");
  }
  function dayKey(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function todayKey() { return dayKey(new Date()); }
  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (!raw || typeof raw !== "object") raw = {};
      if (!raw.days || typeof raw.days !== "object") raw.days = {};
      if (!Array.isArray(raw.log)) raw.log = [];
      return raw;
    } catch (e) {
      return { days: {}, log: [] };
    }
  }
  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }
  function hideOthers() {
    document.querySelectorAll(".trend-panel").forEach(function (p) {
      if (p.id === "emotion-panel") return;
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
    var p = $("emotion-panel");
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
  window.showEmotion = show;

  function checksHtml(saved) {
    var ticks = saved && saved.ticks;
    var allOn = ticks && ticks.length === CHECKS.length && ticks.every(Boolean);
    var html = "<label style=\"display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #243041;font-weight:800;color:#e8eef6\">" +
      "<input id=\"em-all\" type=\"checkbox\"" + (allOn ? " checked" : "") + "> Tick all</label>";
    CHECKS.forEach(function (text, i) {
      html += "<label style=\"display:flex;gap:10px;align-items:flex-start;padding:12px 0;border-bottom:1px solid #243041;color:#c5d0dc;font-size:14px;line-height:1.45\">" +
        "<input class=\"em-box\" type=\"checkbox\" data-i=\"" + i + "\"" + (ticks && ticks[i] ? " checked" : "") + " style=\"margin-top:3px\">" +
        "<span>" + esc(text) + "</span></label>";
    });
    html += "<button type=\"button\" id=\"em-submit\" style=\"margin-top:14px;width:100%;padding:12px;border:0;border-radius:10px;background:#1a9b6c;color:#fff;font-weight:800;cursor:pointer\">Submit</button>";
    html += "<div id=\"em-result\" style=\"margin-top:10px;font-size:13px;line-height:1.45\"></div>";
    return html;
  }

  function calendarHtml(data) {
    var year = month.getFullYear();
    var mon = month.getMonth();
    var first = new Date(year, mon, 1);
    var start = first.getDay();
    var days = new Date(year, mon + 1, 0).getDate();
    var label = first.toLocaleString(undefined, { month: "long", year: "numeric" });
    var html = "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-top:18px\">" +
      "<button type=\"button\" id=\"em-prev\" style=\"border:0;background:#121a24;color:#e8eef6;border-radius:8px;padding:8px 12px;font-weight:800;cursor:pointer\">‹</button>" +
      "<div style=\"font-weight:800;color:#e8eef6\">" + esc(label) + "</div>" +
      "<button type=\"button\" id=\"em-next\" style=\"border:0;background:#121a24;color:#e8eef6;border-radius:8px;padding:8px 12px;font-weight:800;cursor:pointer\">›</button></div>";
    html += "<div style=\"display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:10px;text-align:center;font-size:11px;color:#8491a1\">";
    ["S", "M", "T", "W", "T", "F", "S"].forEach(function (d) { html += "<div>" + d + "</div>"; });
    html += "</div><div style=\"display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:4px\">";
    for (var i = 0; i < start; i++) html += "<div></div>";
    var today = todayKey();
    for (var n = 1; n <= days; n++) {
      var key = year + "-" + String(mon + 1).padStart(2, "0") + "-" + String(n).padStart(2, "0");
      var row = data.days[key];
      var bg = "#121a24";
      var color = "#c5d0dc";
      if (row && row.ok) { bg = "#145c3a"; color = "#b6f5d4"; }
      else if (row && row.ok === false) { bg = "#6b2430"; color = "#ffd0d4"; }
      var ring = key === today ? "box-shadow:inset 0 0 0 1px #e8eef6;" : "";
      html += "<button type=\"button\" class=\"em-day\" data-day=\"" + key + "\" style=\"border:0;border-radius:8px;padding:8px 0;background:" + bg + ";color:" + color + ";font-weight:800;cursor:pointer;" + ring + "\">" + n + "</button>";
    }
    html += "</div>";
    html += "<div style=\"margin-top:8px;font-size:11px;color:#8491a1\">Green = every check ticked. Red = at least one missed. Saved on this phone.</div>";
    if (picked && data.days[picked]) {
      var hit = data.days[picked];
      var missed = CHECKS.filter(function (_, i) { return !hit.ticks || !hit.ticks[i]; });
      html += "<div style=\"margin-top:8px;font-size:13px;color:#e8eef6\">" + esc(picked) + " · " + (hit.ok ? "WIN" : "FAIL") + "</div>";
      if (!hit.ok && missed.length) {
        missed.forEach(function (text) {
          html += "<div style=\"margin-top:4px;font-size:12px;color:#ffb4bc\">Missed: " + esc(text) + "</div>";
        });
      }
    }
    return html;
  }

  function historyHtml(data) {
    var rows = (data.log || []).slice().reverse().slice(0, 30);
    var html = "<div style=\"margin-top:16px;font-size:11px;letter-spacing:.04em;color:#8491a1\">HISTORY</div>";
    if (!rows.length) return html + "<div style=\"margin-top:6px;font-size:13px;color:#8491a1\">No submits yet.</div>";
    rows.forEach(function (row) {
      var when = new Date(row.at);
      var stamp = isNaN(when.getTime()) ? row.day : when.toLocaleString();
      var color = row.ok ? "#3dbe7a" : "#ff8a7a";
      var missed = CHECKS.filter(function (_, i) { return !row.ticks || !row.ticks[i]; }).length;
      html += "<div style=\"display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid #243041;font-size:13px\">" +
        "<span style=\"color:#c5d0dc\">" + esc(stamp) + "</span>" +
        "<span style=\"color:" + color + ";font-weight:800\">" + (row.ok ? "WIN" : "FAIL" + (missed ? " · " + missed + " missed" : "")) + "</span></div>";
    });
    return html;
  }

  function paint() {
    var box = $("em-board");
    if (!box) return;
    var data = load();
    var today = data.days[todayKey()];
    box.innerHTML = checksHtml(data.days[todayKey()]) + calendarHtml(data) + historyHtml(data);
    var status = $("em-status");
    if (status) status.textContent = today ? (today.ok ? "TODAY WIN" : "TODAY FAIL") : "READY";
    var all = $("em-all");
    var boxes = [].slice.call(box.querySelectorAll(".em-box"));
    if (all) {
      all.addEventListener("change", function () {
        boxes.forEach(function (b) { b.checked = all.checked; });
      });
    }
    boxes.forEach(function (b) {
      b.addEventListener("change", function () {
        if (all) all.checked = boxes.every(function (x) { return x.checked; });
      });
    });
    var submit = $("em-submit");
    if (submit) submit.addEventListener("click", function () { submitDay(boxes.map(function (b) { return !!b.checked; })); });
    var prev = $("em-prev");
    var next = $("em-next");
    if (prev) prev.addEventListener("click", function () { month.setMonth(month.getMonth() - 1); paint(); });
    if (next) next.addEventListener("click", function () { month.setMonth(month.getMonth() + 1); paint(); });
    box.querySelectorAll(".em-day").forEach(function (b) {
      b.addEventListener("click", function () {
        picked = b.getAttribute("data-day") === picked ? "" : b.getAttribute("data-day");
        paint();
      });
    });
  }

  function submitDay(ticks) {
    var ok = ticks.length === CHECKS.length && ticks.every(Boolean);
    var data = load();
    var day = todayKey();
    var row = { day: day, at: Date.now(), ok: ok, ticks: ticks };
    data.days[day] = row;
    data.log.push(row);
    if (data.log.length > 180) data.log = data.log.slice(-180);
    save(data);
    picked = day;
    paint();
    var result = $("em-result");
    if (result) {
      result.style.color = ok ? "#3dbe7a" : "#ff8a7a";
      result.textContent = ok ? "WIN. Every check was ticked. This day is green." : "FAIL. At least one check was missed. This day is red.";
    }
  }

  function boot() {
    var tabs = $("tf-tabs");
    if (tabs) {
      tabs.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("#tf-tabs .tab") : null;
        if (!btn) return;
        setTimeout(function () {
          var act = document.querySelector("#tf-tabs .tab.active");
          show(!!(act && act.getAttribute("data-tf") === "emotion"));
        }, 0);
      });
    }
    var act = document.querySelector("#tf-tabs .tab.active");
    if (act && act.getAttribute("data-tf") === "emotion") show(true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
