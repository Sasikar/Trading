(function () {
  if (window.__memePoints) return;
  window.__memePoints = 1;
  var API = "https://trading-ohlcv.sasipudi.workers.dev";
  var view = null;
  var open = false;
  var timer = 0;
  var posting = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      return "&" + "quot;";
    });
  }
  function px(n) {
    n = Number(n);
    if (!(n > 0)) return "—";
    return "$" + n.toFixed(5);
  }
  function hideOthers() {
    document.querySelectorAll(".trend-panel").forEach(function (p) {
      if (p.id === "memes-panel") return;
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
  function paint() {
    var root = $("memes-board");
    if (!root) return;
    var v = view || { name: "CATE", price: 0, points: 2, on: true, up: 0, down: 0 };
    var on = v.on !== false;
    var moved = v.lastAlertAt ? '<div style="margin-top:8px;color:#8b93a7;font-size:12px">Last alert ' + esc(v.lastDir === "down" ? "down" : "up") + " " + (v.lastMove > 0 ? "+" : "") + v.lastMove + " pts</div>" : "";
    root.innerHTML =
      '<div style="font-size:13px;font-weight:900;letter-spacing:.14em;color:#e6c878">CATE</div>' +
      '<div style="font-size:40px;font-weight:900;letter-spacing:-.04em">' + px(v.price) + "</div>" +
      '<div style="margin-top:4px;color:#8b93a7;font-size:13px">' + (v.error ? esc(v.error) : "1 point is 0.001. At 0.058, 2 points is 0.060 or 0.056.") + "</div>" +
      '<div style="margin-top:16px;display:flex;justify-content:space-between;align-items:baseline"><b id="meme-step-label">Every ' + (v.points || 2) + ' points</b><span style="color:#8b93a7;font-size:12px">up and down</span></div>' +
      '<input id="meme-step" type="range" min="1" max="10" step="1" value="' + (v.points || 2) + '" style="width:100%;margin-top:8px;accent-color:#e6c878">' +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<div style="flex:1;padding:12px;border-radius:14px;background:#102018"><div style="color:#8b93a7;font-size:11px;font-weight:800">UP</div><b style="color:#3dbe7a">' + px(v.up) + "</b></div>" +
      '<div style="flex:1;padding:12px;border-radius:14px;background:#2a1518"><div style="color:#8b93a7;font-size:11px;font-weight:800">DOWN</div><b style="color:#ff8a7a">' + px(v.down) + "</b></div></div>" +
      moved +
      '<div style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:14px;background:#12161d">' +
      '<div><div style="font-weight:900">Alerts</div><div style="margin-top:2px;color:#8b93a7;font-size:12px">' + (on ? "On" : "Off") + "</div></div>" +
      '<button type="button" id="meme-toggle" class="al-sw" role="switch" aria-checked="' + (on ? "true" : "false") + '" aria-label="Alerts"><span class="al-knob"></span></button></div>';
    var bar = $("meme-step");
    var label = $("meme-step-label");
    if (bar) {
      bar.addEventListener("input", function () {
        if (label) label.textContent = "Every " + bar.value + " points";
      });
      bar.addEventListener("change", function () { save({ points: Number(bar.value) }); });
    }
    var btn = $("meme-toggle");
    if (btn) btn.addEventListener("click", function () { save({ on: !(view && view.on !== false) }); });
  }
  function save(patch) {
    if (posting) return;
    posting = true;
    fetch(API + "/memes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    }).then(function (r) { return r.json(); }).then(function (body) {
      view = body || view;
      paint();
    }).catch(function () {}).then(function () { posting = false; });
  }
  function pull() {
    fetch(API + "/memes", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (body) {
      if (!body) return;
      var same = view && view.price === body.price && view.points === body.points && view.on === body.on && view.up === body.up && view.lastAlertAt === body.lastAlertAt;
      view = body;
      if (!same) paint();
    }).catch(function () {});
  }
  function show(on) {
    var p = $("memes-panel");
    if (!p) return;
    open = !!on;
    if (!on) {
      p.style.display = "none";
      p.classList.remove("on");
      if (timer) { clearInterval(timer); timer = 0; }
      return;
    }
    hideOthers();
    p.style.display = "block";
    p.classList.add("on");
    paint();
    pull();
    if (timer) clearInterval(timer);
    timer = setInterval(function () { if (open) pull(); }, 15000);
  }
  window.showMemes = show;
  var tabs = $("tf-tabs");
  if (tabs) tabs.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
    if (!b || b.getAttribute("data-tf") === "memes") return;
    show(false);
  }, true);
})();
