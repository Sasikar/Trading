(function () {
  if (window.__favDips) return;
  window.__favDips = 1;

  var API = "https://trading-ohlcv.sasipudi.workers.dev";
  var KEY = "fav_dips_v1";
  var PAGE = 5;
  var items = [];
  var page = 0;
  var mode = "view";
  var draft = null;
  var pushing = 0;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&" + "amp;")
      .replace(/</g, "&" + "lt;")
      .replace(/>/g, "&" + "gt;")
      .replace(/"/g, "&" + "quot;");
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
  }
  function loadLocal() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }
  function pushRemote() {
    pushing += 1;
    saveLocal();
    return fetch(API + "/fav-dips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: items })
    }).then(function (res) { return res.json(); }).then(function () {
      var st = $("fd-status");
      if (st) st.textContent = "SAVED";
    }).catch(function () {}).then(function () { pushing = Math.max(0, pushing - 1); });
  }
  function pull() {
    var seen = pushing;
    fetch(API + "/fav-dips", { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (body) {
        if (pushing !== seen || mode === "edit") return;
        if (body && body.saved) {
          items = body.items || [];
          saveLocal();
          if (page >= Math.ceil(items.length / PAGE)) page = Math.max(0, Math.ceil(items.length / PAGE) - 1);
          paint();
        }
      }).catch(function () {});
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
      if (!items.length) items = loadLocal();
      paint();
      pull();
    } else {
      p.style.display = "none";
      p.classList.remove("on");
    }
  }
  window.showFavDips = show;

  function blank() {
    return { id: String(Date.now()), date: today(), name: "", dip: "", support: "", at: Date.now() };
  }
  function box(extra) {
    return "display:block;width:100%;min-height:48px;box-sizing:border-box;padding:12px 14px;border-radius:12px;font-size:16px;font-weight:700;color:#f4f7fb;" + extra;
  }
  function readDraft() {
    return {
      id: (draft && draft.id) || String(Date.now()),
      date: (($("fd-date") || {}).value || "").trim(),
      name: (($("fd-name") || {}).value || "").trim(),
      dip: (($("fd-dip") || {}).value || "").trim(),
      support: (($("fd-sup") || {}).value || "").trim(),
      at: (draft && draft.at) || Date.now()
    };
  }
  function editor(row) {
    return "<div style=\"margin-bottom:14px;padding:14px;border-radius:16px;border:1px solid #3d4d63;background:#121a24\">" +
      "<div style=\"font-size:13px;font-weight:800;color:#f5a14a;margin-bottom:6px\">Date</div>" +
      "<input id=\"fd-date\" type=\"date\" value=\"" + esc(row.date) + "\" style=\"" + box("border:1px solid #8a5a22;background:#24180e") + "\">" +
      "<div style=\"margin-top:14px;font-size:13px;font-weight:800;color:#e8eef6;margin-bottom:6px\">Coin name</div>" +
      "<input id=\"fd-name\" value=\"" + esc(row.name) + "\" placeholder=\"Coin name\" style=\"" + box("border:1px solid #3d4d63;background:#0b121a") + "\">" +
      "<div style=\"margin-top:14px;font-size:13px;font-weight:800;color:#3dbe7a;margin-bottom:6px\">My fav dip price</div>" +
      "<input id=\"fd-dip\" value=\"" + esc(row.dip) + "\" placeholder=\"0.00\" inputmode=\"decimal\" style=\"" + box("border:1px solid #1f6b45;background:#102218") + "\">" +
      "<div style=\"margin-top:14px;font-size:13px;font-weight:800;color:#6eb6ff;margin-bottom:6px\">Coin actual support</div>" +
      "<input id=\"fd-sup\" value=\"" + esc(row.support) + "\" placeholder=\"0.00\" inputmode=\"decimal\" style=\"" + box("border:1px solid #2a5f8a;background:#101c2a") + "\">" +
      "<div style=\"display:flex;gap:8px;margin-top:14px\">" +
      "<button type=\"button\" data-save style=\"flex:1;padding:14px;border:0;border-radius:12px;background:#1a9b6c;color:#fff;font-size:16px;font-weight:900;cursor:pointer\">Save</button>" +
      "<button type=\"button\" data-cancel style=\"padding:14px 16px;border-radius:12px;border:1px solid #3d4d63;background:#1a2633;color:#f4f7fb;font-size:16px;font-weight:800;cursor:pointer\">Cancel</button></div></div>";
  }
  function cell() { return "padding:8px 4px;border-bottom:1px solid #243041;vertical-align:top;font-size:13px;line-height:1.35;word-break:break-word;color:#e8eef6"; }
  function paint() {
    var board = $("fd-board");
    if (!board) return;
    var pages = Math.max(1, Math.ceil(items.length / PAGE));
    if (page > pages - 1) page = pages - 1;
    if (page < 0) page = 0;
    var start = page * PAGE;
    var slice = items.slice(start, start + PAGE);
    var th = "padding:8px 4px;text-align:left;border-bottom:1px solid #3d4d63;font-size:11px;font-weight:800;white-space:normal";
    var html = "";
    if (mode === "edit" && draft) html += editor(draft);
    else html += "<div style=\"display:flex;justify-content:flex-end;margin-bottom:10px\"><button type=\"button\" data-new style=\"padding:8px 14px;border:0;border-radius:10px;background:#f5a14a;color:#1a1006;font-weight:900;cursor:pointer\">Add</button></div>";
    html += "<table style=\"width:100%;table-layout:fixed;border-collapse:collapse\"><thead><tr>" +
      "<th style=\"" + th + ";color:#f5a14a;width:22%\">Date</th>" +
      "<th style=\"" + th + ";color:#e8eef6;width:24%\">Coin</th>" +
      "<th style=\"" + th + ";color:#3dbe7a;width:22%\">Fav dip</th>" +
      "<th style=\"" + th + ";color:#6eb6ff\">Support</th>" +
      "<th style=\"" + th + ";width:36px\"></th></tr></thead><tbody>";
    if (!slice.length) html += "<tr><td colspan=\"5\" style=\"" + cell() + ";color:#8491a1\">No dips yet.</td></tr>";
    slice.forEach(function (row, i) {
      if (mode === "edit" && draft && draft.id === row.id) return;
      var index = start + i;
      html += "<tr style=\"background:" + (i % 2 ? "#101820" : "transparent") + "\">" +
        "<td style=\"" + cell() + "\">" + esc(row.date || "—") + "</td>" +
        "<td style=\"" + cell() + ";font-weight:800\">" + esc(row.name) + "</td>" +
        "<td style=\"" + cell() + ";color:#3dbe7a;font-weight:800\">" + esc(row.dip || "—") + "</td>" +
        "<td style=\"" + cell() + ";color:#6eb6ff;font-weight:800\">" + esc(row.support || "—") + "</td>" +
        "<td style=\"" + cell() + ";text-align:right\"><button type=\"button\" data-edit=\"" + index + "\" style=\"display:block;border:0;background:transparent;color:#6eb6ff;font-weight:800;cursor:pointer;padding:0\">Edit</button><button type=\"button\" data-drop=\"" + index + "\" style=\"border:0;background:transparent;color:#ff8a7a;font-weight:800;cursor:pointer;padding:0\">×</button></td></tr>";
    });
    html += "</tbody></table>";
    var n = items.length;
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
    var st = $("fd-status");
    if (st && st.textContent !== "SAVED") st.textContent = items.length ? "SAVED" : "READY";
    bind(board);
  }
  function bind(board) {
    function go(sel, fn) {
      board.querySelectorAll(sel).forEach(function (el) { el.addEventListener("click", fn); });
    }
    go("[data-prev]", function () { if (page > 0) { page -= 1; mode = "view"; paint(); } });
    go("[data-next]", function () { if (page < Math.ceil(items.length / PAGE) - 1) { page += 1; mode = "view"; paint(); } });
    go("[data-go]", function (ev) { page = Number(ev.currentTarget.getAttribute("data-go")) || 0; mode = "view"; paint(); });
    go("[data-new]", function () { draft = blank(); mode = "edit"; page = 0; paint(); });
    go("[data-edit]", function (ev) {
      draft = JSON.parse(JSON.stringify(items[Number(ev.currentTarget.getAttribute("data-edit"))]));
      mode = "edit";
      paint();
    });
    go("[data-cancel]", function () { mode = "view"; draft = null; paint(); });
    go("[data-save]", function () {
      draft = readDraft();
      if (!draft.name) return;
      var at = items.findIndex(function (row) { return row.id === draft.id; });
      if (at >= 0) { items[at] = draft; page = Math.floor(at / PAGE); }
      else { items.unshift(draft); page = 0; }
      mode = "view";
      draft = null;
      paint();
      pushRemote();
    });
    go("[data-drop]", function (ev) {
      items.splice(Number(ev.currentTarget.getAttribute("data-drop")), 1);
      var pages = Math.max(1, Math.ceil(items.length / PAGE));
      if (page > pages - 1) page = pages - 1;
      mode = "view";
      paint();
      pushRemote();
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
