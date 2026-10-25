(function () {
  if (window.__experienceEntry) return;
  window.__experienceEntry = 1;
  var KEY = "trading_experience_entry_v1";
  var state = { risk: "", count: "", cap: "", log: [] };

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
    if (!state || typeof state !== "object") state = { risk: "", count: "", cap: "", log: [] };
    if (!Array.isArray(state.log)) state.log = [];
  }
  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function weekKey(t) {
    var d = new Date(t || Date.now());
    var day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function thisWeek() {
    var k = weekKey();
    return state.log.filter(function (row) { return weekKey(row.t) === k; });
  }
  function num(v) {
    var n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
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
  function field(label, id, value, hint) {
    return '<label style="display:block;margin-top:10px;color:#8b93a7;font-size:12px;font-weight:700">' + label +
      '<input id="' + id + '" value="' + esc(value) + '" inputmode="decimal" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:12px;border:0;border-radius:12px;background:#0b1016;color:#fff;font-size:16px;font-weight:800">' +
      '<span style="display:block;margin-top:4px;font-weight:500">' + hint + "</span></label>";
  }
  function paint() {
    var root = $("experience-tools");
    if (!root) return;
    var week = thisWeek();
    var usedN = week.length;
    var usedRisk = week.reduce(function (s, row) { return s + (num(row.risk) || 0); }, 0);
    var capN = num(state.count);
    var capRisk = num(state.cap);
    var countHit = capN != null && usedN >= capN;
    var riskHit = capRisk != null && usedRisk >= capRisk;
    root.innerHTML =
      '<article style="margin:14px 0;padding:14px;border-radius:16px;background:#12161d;border:1px solid #243041">' +
      "<b>Your ceilings</b>" +
      field("Risk per trade", "ee-risk", state.risk, "The fixed amount you can lose on one entry.") +
      field("Entries per week", "ee-count", state.count, "New entries, not adds.") +
      field("Capital at risk per week", "ee-cap", state.cap, "Sum of the risk on this week’s entries.") +
      '<button type="button" id="ee-save" style="margin-top:12px;border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#f4f7fb;color:#111">Save ceilings</button>' +
      '<div style="margin-top:12px;font-size:13px;line-height:1.45;color:' + ((countHit || riskHit) ? "#ff8a7a" : "#9aa6b6") + '">This week: ' + usedN + (capN != null ? " / " + capN : "") + " entries · risk " + (usedRisk ? usedRisk : 0) + (capRisk != null ? " / " + capRisk : "") + ((countHit || riskHit) ? ". Ceiling hit. No new entry." : "") + "</div></article>" +
      '<article style="margin:0 0 14px;padding:14px;border-radius:16px;background:#12161d;border:1px solid #243041">' +
      "<b>Log an entry</b>" +
      '<input id="ee-coin" placeholder="Coin" style="display:block;width:100%;box-sizing:border-box;margin-top:10px;padding:12px;border:0;border-radius:12px;background:#0b1016;color:#fff;font-size:16px">' +
      '<input id="ee-why" placeholder="Setup: weekly support hold, or breakout retest" style="display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:12px;border:0;border-radius:12px;background:#0b1016;color:#fff;font-size:14px">' +
      '<button type="button" id="ee-add" style="margin-top:10px;border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#1c2430;color:#e8eef6">Log it</button>' +
      '<div id="ee-log" style="margin-top:12px"></div></article>';
    var log = $("ee-log");
    log.innerHTML = state.log.slice(0, 30).map(function (row) {
      var when = new Date(row.t);
      var stamp = when.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return '<div style="padding:10px 0;border-top:1px solid #243041"><b>' + esc(row.coin) + "</b> · " + esc(row.risk || "—") +
        '<div style="color:#8b93a7;font-size:12px;margin-top:4px">' + esc(stamp) + " · " + esc(row.why || "no setup written") + "</div></div>";
    }).join("") || '<div style="color:#8b93a7;font-size:13px">No entries logged.</div>';
    $("ee-save").onclick = function () {
      state.risk = $("ee-risk").value.trim();
      state.count = $("ee-count").value.trim();
      state.cap = $("ee-cap").value.trim();
      write();
      paint();
    };
    $("ee-add").onclick = function () {
      var coin = $("ee-coin").value.trim();
      if (!coin) return;
      state.log.unshift({ t: Date.now(), coin: coin, risk: state.risk, why: $("ee-why").value.trim() });
      state.log = state.log.slice(0, 80);
      write();
      paint();
    };
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
