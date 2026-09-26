(function () {
  if (window.__fomoExperiences) return;
  window.__fomoExperiences = 1;

  var API = "https://trading-ohlcv.sasipudi.workers.dev";
  var KEY = "fomo_experiences_v1";
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
    return fetch(API + "/fomo-experiences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: items })
    }).then(function (res) { return res.json(); }).then(function () {
      var st = $("fx-status");
      if (st) st.textContent = "SAVED";
    }).catch(function () {}).then(function () { pushing = Math.max(0, pushing - 1); });
  }
  function pull() {
    var seen = pushing;
    fetch(API + "/fomo-experiences", { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (body) {
        if (pushing !== seen || mode === "edit") return;
        if (body && body.saved) {
          items = body.items || [];
          saveLocal();
          if (page >= items.length) page = Math.max(0, items.length - 1);
          paint();
        }
      }).catch(function () {});
  }
  function hideOthers() {
    document.querySelectorAll(".trend-panel").forEach(function (p) {
      if (p.id === "fx-panel") return;
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
    var p = $("fx-panel");
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
  window.showFomoExperiences = show;

  function blank() {
    return { id: String(Date.now()), name: "", prices: [{ entered: "", current: "" }], note: "", at: Date.now() };
  }
  function field() {
    return "width:100%;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1px solid #243041;background:#0b121a;color:#e8eef6;font-size:14px";
  }
  function readDraft() {
    var box = $("fx-board");
    var entered = [];
    var current = [];
    if (box) {
      box.querySelectorAll("[data-entered]").forEach(function (el) { entered.push(el.value || ""); });
      box.querySelectorAll("[data-current]").forEach(function (el) { current.push(el.value || ""); });
    }
    var count = Math.max(entered.length, current.length, 1);
    var prices = [];
    for (var i = 0; i < count; i++) prices.push({ entered: entered[i] || "", current: current[i] || "" });
    return {
      id: (draft && draft.id) || String(Date.now()),
      name: (($("fx-name") || {}).value || "").trim(),
      prices: prices,
      note: (($("fx-note") || {}).value || "").trim(),
      at: (draft && draft.at) || Date.now()
    };
  }
  var PAGE = 5;
  function field() {
    return "width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid #243041;background:#0b121a;color:#e8eef6;font-size:13px";
  }
  function head() {
    var th = "padding:10px 8px;text-align:left;border-bottom:1px solid #3d4d63;color:#8491a1;font-size:11px;letter-spacing:.04em;font-weight:800";
    return "<th style=\"" + th + "\">Ticket name</th><th style=\"" + th + "\">Price entered</th><th style=\"" + th + "\">Current price</th><th style=\"" + th + "\">Final note</th><th style=\"" + th + "\"></th>";
  }
  function cell() { return "padding:10px 8px;border-bottom:1px solid #243041;vertical-align:top;color:#e8eef6"; }
  function lines(rows, key) {
    return (rows || []).map(function (row) { return esc(row[key] || "—"); }).join("<br>") || "—";
  }
  function editCells(row) {
    var entered = "";
    var current = "";
    (row.prices || []).forEach(function (price, i) {
      entered += "<input data-entered value=\"" + esc(price.entered) + "\" placeholder=\"Entered\" style=\"" + field() + ";margin-top:" + (i ? "6px" : "0") + "\">";
      current += "<div data-price style=\"display:flex;gap:4px;margin-top:" + (i ? "6px" : "0") + "\">" +
        "<input data-current value=\"" + esc(price.current) + "\" placeholder=\"Current\" style=\"" + field() + "\">" +
        "<button type=\"button\" data-rm-price=\"" + i + "\" style=\"border:0;background:transparent;color:#8491a1;font-size:16px;cursor:pointer\">×</button></div>";
    });
    return "<td style=\"" + cell() + "\"><input id=\"fx-name\" value=\"" + esc(row.name) + "\" placeholder=\"Ticket name\" style=\"" + field() + "\"></td>" +
      "<td style=\"" + cell() + "\">" + entered + "<button type=\"button\" data-add-price style=\"margin-top:6px;padding:4px 8px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#c5d0dc;font-size:11px;font-weight:800;cursor:pointer\">+</button></td>" +
      "<td style=\"" + cell() + "\">" + current + "</td>" +
      "<td style=\"" + cell() + "\"><textarea id=\"fx-note\" rows=\"2\" placeholder=\"Final note\" style=\"" + field() + ";resize:vertical\">" + esc(row.note) + "</textarea></td>" +
      "<td style=\"" + cell() + ";white-space:nowrap\"><button type=\"button\" data-save style=\"padding:6px 8px;border:0;border-radius:8px;background:#1a9b6c;color:#fff;font-weight:800;cursor:pointer\">Save</button> <button type=\"button\" data-cancel style=\"padding:6px 8px;border:0;background:transparent;color:#8491a1;font-weight:800;cursor:pointer\">Cancel</button></td>";
  }
  function viewCells(row, index) {
    return "<td style=\"" + cell() + ";font-weight:800\">" + esc(row.name) + "</td>" +
      "<td style=\"" + cell() + "\">" + lines(row.prices, "entered") + "</td>" +
      "<td style=\"" + cell() + "\">" + lines(row.prices, "current") + "</td>" +
      "<td style=\"" + cell() + "\">" + esc(row.note || "—") + "</td>" +
      "<td style=\"" + cell() + ";white-space:nowrap\"><button type=\"button\" data-edit=\"" + index + "\" style=\"border:0;background:transparent;color:#6eb6ff;font-weight:800;cursor:pointer\">Edit</button> <button type=\"button\" data-drop=\"" + index + "\" style=\"border:0;background:transparent;color:#ff8a7a;font-weight:800;cursor:pointer\">×</button></td>";
  }
  function pager(start) {
    var n = items.length;
    var pages = Math.max(1, Math.ceil(n / PAGE));
    var from = n ? start + 1 : 0;
    var to = Math.min(n, start + PAGE);
    var nums = "";
    for (var i = 0; i < pages; i++) {
      var on = i === page;
      nums += "<button type=\"button\" data-go=\"" + i + "\" style=\"min-width:32px;padding:6px 8px;border-radius:8px;border:1px solid " + (on ? "#f5a14a" : "#243041") + ";background:" + (on ? "#2a1c0e" : "#121a24") + ";color:" + (on ? "#f5a14a" : "#c5d0dc") + ";font-weight:800;cursor:pointer\">" + (i + 1) + "</button>";
    }
    var dis = "opacity:.35;pointer-events:none";
    return "<div style=\"display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:12px\">" +
      "<span style=\"font-size:12px;color:#8491a1\">Showing " + from + " to " + to + " of " + n + "</span>" +
      "<span style=\"display:flex;gap:6px;flex-wrap:wrap\">" +
      "<button type=\"button\" data-prev style=\"padding:6px 10px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#e8eef6;font-weight:800;" + (page <= 0 ? dis : "") + "\">Prev</button>" +
      nums +
      "<button type=\"button\" data-next style=\"padding:6px 10px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#e8eef6;font-weight:800;" + (page >= pages - 1 ? dis : "") + "\">Next</button></span></div>";
  }
  function paint() {
    var box = $("fx-board");
    if (!box) return;
    var pages = Math.max(1, Math.ceil(items.length / PAGE));
    if (page > pages - 1) page = pages - 1;
    if (page < 0) page = 0;
    var start = page * PAGE;
    var slice = items.slice(start, start + PAGE);
    var html = "<div style=\"display:flex;justify-content:flex-end;margin-bottom:10px\"><button type=\"button\" data-new style=\"padding:8px 14px;border:0;border-radius:10px;background:#f5a14a;color:#1a1006;font-weight:900;cursor:pointer\">Add</button></div>";
    html += "<div style=\"overflow-x:auto\"><table style=\"width:100%;border-collapse:collapse;font-size:13px\"><thead><tr>" + head() + "</tr></thead><tbody>";
    if (mode === "edit" && draft && !items.some(function (row) { return row.id === draft.id; })) html += "<tr>" + editCells(draft) + "</tr>";
    if (!slice.length && mode !== "edit") html += "<tr><td colspan=\"5\" style=\"" + cell() + ";color:#8491a1\">No rows yet.</td></tr>";
    slice.forEach(function (row, i) {
      var index = start + i;
      html += "<tr style=\"background:" + (i % 2 ? "#101820" : "transparent") + "\">" +
        (mode === "edit" && draft && draft.id === row.id ? editCells(draft) : viewCells(row, index)) + "</tr>";
    });
    html += "</tbody></table></div>" + pager(start);
    box.innerHTML = html;
    var st = $("fx-status");
    if (st && st.textContent !== "SAVED") st.textContent = items.length ? "SAVED" : "READY";
    bind(box);
  }
  function bind(box) {
    function go(sel, fn) {
      box.querySelectorAll(sel).forEach(function (el) { el.addEventListener("click", fn); });
    }
    go("[data-prev]", function () { if (page > 0) { page -= 1; mode = "view"; paint(); } });
    go("[data-next]", function () { if (page < Math.ceil(items.length / PAGE) - 1) { page += 1; mode = "view"; paint(); } });
    go("[data-go]", function (ev) { page = Number(ev.currentTarget.getAttribute("data-go")) || 0; mode = "view"; paint(); });
    go("[data-new]", function () { draft = blank(); mode = "edit"; page = 0; paint(); });
    go("[data-edit]", function (ev) {
      var index = Number(ev.currentTarget.getAttribute("data-edit"));
      draft = JSON.parse(JSON.stringify(items[index]));
      mode = "edit";
      paint();
    });
    go("[data-cancel]", function () { mode = "view"; draft = null; paint(); });
    go("[data-add-price]", function () {
      draft = readDraft();
      if (draft.prices.length < 12) draft.prices.push({ entered: "", current: "" });
      paint();
    });
    go("[data-save]", function () {
      draft = readDraft();
      if (!draft.name) return;
      draft.prices = draft.prices.filter(function (row) { return row.entered || row.current; });
      var at = items.findIndex(function (row) { return row.id === draft.id; });
      if (at >= 0) items[at] = draft;
      else { items.unshift(draft); page = 0; }
      if (at >= 0) page = Math.floor(at / PAGE);
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
    box.querySelectorAll("[data-rm-price]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        draft = readDraft();
        draft.prices.splice(Number(btn.getAttribute("data-rm-price")), 1);
        if (!draft.prices.length) draft.prices.push({ entered: "", current: "" });
        paint();
      });
    });
  }

  var tabs = document.getElementById("tf-tabs");
  if (tabs) {
    tabs.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
      if (!b || b.getAttribute("data-tf") === "fx") return;
      show(false);
    });
  }
})();
