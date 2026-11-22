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
  function keep(raw) { return String(raw || "").replace(/\s+/g, " ").trim().slice(0, 240); }
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
        return '<li class="tp-row"><form class="tp-form" data-id="' + esc(row.id) + '"><input data-field="text" value="' + esc(row.text) + '" maxlength="240" placeholder="Idea" aria-label="Idea"><button type="submit">Save</button><button type="button" data-act="wipe" data-id="' + esc(row.id) + '">Clear</button><button type="button" data-act="cancel" aria-label="Cancel">×</button></form></li>';
      }
      var label = row.text || "Empty row";
      return '<li class="tp-row"><span class="tp-name">' + esc(label) + '</span><span class="tp-acts"><button type="button" class="tp-pen" data-act="edit" data-id="' + esc(row.id) + '">Edit</button><button type="button" class="tp-clear" data-act="ask" data-id="' + esc(row.id) + '">Clear</button></span></li>';
    }).join("");
    var ask = "";
    if (asking) {
      var hit = null;
      rows.forEach(function (row) { if (row.id === asking) hit = row; });
      if (hit) ask = '<div class="tp-ask">Clear this idea?<button type="button" data-act="yes" data-id="' + esc(hit.id) + '">Clear</button><button type="button" data-act="no">Keep</button></div>';
    }
    root.innerHTML =
      '<form id="id-add" class="tp-form"><input id="id-text" maxlength="240" placeholder="New idea" value="' + esc(draft) + '" aria-label="New idea"><button type="button" class="id-plus" data-act="add" aria-label="New row">+</button><button type="button" data-act="wipe">Clear</button></form>' +
      '<p class="tp-hint">+ always adds a row. Clear wipes the entry.</p>' +
      '<p id="id-status" class="tp-status"></p>' + ask +
      '<ul class="tp-list">' + body + "</ul>";
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
      if (act === "edit") { editing = id; asking = ""; paint(); }
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
    css.textContent = ".id-plus{min-width:42px;font-size:22px;line-height:1}body.id-on main>section.section,body.id-on main>.trend-panel:not(#id-panel),body.id-on main>.struct-trend-panel,body.id-on #tf-panels{display:none!important}body.id-on #id-panel{display:block!important}";
    document.head.appendChild(css);
  }
  pull();
})();
