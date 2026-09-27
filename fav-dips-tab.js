(function () {
  if (window.__favDips) return;
  window.__favDips = 1;

  var API = "https://trading-ohlcv.sasipudi.workers.dev";
  var KEY = "fav_dips_v1";
  var PAGE = 8;
  var TFS = ["5m", "15m", "1h", "2h", "4h", "1d", "1w"];
  var rows = [];
  var mine = [];
  var page = 0;
  var tab = "all";
  var pushing = 0;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&" + "amp;")
      .replace(/</g, "&" + "lt;")
      .replace(/>/g, "&" + "gt;")
      .replace(/"/g, "&" + "quot;");
  }
  function px(n) {
    var x = +n || 0;
    if (!(x > 0)) return "—";
    if (x >= 1) return x.toFixed(4);
    if (x >= 0.01) return x.toFixed(5);
    return x.toPrecision(4);
  }
  function level(row, tf) {
    var hit = (row.levels || []).filter(function (item) { return item.tf === tf; })[0];
    return hit && hit.px > 0 ? px(hit.px) : "—";
  }
  function mineOf(ca) {
    return mine.filter(function (item) { return String(item.ca || "").toLowerCase() === ca; })[0] || null;
  }
  function watched(ca) {
    var hit = mineOf(ca);
    return !!(hit && hit.watch);
  }
  function myDip(ca) {
    var hit = mineOf(ca);
    return hit ? hit.dip || "" : "";
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify({ items: mine })); } catch (e) {}
  }
  function loadLocal() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && Array.isArray(raw.items)) return raw.items;
      if (Array.isArray(raw)) return raw;
    } catch (e) {}
    return [];
  }
  function pushMine() {
    pushing += 1;
    saveLocal();
    return fetch(API + "/fav-dips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: mine })
    }).then(function (res) { return res.json(); }).then(function () {
      var st = $("fd-status");
      if (st) st.textContent = "SAVED";
      checkDipAlerts();
    }).catch(function () {}).then(function () { pushing = Math.max(0, pushing - 1); });
  }
  function pull() {
    var seen = pushing;
    Promise.all([
      fetch(API + "/fav-supports", { cache: "no-store" }).then(function (res) { return res.json(); }),
      fetch(API + "/fav-dips", { cache: "no-store" }).then(function (res) { return res.json(); })
    ]).then(function (both) {
      if (pushing !== seen) return;
      rows = (both[0] && both[0].rows) || [];
      if (both[1] && both[1].saved) mine = both[1].items || [];
      else if (!mine.length) mine = loadLocal();
      saveLocal();
      paint();
      var st = $("fd-status");
      if (st) st.textContent = rows.length ? "LIVE" : "EMPTY";
    }).catch(function () { paint(); });
  }
  function hideOthers() {
    document.querySelectorAll(".trend-panel").forEach(function (p) {
      if (p.id === "fd-panel") return;
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
    var p = $("fd-panel");
    if (!p) return;
    if (on) {
      hideOthers();
      p.style.display = "block";
      p.classList.add("on");
      var panels = $("tf-panels");
      if (panels) { panels.classList.add("hidden"); panels.style.display = "none"; }
      if (!mine.length) mine = loadLocal();
      paint();
      pull();
    } else {
      p.style.display = "none";
      p.classList.remove("on");
    }
  }
  window.showFavDips = show;
  var query = "";
  function filtered() {
    var q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(function (row) {
      return String(row.name || "").toLowerCase().indexOf(q) >= 0 || String(row.ca || "").toLowerCase().indexOf(q) >= 0;
    });
  }
  function listed() {
    var list = filtered();
    if (tab !== "mom") return list;
    return list.filter(function (row) { return watched(row.ca); });
  }
  function eye(on) {
    return "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"" + (on ? "#f5a14a" : "none") + "\" stroke=\"" + (on ? "#f5a14a" : "#8491a1") + "\" stroke-width=\"2\"><path d=\"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3\" fill=\"" + (on ? "#1a1006" : "none") + "\"/></svg>";
  }

  function paint() {
    var board = $("fd-board");
    if (!board) return;
    var list = listed();
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (page > pages - 1) page = Math.max(0, pages - 1);
    var start = page * PAGE;
    var slice = list.slice(start, start + PAGE);
    var th = "position:sticky;top:0;padding:8px 6px;text-align:right;background:#121a24;border-bottom:1px solid #3d4d63;font-size:11px;font-weight:800;white-space:nowrap";
    var td = "padding:8px 6px;border-bottom:1px solid #243041;text-align:right;font-size:12px;font-weight:800;white-space:nowrap;color:#c5d0dc";
    var momN = rows.filter(function (row) { return watched(row.ca); }).length;
    function chip(id, label) {
      var on = tab === id;
      return "<button type=\"button\" data-tab=\"" + id + "\" style=\"padding:8px 12px;border-radius:10px;border:1px solid " + (on ? "#3dbe7a" : "#243041") + ";background:" + (on ? "#102218" : "#121a24") + ";color:" + (on ? "#3dbe7a" : "#c5d0dc") + ";font-weight:800;cursor:pointer\">" + label + "</button>";
    }
    var html = "<div style=\"display:flex;gap:8px;margin-bottom:10px\">" + chip("all", "All") + chip("mom", "Momentum" + (momN ? " " + momN : "")) + "</div>";
    html += "<div style=\"overflow-x:auto\"><table style=\"border-collapse:collapse;min-width:760px\"><thead><tr>" +
      "<th style=\"" + th + ";left:0;z-index:1;text-align:left;color:#f4f7fb\">Coin</th>";
    TFS.forEach(function (tf) { html += "<th style=\"" + th + ";color:#8491a1\">" + tf + "</th>"; });
    html += "<th style=\"" + th + ";color:#3dbe7a\">Engine</th><th style=\"" + th + ";text-align:left;color:#f5a14a\">My dip</th></tr></thead><tbody>";
    if (!slice.length) html += "<tr><td colspan=\"10\" style=\"padding:12px;color:#8491a1\">" + (tab === "mom" ? "No momentum coins. Tap the eye on All." : query ? "No coin matches." : "No saved coins yet.") + "</td></tr>";
    slice.forEach(function (row, i) {
      html += "<tr style=\"background:" + (i % 2 ? "#101820" : "transparent") + "\">" +
        "<td style=\"" + td + ";position:sticky;left:0;background:#0e151d;text-align:left;color:#f4f7fb\">" +
        (tab === "all" ? "<button type=\"button\" data-watch=\"" + esc(row.ca) + "\" aria-label=\"Watch\" style=\"border:0;background:transparent;padding:0 6px 0 0;vertical-align:middle;cursor:pointer\">" + eye(watched(row.ca)) + "</button>" : "") +
        esc(row.name) +
        "<div style=\"font-size:10px;font-weight:700;color:#8491a1\">" + px(row.spot) + "</div></td>";
      TFS.forEach(function (tf) { html += "<td style=\"" + td + "\">" + level(row, tf) + "</td>"; });
      html += "<td style=\"" + td + ";color:#3dbe7a\">" + px(row.price) +
        "<div style=\"font-size:10px;font-weight:700;color:#8491a1;max-width:120px;white-space:normal\">" + esc(row.why || "") + "</div></td>" +
        "<td style=\"" + td + ";text-align:left\"><input data-dip=\"" + esc(row.ca) + "\" value=\"" + esc(myDip(row.ca)) + "\" inputmode=\"decimal\" placeholder=\"yours\" style=\"width:88px;padding:8px;border-radius:8px;border:1px solid #8a5a22;background:#24180e;color:#f4f7fb;font-weight:800\"></td></tr>";
    });
    html += "</tbody></table></div>";
    var n = list.length;
    var from = n ? start + 1 : 0;
    var to = Math.min(n, start + PAGE);
    var nums = "";
    for (var i = 0; i < pages; i++) {
      var on = i === page;
      nums += "<button type=\"button\" data-go=\"" + i + "\" style=\"min-width:32px;padding:6px 8px;border-radius:8px;border:1px solid " + (on ? "#f5a14a" : "#243041") + ";background:" + (on ? "#2a1c0e" : "#121a24") + ";color:" + (on ? "#f5a14a" : "#c5d0dc") + ";font-weight:800;cursor:pointer\">" + (i + 1) + "</button>";
    }
    var dis = "opacity:.35;pointer-events:none";
    html += "<div style=\"display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:12px\">" +
      "<span style=\"font-size:12px;color:#8491a1\">Showing " + from + " to " + to + " of " + n + "</span>" +
      "<span style=\"display:flex;gap:6px;flex-wrap:wrap\">" +
      "<button type=\"button\" data-prev style=\"padding:6px 10px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#e8eef6;font-weight:800;" + (page <= 0 ? dis : "") + "\">Prev</button>" +
      nums +
      "<button type=\"button\" data-next style=\"padding:6px 10px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#e8eef6;font-weight:800;" + (page >= pages - 1 ? dis : "") + "\">Next</button></span></div>";
    board.innerHTML = html;
    bind(board);
  }
  function bind(board) {
    board.querySelectorAll("[data-prev]").forEach(function (el) {
      el.addEventListener("click", function () { if (page > 0) { page -= 1; paint(); } });
    });
    board.querySelectorAll("[data-next]").forEach(function (el) {
      el.addEventListener("click", function () { if (page < Math.ceil(listed().length / PAGE) - 1) { page += 1; paint(); } });
    });
    board.querySelectorAll("[data-tab]").forEach(function (el) {
      el.addEventListener("click", function () {
        tab = el.getAttribute("data-tab") || "all";
        page = 0;
        paint();
      });
    });
    board.querySelectorAll("[data-watch]").forEach(function (el) {
      el.addEventListener("click", function () {
        var ca = el.getAttribute("data-watch");
        var row = rows.filter(function (item) { return item.ca === ca; })[0] || {};
        var prev = mineOf(ca) || {};
        var on = !prev.watch;
        var next = mine.filter(function (item) { return String(item.ca || "").toLowerCase() !== ca; });
        next.push({
          id: prev.id || ca,
          ca: ca,
          name: row.name || prev.name || ca,
          date: prev.date || "",
          dip: prev.dip || "",
          support: row.price ? String(row.price) : (prev.support || ""),
          watch: on,
          at: prev.at || Date.now()
        });
        mine = next;
        if (on) { tab = "mom"; page = 0; }
        paint();
        pushMine();
      });
    });
    board.querySelectorAll("[data-go]").forEach(function (el) {
      el.addEventListener("click", function () { page = Number(el.getAttribute("data-go")) || 0; paint(); });
    });
    board.querySelectorAll("[data-dip]").forEach(function (input) {
      input.addEventListener("change", function () {
        var ca = input.getAttribute("data-dip");
        var row = rows.filter(function (item) { return item.ca === ca; })[0] || {};
        var prev = mineOf(ca) || {};
        var next = mine.filter(function (item) { return String(item.ca || "").toLowerCase() !== ca; });
        next.push({ id: prev.id || ca, ca: ca, name: row.name || prev.name || ca, date: prev.date || "", dip: input.value.trim(), support: row.price ? String(row.price) : (prev.support || ""), watch: !!prev.watch, at: prev.at || Date.now() });
        mine = next;
        pushMine();
      });
    });
  }

  function dipNum(value) {
    var n = parseFloat(String(value || "").replace(/[^0-9.]/g, ""));
    return n > 0 ? n : 0;
  }
  function paintAlert(names) {
    var bar = $("dip-alert");
    var track = $("dip-alert-track");
    if (!bar || !track) return;
    if (!names.length) {
      bar.style.display = "none";
      track.textContent = "";
      return;
    }
    var line = names.map(function (name) { return name + " wonderful dip"; }).join("      ");
    track.textContent = (line + "      " + line + "      ");
    bar.style.display = "block";
    track.style.animation = "none";
    void track.offsetWidth;
    track.style.animation = "";
  }
  function checkDipAlerts() {
    Promise.all([
      fetch(API + "/fav-supports", { cache: "no-store" }).then(function (res) { return res.json(); }),
      fetch(API + "/fav-dips", { cache: "no-store" }).then(function (res) { return res.json(); })
    ]).then(function (both) {
      var live = (both[0] && both[0].rows) || [];
      var saved = (both[1] && both[1].saved ? both[1].items : mine) || [];
      var names = [];
      saved.forEach(function (item) {
        if (!item.watch) return;
        var dip = dipNum(item.dip);
        if (!dip) return;
        var ca = String(item.ca || "").toLowerCase();
        var row = live.filter(function (hit) { return hit.ca === ca; })[0];
        var spot = row ? +row.spot : 0;
        if (spot > 0 && spot < dip) names.push((row && row.name) || item.name || ca);
      });
      paintAlert(names);
    }).catch(function () {});
  }
  checkDipAlerts();
  setInterval(checkDipAlerts, 5 * 60 * 1000);

  var search = $("fd-search");
  if (search && !search.dataset.bound) {
    search.dataset.bound = "1";
    search.addEventListener("input", function () {
      query = search.value || "";
      page = 0;
      paint();
    });
  }
  var tabs = document.getElementById("tf-tabs");
  if (tabs) {
    tabs.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
      if (!b || b.getAttribute("data-tf") === "fd") return;
      show(false);
    });
  }
})();
