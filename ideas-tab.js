/* Ideas. Plus always adds a row. Clear wipes the entry. Edit or clear any saved row. */
(function () {
  var API = "https://trading-ohlcv.sasipudi.workers.dev/life-log";
  var rows = [];
  var editing = "";
  var asking = "";
  var gen = 0;

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
  function keep(raw) {
    return String(raw || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
      .slice(0, 800);
  }
  function cleanRow(row) {
    if (!row) return null;
    var id = String(row.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 24);
    var text = keep(row.text);
    if (!id || !text) return null;
    return { id: id, text: text, t: Number(row.t) || 0 };
  }
  function localRow(row) {
    if (!row) return null;
    var id = String(row.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 24);
    if (!id) return null;
    return { id: id, text: keep(row.text), t: Number(row.t) || 0 };
  }
  function saveLocal() {
    try { localStorage.setItem("ideas_rows_v1", JSON.stringify(rows)); } catch (e) {}
  }
  function loadLocal() {
    try { rows = JSON.parse(localStorage.getItem("ideas_rows_v1") || "[]") || []; } catch (e) { rows = []; }
    if (!Array.isArray(rows)) rows = [];
    rows = rows.map(localRow).filter(Boolean);
    rows.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
  }
  function status(text) {
    var el = $("id-status");
    if (el) el.textContent = text || "";
  }
  function paint() {
    var root = $("id-app");
    if (!root) return;
    var draft = "";
    var old = $("id-text");
    if (old) draft = old.value;
    var body = rows.map(function (row) {
      if (editing === row.id) {
        return '<li class="id-card"><form class="id-edit" data-id="' + esc(row.id) + '"><textarea data-field="text" maxlength="800" rows="5" placeholder="Write the idea" aria-label="Idea">' + esc(row.text) + '</textarea><div class="id-actions"><button type="submit" class="id-save">Save</button><button type="button" class="id-clear" data-act="wipe" data-id="' + esc(row.id) + '">Clear</button><button type="button" class="id-x" data-act="cancel" aria-label="Cancel">×</button></div></form></li>';
      }
      var label = row.text || "Empty row";
      return '<li class="id-card"><p class="id-copy">' + esc(label) + '</p><div class="id-actions"><button type="button" class="id-editbtn" data-act="edit" data-id="' + esc(row.id) + '">Edit</button><button type="button" class="id-clear" data-act="ask" data-id="' + esc(row.id) + '">Clear</button></div></li>';
    }).join("");
    var ask = "";
    if (asking) {
      var hit = null;
      rows.forEach(function (row) { if (row.id === asking) hit = row; });
      if (hit) ask = '<div class="tp-ask">Clear this idea?<button type="button" data-act="yes" data-id="' + esc(hit.id) + '">Clear</button><button type="button" data-act="no">Keep</button></div>';
    }
    root.innerHTML =
      '<form id="id-add" class="id-compose"><textarea id="id-text" maxlength="800" rows="4" placeholder="New idea" aria-label="New idea">' + esc(draft) + '</textarea><div class="id-actions"><button type="button" class="id-plus" data-act="add" aria-label="New row">+</button><button type="button" class="id-clear" data-act="wipe">Clear</button></div></form>' +
      '<p class="id-hint">+ always adds a row. Edit opens a multi-line box. Clear wipes the entry.</p>' +
      '<p id="id-status" class="id-status"></p>' + ask +
      '<ul class="id-list">' + body + "</ul>";
  }
  function savedRows() { return rows.map(cleanRow).filter(Boolean); }
  function apply(view) {
    var book = view && view.ideas;
    var remoteRows = book && Array.isArray(book.rows) ? book.rows : null;
    if (!remoteRows) return false;
    var remote = remoteRows.map(cleanRow).filter(Boolean);
    if (!remote.length && savedRows().length) return "seed";
    var drafts = rows.filter(function (row) { return row && !keep(row.text); });
    var seen = {};
    drafts.forEach(function (row) { seen[row.id] = 1; });
    remote.forEach(function (row) {
      if (seen[row.id]) return;
      seen[row.id] = 1;
      drafts.push(row);
    });
    rows = drafts.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
    saveLocal();
    return true;
  }
  function post() {
    var mine = ++gen;
    status("Saving");
    return fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ section: "ideas", act: "save", rows: savedRows() })
    }).then(function (r) { return r.json(); }).then(function (view) {
      if (mine !== gen) return;
      if (!view || view.ok === false) { status((view && view.error) || "Not saved"); return; }
      apply(view);
      if ($("id-panel") && $("id-panel").classList.contains("on")) paint();
      status("Saved");
    }).catch(function () {
      if (mine === gen) status("Saved on this phone");
    });
  }
  function pull() {
    fetch(API, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (view) {
      var took = apply(view);
      if (took === "seed") post();
      else if (took && $("id-panel") && $("id-panel").classList.contains("on")) paint();
    }).catch(function () {});
  }
  function addNew() {
    if (rows.length >= 200) { status("200 ideas is the limit"); return; }
    var box = $("id-text");
    var typed = keep(box && box.value);
    if (box) box.value = "";
    var row = { id: nid(), text: typed, t: Date.now() };
    rows.unshift(row);
    editing = typed ? "" : row.id;
    asking = "";
    saveLocal();
    paint();
    if (typed) {
      var top = $("id-text");
      if (top) top.focus();
      post();
      return;
    }
    var field = document.querySelector('#id-app form[data-id="' + row.id + '"] [data-field="text"]');
    if (field) field.focus();
    status("New row");
  }
  function saveEdit(id, textRaw) {
    var text = keep(textRaw);
    if (!text) { status("Type the idea, or Clear the row"); return; }
    rows.forEach(function (row) {
      if (row.id !== id) return;
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
  function show(on) {
    var p = $("id-panel");
    if (!p) return;
    if (!on) {
      document.body.classList.remove("id-on");
      p.style.display = "none";
      p.classList.remove("on");
      return;
    }
    document.body.classList.remove("life-on", "md-on", "cal-on", "tp-on", "ml-on", "id-on");
    document.body.classList.add("id-on");
    var panels = $("tf-panels");
    if (panels) { panels.classList.add("hidden"); panels.style.display = "none"; }
    document.querySelectorAll(".trend-panel, .struct-trend-panel").forEach(function (el) {
      if (el.id === "id-panel") return;
      el.style.display = "none";
      el.classList.remove("on");
    });
    p.style.display = "block";
    p.classList.add("on");
    paint();
    pull();
  }
  window.showIdeas = show;
  loadLocal();
  var root = $("id-app");
  if (root) {
    root.addEventListener("submit", function (ev) {
      var form = ev.target;
      if (!form || !root.contains(form)) return;
      ev.preventDefault();
      if (form.id === "id-add") { addNew(); return; }
      var text = form.querySelector('[data-field="text"]');
      saveEdit(form.getAttribute("data-id"), text && text.value);
    });
    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-act]");
      if (!btn || !root.contains(btn)) return;
      if (btn.type === "submit") return;
      var act = btn.getAttribute("data-act");
      var id = btn.getAttribute("data-id") || "";
      if (act === "add") { addNew(); return; }
      if (act === "wipe") {
        if (id) {
          var field = btn.closest("form") && btn.closest("form").querySelector('[data-field="text"]');
          if (field) { field.value = ""; field.focus(); }
          return;
        }
        var top = $("id-text");
        if (top) { top.value = ""; top.focus(); }
        paint();
        var again = $("id-text");
        if (again) again.focus();
        return;
      }
      if (act === "edit") {
        editing = id;
        asking = "";
        paint();
        var open = document.querySelector('#id-app form[data-id="' + id + '"] textarea');
        if (open) open.focus();
      }
      if (act === "cancel") { editing = ""; paint(); }
      if (act === "ask") {
        var hit = null;
        rows.forEach(function (row) { if (row.id === id) hit = row; });
        if (hit && !hit.text) { remove(id); return; }
        asking = id;
        editing = "";
        paint();
      }
      if (act === "no") { asking = ""; paint(); }
      if (act === "yes") remove(id);
    });
  }
  var tabs = $("tf-tabs");
  if (tabs) tabs.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
    if (!b || b.getAttribute("data-tf") === "ideas") return;
    show(false);
  }, true);
  if (!document.getElementById("id-style")) {
    var css = document.createElement("style");
    css.id = "id-style";
    css.textContent = "#id-app{font-family:Inter,system-ui,sans-serif;color:#e7eef8}#id-app textarea{display:block;width:100%;min-height:96px;box-sizing:border-box;resize:vertical;border:1px solid #314158;border-radius:14px;background:#0c121a;color:#f7f4ec;padding:12px 14px;font:500 16px/1.5 Inter,system-ui,sans-serif;color-scheme:dark}#id-app textarea::placeholder{color:#8b97a8}#id-app textarea:focus{outline:none;border-color:#e6c878;box-shadow:0 0 0 3px rgba(230,200,120,.16)}.id-compose,.id-edit{display:flex;flex-direction:column;gap:10px}.id-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center}.id-plus,.id-save,.id-clear,.id-editbtn,.id-x{border:0;border-radius:12px;height:40px;padding:0 14px;cursor:pointer;font:800 14px/1 Inter,system-ui,sans-serif}.id-plus{min-width:48px;background:#e6c878;color:#1c1508;font-size:22px}.id-save{background:#e6c878;color:#1c1508}.id-editbtn{background:#243044;color:#f4f7fb}.id-clear{background:#2c1c24;color:#ffb0ba}.id-x{width:40px;padding:0;background:#1c2633;color:#d5deea;font-size:18px}.id-hint,.id-status{margin:10px 2px 0;color:#93a0b2;font:600 13px/1.4 Inter,system-ui,sans-serif}.id-status{min-height:18px;color:#c9b27a}.id-list{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}.id-card{background:#141c27;border:1px solid #2a384a;border-radius:16px;padding:14px}.id-copy{margin:0 0 12px;white-space:pre-wrap;word-break:break-word;color:#f4f7fb;font:500 16px/1.5 Inter,system-ui,sans-serif}.id-ask{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px;color:#ffb4be;font:800 14px/1.3 Inter,system-ui,sans-serif}.id-ask button{border:0;border-radius:999px;padding:8px 12px;font:800 13px Inter,system-ui,sans-serif;cursor:pointer}.id-ask button[data-act=yes]{background:#ff6f7c;color:#1a0c10}.id-ask button[data-act=no]{background:#243044;color:#f4f7fb}body.id-on #id-panel h2{color:#f6f3ea;font:800 28px/1.1 Inter,system-ui,sans-serif;letter-spacing:-.03em}body.id-on main>section.section,body.id-on main>.trend-panel:not(#id-panel),body.id-on main>.struct-trend-panel,body.id-on #tf-panels{display:none!important}body.id-on #id-panel{display:block!important}";
    document.head.appendChild(css);
  }
  pull();
})();
