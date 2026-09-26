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
    var prices = [];
    if (box) box.querySelectorAll("[data-price]").forEach(function (row) {
      prices.push({
        entered: (row.querySelector("[data-entered]") || {}).value || "",
        current: (row.querySelector("[data-current]") || {}).value || ""
      });
    });
    if (!prices.length) prices = [{ entered: "", current: "" }];
    return {
      id: (draft && draft.id) || String(Date.now()),
      name: (($("fx-name") || {}).value || "").trim(),
      prices: prices,
      note: (($("fx-note") || {}).value || "").trim(),
      at: (draft && draft.at) || Date.now()
    };
  }
  function pager() {
    var n = items.length;
    var dis = "opacity:.35;pointer-events:none";
    return "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px\">" +
      "<button type=\"button\" data-prev style=\"padding:8px 12px;border-radius:10px;border:1px solid #243041;background:#121a24;color:#e8eef6;font-weight:800;" + (page <= 0 ? dis : "") + "\">Prev</button>" +
      "<span style=\"font-size:13px;font-weight:800;color:#c5d0dc\">" + (n ? (page + 1) + " / " + n : "0 / 0") + "</span>" +
      "<button type=\"button\" data-next style=\"padding:8px 12px;border-radius:10px;border:1px solid #243041;background:#121a24;color:#e8eef6;font-weight:800;" + (page >= n - 1 ? dis : "") + "\">Next</button></div>";
  }
  function priceTable(rows, edit) {
    var html = "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;font-size:11px;letter-spacing:.06em;color:#8491a1;font-weight:800\"><span>PRICE ENTERED</span><span>CURRENT PRICE</span></div>";
    (rows || []).forEach(function (row, i) {
      if (edit) {
        html += "<div data-price style=\"display:grid;grid-template-columns:1fr 1fr 28px;gap:8px;margin-top:8px\">" +
          "<input data-entered value=\"" + esc(row.entered) + "\" placeholder=\"Entered\" style=\"" + field() + "\">" +
          "<input data-current value=\"" + esc(row.current) + "\" placeholder=\"Current\" style=\"" + field() + "\">" +
          "<button type=\"button\" data-rm-price=\"" + i + "\" aria-label=\"Remove price\" style=\"border:0;background:transparent;color:#8491a1;font-size:18px;cursor:pointer\">×</button></div>";
      } else {
        html += "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;padding:10px 12px;border-radius:12px;background:#121a24;border:1px solid #243041;color:#e8eef6;font-weight:800\">" +
          "<span>" + esc(row.entered || "—") + "</span><span>" + esc(row.current || "—") + "</span></div>";
      }
    });
    return html;
  }
  function paint() {
    var box = $("fx-board");
    if (!box) return;
    var html = pager();
    html += "<div style=\"display:flex;gap:8px;margin-bottom:12px\"><button type=\"button\" data-new style=\"padding:10px 14px;border:0;border-radius:12px;background:#f5a14a;color:#1a1006;font-weight:900;cursor:pointer\">New</button></div>";
    if (mode === "edit" && draft) {
      html += "<label style=\"display:block;font-size:11px;letter-spacing:.06em;color:#8491a1;font-weight:800\">TICKET NAME</label>" +
        "<input id=\"fx-name\" value=\"" + esc(draft.name) + "\" placeholder=\"Ticket name\" style=\"" + field() + ";margin-top:6px\">" +
        priceTable(draft.prices, true) +
        "<button type=\"button\" data-add-price style=\"margin-top:8px;padding:8px 12px;border-radius:10px;border:1px solid #243041;background:#121a24;color:#e8eef6;font-weight:800;cursor:pointer\">+ price</button>" +
        "<label style=\"display:block;margin-top:14px;font-size:11px;letter-spacing:.06em;color:#8491a1;font-weight:800\">FINAL NOTE</label>" +
        "<textarea id=\"fx-note\" rows=\"3\" placeholder=\"Final note\" style=\"" + field() + ";margin-top:6px;resize:vertical\">" + esc(draft.note) + "</textarea>" +
        "<div style=\"display:flex;gap:8px;margin-top:12px\">" +
        "<button type=\"button\" data-save style=\"padding:10px 14px;border:0;border-radius:12px;background:#1a9b6c;color:#fff;font-weight:900;cursor:pointer\">Save</button>" +
        "<button type=\"button\" data-cancel style=\"padding:10px 14px;border-radius:12px;border:1px solid #243041;background:#121a24;color:#c5d0dc;font-weight:800;cursor:pointer\">Cancel</button></div>";
    } else if (!items.length) {
      html += "<div style=\"padding:18px 4px;color:#8491a1;font-size:14px\">No experiences yet. Add one ticket at a time.</div>";
    } else {
      var row = items[page] || items[0];
      html += "<div style=\"font-size:11px;letter-spacing:.06em;color:#8491a1;font-weight:800\">TICKET NAME</div>" +
        "<div style=\"margin-top:4px;font-size:20px;font-weight:900;color:#f4f7fb\">" + esc(row.name) + "</div>" +
        priceTable(row.prices, false) +
        "<div style=\"margin-top:14px;font-size:11px;letter-spacing:.06em;color:#8491a1;font-weight:800\">FINAL NOTE</div>" +
        "<div style=\"margin-top:6px;padding:12px;border-radius:12px;background:#121a24;border:1px solid #243041;color:#e8eef6;line-height:1.45;white-space:pre-wrap\">" + esc(row.note || "—") + "</div>" +
        "<div style=\"display:flex;gap:8px;margin-top:12px\">" +
        "<button type=\"button\" data-edit style=\"padding:10px 14px;border-radius:12px;border:1px solid #243041;background:#121a24;color:#e8eef6;font-weight:800;cursor:pointer\">Edit</button>" +
        "<button type=\"button\" data-drop style=\"padding:10px 14px;border:0;border-radius:12px;background:transparent;color:#ff8a7a;font-weight:800;cursor:pointer\">Delete</button></div>";
    }
    box.innerHTML = html;
    var st = $("fx-status");
    if (st && st.textContent !== "SAVED") st.textContent = items.length ? "SAVED" : "READY";
    bind(box);
  }
  function bind(box) {
    function go(sel, fn) {
      var el = box.querySelector(sel);
      if (el) el.addEventListener("click", fn);
    }
    go("[data-prev]", function () { if (page > 0) { page -= 1; mode = "view"; paint(); } });
    go("[data-next]", function () { if (page < items.length - 1) { page += 1; mode = "view"; paint(); } });
    go("[data-new]", function () { draft = blank(); mode = "edit"; paint(); });
    go("[data-edit]", function () {
      draft = JSON.parse(JSON.stringify(items[page]));
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
      if (at >= 0) page = at;
      mode = "view";
      draft = null;
      paint();
      pushRemote();
    });
    go("[data-drop]", function () {
      items.splice(page, 1);
      if (page >= items.length) page = Math.max(0, items.length - 1);
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
