/* Screenshots. Plus adds a tab. Upload shows the picture. Delete removes a picture or a tab. */
(function () {
  if (!document.getElementById("sh-css")) {
    var css = document.createElement("style");
    css.id = "sh-css";
    css.textContent = "#sh-app{color:#f4f7fb}#sh-app .sh-bar{display:flex;gap:8px;overflow-x:auto;padding-bottom:8px}#sh-app .sh-new{display:flex;gap:8px;margin-bottom:10px}#sh-app .sh-name,#sh-app .sh-rename{flex:1;min-width:0;padding:12px 14px;border:0;border-radius:14px;background:#141c27;color:#f4f7fb;font-size:16px;font-weight:700}#sh-app .sh-plus,#sh-app .sh-tab,#sh-app .sh-up,#sh-app .sh-del{border:0;border-radius:999px;font-weight:800;cursor:pointer}#sh-app .sh-plus{flex:none;width:46px;background:#e6c878;color:#1a1406;font-size:22px}#sh-app .sh-tab{flex:none;padding:10px 14px;background:#17202b;color:#c5d0dc}#sh-app .sh-tab.sh-on{background:#e6c878;color:#1a1406}#sh-app .sh-tools{display:flex;gap:8px;margin:8px 0}#sh-app .sh-up{padding:10px 14px;background:#243044;color:#f4f7fb}#sh-app .sh-del,#sh-app .sh-pic button{padding:10px 14px;background:#2a1a22;color:#ff8a7a}#sh-app .sh-status,#sh-app .sh-empty{color:#8b93a7;font-size:13px;font-weight:700}#sh-app .sh-pic{margin:12px 0;padding:8px;border-radius:16px;background:#10161f}#sh-app .sh-pic img{display:block;width:100%;height:auto;border-radius:12px}#sh-app .sh-pic button{margin-top:8px}";
    document.head.appendChild(css);
  }
  var albums = [];
  var active = "";
  var dbp = null;

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
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      var req = indexedDB.open("shots-v1", 1);
      req.onupgradeneeded = function () {
        var base = req.result;
        if (!base.objectStoreNames.contains("book")) base.createObjectStore("book");
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }
  function readAll() {
    return db().then(function (base) {
      return new Promise(function (resolve, reject) {
        var tx = base.transaction("book", "readonly");
        var req = tx.objectStore("book").get("albums");
        req.onsuccess = function () { resolve(req.result || { albums: [], active: "" }); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function writeAll() {
    var payload = {
      albums: albums.map(function (a) {
        return { id: a.id, name: a.name, shots: a.shots || [] };
      }),
      active: active
    };
    return db().then(function (base) {
      return new Promise(function (resolve, reject) {
        var tx = base.transaction("book", "readwrite");
        tx.objectStore("book").put(payload, "albums");
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () {});
  }
  function current() {
    var hit = null;
    albums.forEach(function (a) { if (a.id === active) hit = a; });
    return hit || albums[0] || null;
  }
  function status(text) {
    var el = $("sh-status");
    if (el) el.textContent = text || "";
  }
  function paint() {
    var root = $("sh-app");
    if (!root) return;
    var album = current();
    if (album) active = album.id;
    var tabs = albums.map(function (a) {
      var on = a.id === active ? " sh-on" : "";
      return '<button type="button" class="sh-tab' + on + '" data-act="open" data-id="' + esc(a.id) + '">' + esc(a.name) + '</button>';
    }).join("");
    var pics = "";
    if (album && album.shots && album.shots.length) {
      pics = album.shots.map(function (shot) {
        return '<figure class="sh-pic"><img src="' + shot.src + '" alt="' + esc(album.name) + '"><button type="button" data-act="drop" data-id="' + esc(shot.id) + '">Delete</button></figure>';
      }).join("");
    } else if (album) {
      pics = '<p class="sh-empty">Upload a screenshot. It stays on this tab so you can read it.</p>';
    } else {
      pics = '<p class="sh-empty">Tap + to make a tab.</p>';
    }
    var tools = album
      ? '<input id="sh-rename" class="sh-rename" maxlength="24" value="' + esc(album.name) + '" aria-label="Tab name" style="width:100%;box-sizing:border-box;margin:8px 0">' +
        '<div class="sh-tools"><button type="button" class="sh-up" data-act="pick">Upload</button></div>'
      : "";
    var typed = "";
    var oldName = $("sh-name");
    if (oldName) typed = oldName.value;
    root.innerHTML =
      '<form class="sh-new" id="sh-add"><input id="sh-name" class="sh-name" maxlength="24" placeholder="Name this tab" aria-label="New tab name" value="' + esc(typed) + '"><button type="submit" class="sh-plus" aria-label="New tab">+</button></form>' +
      '<div class="sh-bar">' + tabs + '</div>' +
      tools +
      '<p id="sh-status" class="sh-status"></p>' +
      '<div class="sh-pics">' + pics + '</div>' +
      '<input id="sh-file" type="file" accept="image/*" multiple hidden>';
  }
  function tabName(raw) {
    return String(raw || "").replace(/\s+/g, " ").trim().slice(0, 24);
  }
  function addTab() {
    if (albums.length >= 24) { status("24 tabs is the limit"); return; }
    var input = $("sh-name");
    var name = tabName(input && input.value);
    if (!name) { status("Type a name first"); if (input) input.focus(); return; }
    var album = { id: nid(), name: name, shots: [] };
    albums.push(album);
    active = album.id;
    if (input) input.value = "";
    paint();
    writeAll();
    status("Tab added");
  }
  function rename(raw) {
    var album = current();
    var name = tabName(raw);
    if (!album || !name || name === album.name) return;
    album.name = name;
    paint();
    writeAll();
  }
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var max = 1080;
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (w > max) { h = Math.round(h * max / w); w = max; }
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that image"));
      };
      img.src = url;
    });
  }
  function addFiles(list) {
    var album = current();
    if (!album) { addTab(); album = current(); }
    var files = Array.prototype.slice.call(list || []).filter(function (f) { return f && /^image\//.test(f.type); });
    if (!files.length) { status("Choose a screenshot"); return; }
    status("Adding");
    var chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () { return shrink(file); }).then(function (src) {
        if (!album.shots) album.shots = [];
        if (album.shots.length >= 40) return;
        album.shots.push({ id: nid(), src: src, t: Date.now() });
      });
    });
    chain.then(function () {
      paint();
      return writeAll();
    }).then(function () { status("Saved"); }).catch(function (e) {
      status((e && e.message) || "Could not add that screenshot");
    });
  }
  function dropShot(id) {
    var album = current();
    if (!album) return;
    album.shots = (album.shots || []).filter(function (s) { return s.id !== id; });
    paint();
    writeAll();
  }
  function dropTab(id) {
    albums = albums.filter(function (a) { return a.id !== id; });
    if (active === id) active = albums.length ? albums[0].id : "";
    paint();
    writeAll();
  }
  function show(on) {
    var p = $("sh-panel");
    if (!p) return;
    if (!on) {
      p.style.display = "none";
      p.classList.remove("on");
      return;
    }
    var panels = $("tf-panels");
    if (panels) { panels.classList.add("hidden"); panels.style.display = "none"; }
    document.querySelectorAll(".trend-panel").forEach(function (el) {
      if (el.id === "sh-panel") return;
      el.style.display = "none";
      el.classList.remove("on");
    });
    p.style.display = "block";
    p.classList.add("on");
    paint();
  }
  function boot() {
    readAll().then(function (saved) {
      albums = Array.isArray(saved.albums) ? saved.albums : [];
      active = saved.active || (albums[0] && albums[0].id) || "";
      if ($("sh-panel") && $("sh-panel").classList.contains("on")) paint();
    }).catch(function () {});
  }
  window.showShots = show;
  boot();
  var root = $("sh-app");
  if (root) {
    root.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-act]");
      if (!btn || !root.contains(btn)) return;
      var act = btn.getAttribute("data-act");
      var id = btn.getAttribute("data-id") || "";
      if (act === "add") addTab();
      else if (act === "open") { active = id; paint(); writeAll(); }
      else if (act === "pick") {
        var input = $("sh-file");
        if (input) input.click();
      } else if (act === "drop") dropShot(id);
    });
    root.addEventListener("submit", function (ev) {
      if (!ev.target || ev.target.id !== "sh-add") return;
      ev.preventDefault();
      addTab();
    });
    root.addEventListener("change", function (ev) {
      if (ev.target && ev.target.id === "sh-rename") rename(ev.target.value);
      if (ev.target && ev.target.id === "sh-file") {
        addFiles(ev.target.files);
        ev.target.value = "";
      }
    });
  }
})();
