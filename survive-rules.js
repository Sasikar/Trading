/* Survive Rules. Cut from Experience Entry. Add, edit, clear. Sits under US futures. */
(function () {
  var API = "https://trading-ohlcv.sasipudi.workers.dev/life-log";
  var SEED = [
    ["Three bags", "Fear bag 50%\nLocked.\nOpens only in Fear or Extreme Fear.\nAnd only in a dip zone.\n\nSwing bag 30%\nThe rules below are for this bag only. Position sizing. Newest coins, 10–20% starter. Trade count. Risk cap. Start small, 25–33%. Wait for the weekly setup. Journal. Dry powder.\n\nPump/Swing bag 20%\nNo rules.\nTrade it your way, full size.\nYour own style."],
    ["Miss the pump", "It's absolutely fine to miss a pump. It's unacceptable to go underwater or blow my capital.\n\nMissing a pump costs me nothing. Blowing my capital costs me everything."],
    ["Cash for dips", "Always keep cash ready for dips. Before I buy anything, I confirm I have money set aside for:\n\nA normal correction, about 10%.\nA normal pullback, about 20%.\nA deep pullback, about 30%.\nA major crash, 50% or more."],
    ["Position sizing", "Fixed risk per trade. The amount you can lose is the same every time. A coin you like does not get a bigger risk."],
    ["Newest coins", "Entry is 10–20% max, as a starter position only. Jeanphil God Gift Recovery."],
    ["Trade count limit", "A ceiling on entries per week. When the count is hit, no new coin until next week."],
    ["Risk cap", "A ceiling on total capital at risk per week. Open risk plus a new entry stays under that number."],
    ["Start small", "The first buy is 25–33% of the planned size. Add the rest only if the setup is still there. This takes the edge off FOMO."],
    ["Wait for setup", "On that coin, one of these must show. A weekly close holding support. Or a breakout retest of weekly resistance. No setup, no entry."],
    ["Journal", "Every entry gets logged. Coin, risk, and why the setup was there."],
    ["Dry powder", "Do you have dry powder for:\n\nNext week?\nNext month?\nNext year?\nThe next biggest opportunity?\n\nIf the answer is no, this entry is too big."],
    ["Dry zone", "Keep a percent of funds for dry moments.\n\nPrice stuck in that zone.\nThat cash stays there.\nNot for a pump."],
    ["Fear", "Keep funds for:\n\nFear.\nExtreme Fear.\n\nThat money is for those days. A green day does not get it."],
    ["Long hold", "I stay fully independent from my crypto.\n\nNo loans, debts, or outside bills can force a sale.\n\nMy setup can carry a hold of 2–3 years or longer.\n\nTime for the idea to play out. No pressure, no panic, and no need to sell for cash."],
    ["Nourish", "Nourish the right conditions.\n\nThe rest will take care of itself."],
    ["Small crash", "For a small crash, use a small amount.\n\nCash out the small profit.\n\nThat helps with monthly bills.\n\nThe long hold stays untouched."]
  ];
  var rows = [];
  var editing = "";
  var asking = "";
  var gen = 0;
  var seeded = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      return "&" + "quot;";
    });
  }
  function nid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function keepTitle(raw) { return String(raw || "").replace(/\s+/g, " ").trim().slice(0, 80); }
  function keepBody(raw) {
    return String(raw || "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim().slice(0, 1200);
  }
  function cleanRow(row) {
    if (!row) return null;
    var id = String(row.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 24);
    var title = keepTitle(row.title);
    var text = keepBody(row.text);
    if (!id || !title || !text) return null;
    return { id: id, title: title, text: text, t: Number(row.t) || 0 };
  }
  function localRow(row) {
    if (!row) return null;
    var id = String(row.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 24);
    if (!id) return null;
    return { id: id, title: keepTitle(row.title), text: keepBody(row.text), t: Number(row.t) || 0 };
  }
  function seedRows() {
    var list = SEED.map(function (pair, i) {
      return { id: "sr" + (i + 1), title: pair[0], text: pair[1], t: i + 1 };
    });
    try {
      var old = JSON.parse(localStorage.getItem("trading_experience_entry_v1") || "");
      var extra = old && Array.isArray(old.rules) ? old.rules : [];
      extra.forEach(function (row) {
        var title = keepTitle(row && row.title);
        var text = keepBody(row && row.body);
        if (!title || !text || title === "Title" || text === "Write the rule.") return;
        list.push({ id: nid(), title: title, text: text, t: Number(row.t) || Date.now() });
      });
    } catch (e) {}
    return list;
  }
  function saveLocal() {
    try { localStorage.setItem("survive_rules_v1", JSON.stringify(rows)); } catch (e) {}
  }
  function loadLocal() {
    try { rows = JSON.parse(localStorage.getItem("survive_rules_v1") || "[]") || []; } catch (e) { rows = []; }
    if (!Array.isArray(rows)) rows = [];
    rows = rows.map(localRow).filter(Boolean);
  }
  function status(text) {
    var el = $("sr-status");
    if (el) el.textContent = text || "";
  }
  function paint() {
    var root = $("sr-app");
    var box = $("survive-block");
    if (!root) return;
    if (box && box.classList.contains("sr-closed")) { root.innerHTML = ""; return; }
    var body = rows.map(function (row, i) {
      if (editing === row.id) {
        return '<li class="sr-card"><form class="sr-edit" data-id="' + esc(row.id) + '"><input data-field="title" maxlength="80" value="' + esc(row.title) + '" placeholder="Title" aria-label="Title"><textarea data-field="text" maxlength="1200" rows="6" placeholder="Rule" aria-label="Rule">' + esc(row.text) + '</textarea><div class="sr-actions"><button type="submit">Save</button><button type="button" data-act="wipe" data-id="' + esc(row.id) + '">Clear</button><button type="button" data-act="cancel" aria-label="Cancel">×</button></div></form></li>';
      }
      var lines = String(row.text || "Empty rule").split("\n").map(function (line) {
        return "<p>" + esc(line || " ") + "</p>";
      }).join("");
      return '<li class="sr-card"><div class="sr-k">Rule ' + (i + 1) + '</div><b>' + esc(row.title || "Untitled") + "</b>" + lines + '<div class="sr-actions"><button type="button" data-act="edit" data-id="' + esc(row.id) + '">Edit</button><button type="button" class="sr-clear" data-act="ask" data-id="' + esc(row.id) + '">Clear</button></div></li>';
    }).join("");
    var ask = "";
    if (asking) ask = '<div class="sr-ask">Clear this rule?<button type="button" data-act="yes" data-id="' + esc(asking) + '">Clear</button><button type="button" data-act="no">Keep</button></div>';
    root.innerHTML =
      '<form id="sr-add" class="sr-compose"><input id="sr-title" maxlength="80" placeholder="Title" aria-label="Title"><textarea id="sr-text" maxlength="1200" rows="4" placeholder="New rule" aria-label="New rule"></textarea><div class="sr-actions"><button type="button" class="sr-plus" data-act="add" aria-label="New rule">+</button><button type="button" class="sr-clear" data-act="wipe">Clear</button></div></form>' +
      '<p id="sr-status" class="sr-status"></p>' + ask +
      '<ol class="sr-list">' + body + "</ol>";
  }
  function savedRows() { return rows.map(cleanRow).filter(Boolean); }
  function apply(view) {
    var book = view && view.survive;
    var remoteRows = book && Array.isArray(book.rows) ? book.rows : null;
    if (!remoteRows) return false;
    var remote = remoteRows.map(cleanRow).filter(Boolean);
    if (!remote.length && !savedRows().length && !seeded) {
      rows = seedRows();
      seeded = true;
      saveLocal();
      return "seed";
    }
    if (!remote.length && savedRows().length) return "seed";
    var drafts = rows.filter(function (row) { return row && (!keepTitle(row.title) || !keepBody(row.text)); });
    var seen = {};
    drafts.forEach(function (row) { seen[row.id] = 1; });
    remote.forEach(function (row) {
      if (seen[row.id]) return;
      seen[row.id] = 1;
      drafts.push(row);
    });
    rows = drafts;
    saveLocal();
    return true;
  }
  function post() {
    var mine = ++gen;
    status("Saving");
    return fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ section: "survive", act: "save", rows: savedRows() })
    }).then(function (r) { return r.json(); }).then(function (view) {
      if (mine !== gen) return;
      if (!view || view.ok === false) { status((view && view.error) || "Not saved"); return; }
      apply(view);
      paint();
      status("Saved");
    }).catch(function () { if (mine === gen) status("Saved on this phone"); });
  }
  function pull() {
    fetch(API, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (view) {
      var took = apply(view);
      if (took === "seed") post();
      else if (took) paint();
    }).catch(function () {
      if (!rows.length) { rows = seedRows(); seeded = true; saveLocal(); paint(); }
    });
  }
  function addNew() {
    if (rows.length >= 40) { status("40 rules is the limit"); return; }
    var title = keepTitle(($("sr-title") || {}).value);
    var text = keepBody(($("sr-text") || {}).value);
    if (!title || !text) {
      var row = { id: nid(), title: title, text: text, t: Date.now() };
      rows.push(row);
      editing = row.id;
      asking = "";
      saveLocal();
      paint();
      var open = document.querySelector('#sr-app form[data-id="' + row.id + '"] [data-field="title"]');
      if (open) open.focus();
      status("New rule");
      return;
    }
    rows.push({ id: nid(), title: title, text: text, t: Date.now() });
    saveLocal();
    paint();
    post();
  }
  function saveEdit(id, titleRaw, textRaw) {
    var title = keepTitle(titleRaw);
    var text = keepBody(textRaw);
    if (!title || !text) { status("Title and rule, or Clear the row"); return; }
    rows.forEach(function (row) {
      if (row.id !== id) return;
      row.title = title;
      row.text = text;
      row.t = Date.now();
    });
    editing = "";
    saveLocal();
    paint();
    post();
  }
  function remove(id) {
    rows = rows.filter(function (row) { return row.id !== id; });
    asking = "";
    editing = "";
    saveLocal();
    paint();
    post();
  }
  loadLocal();
  if (!rows.length) { rows = seedRows(); seeded = true; saveLocal(); }
  var root = $("sr-app");
  if (root) {
    root.addEventListener("submit", function (ev) {
      var form = ev.target;
      if (!form || !root.contains(form)) return;
      ev.preventDefault();
      if (form.id === "sr-add") { addNew(); return; }
      var title = form.querySelector('[data-field="title"]');
      var text = form.querySelector('[data-field="text"]');
      saveEdit(form.getAttribute("data-id"), title && title.value, text && text.value);
    });
    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-act]");
      if (!btn || !root.contains(btn) || btn.type === "submit") return;
      var act = btn.getAttribute("data-act");
      var id = btn.getAttribute("data-id") || "";
      if (act === "add") { addNew(); return; }
      if (act === "wipe") {
        var form = btn.closest("form");
        if (form) form.querySelectorAll("input,textarea").forEach(function (el) { el.value = ""; });
        var focus = form && (form.querySelector("[data-field=title]") || form.querySelector("input,textarea"));
        if (focus) focus.focus();
        return;
      }
      if (act === "edit") {
        editing = id;
        asking = "";
        paint();
        var open = document.querySelector('#sr-app form[data-id="' + id + '"] [data-field="title"]');
        if (open) open.focus();
      }
      if (act === "cancel") { editing = ""; paint(); }
      if (act === "ask") {
        var hit = null;
        rows.forEach(function (row) { if (row.id === id) hit = row; });
        if (hit && !keepTitle(hit.title) && !keepBody(hit.text)) { remove(id); return; }
        asking = id;
        editing = "";
        paint();
      }
      if (act === "no") { asking = ""; paint(); }
      if (act === "yes") remove(id);
    });
  }
  var fold = $("sr-fold");
  if (fold) fold.addEventListener("click", function () {
    var box = $("survive-block");
    if (!box) return;
    var closed = box.classList.toggle("sr-closed");
    fold.setAttribute("aria-expanded", closed ? "false" : "true");
    paint();
  });
  if (!document.getElementById("sr-style")) {
    var css = document.createElement("style");
    css.id = "sr-style";
    css.textContent = "#survive-block{margin:0 0 14px}#survive-block .head{cursor:pointer}#survive-block .head h2{color:#f4fff8;font:800 26px/1.1 Inter,system-ui,sans-serif;letter-spacing:-.03em}#sr-app{font-family:Inter,system-ui,sans-serif;color:#e7eef8}#sr-app input,#sr-app textarea{display:block;width:100%;box-sizing:border-box;border:1px solid #2f6b4a;border-radius:14px;background:#0c121a;color:#f7f4ec;padding:12px 14px;font:600 16px/1.45 Inter,system-ui,sans-serif;color-scheme:dark}#sr-app textarea{min-height:96px;resize:vertical;margin-top:8px}#sr-app input:focus,#sr-app textarea:focus{outline:none;border-color:#7dffb3;box-shadow:0 0 0 3px rgba(125,255,179,.14)}.sr-compose{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}.sr-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}.sr-actions button,.sr-plus{border:0;border-radius:12px;height:40px;padding:0 14px;cursor:pointer;font:800 14px/1 Inter,system-ui,sans-serif;background:#243044;color:#f4f7fb}.sr-plus,.sr-actions button[type=submit]{background:#7dffb3;color:#06210f}.sr-clear{background:#2c1c24!important;color:#ffb0ba!important}.sr-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}.sr-card{background:#101820;border:1px solid #24543a;border-radius:16px;padding:14px}.sr-k{color:#7dffb3;font:800 12px/1 Inter,system-ui,sans-serif;letter-spacing:.04em}.sr-card b{display:block;margin:4px 0 8px;font-size:17px;color:#fff}.sr-card p{margin:6px 0 0;white-space:pre-wrap;word-break:break-word;color:#f4f7fb;font:600 16px/1.45 Inter,system-ui,sans-serif}.sr-status{min-height:18px;margin:0 0 8px;color:#9dccb2;font:700 13px/1.3 Inter,system-ui,sans-serif}.sr-ask{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px;color:#ffb4be;font:800 14px Inter,system-ui,sans-serif}.sr-ask button{border:0;border-radius:999px;padding:8px 12px;font:800 13px Inter,system-ui,sans-serif;cursor:pointer}.sr-ask button[data-act=yes]{background:#ff6f7c;color:#1a0c10}.sr-ask button[data-act=no]{background:#243044;color:#f4f7fb}#survive-block.sr-closed #sr-app{display:none}body:has(.trend-panel.on) #survive-block,body:has(.struct-trend-panel.on) #survive-block{display:none!important}";
    document.head.appendChild(css);
  }
  pull();
})();
