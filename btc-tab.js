(function () {
  if (window.__btcTab) return;
  window.__btcTab = 1;
  var KEY = "trading_btc_alert_v1";
  var state = { on: true, step: 2000, extra: "", anchor: 0, lastDir: "", lastMove: 0, lastAlertAt: 0, price: 0, error: "", checked: 0 };
  var open = false;
  var timer = 0;
  var pulling = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      return "&" + "quot;";
    });
  }
  function usd(n) {
    n = Number(n);
    if (!(n > 0)) return "—";
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function pts(n) {
    n = Math.round(Number(n) || 0);
    return (n > 0 ? "+" : "") + n.toLocaleString("en-US");
  }
  function read() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (s && typeof s === "object") {
        if (typeof s.on === "boolean") state.on = s.on;
        if (s.step) state.step = s.step;
        if (s.extra != null) state.extra = s.extra;
        if (s.anchor) state.anchor = s.anchor;
        if (s.lastDir) state.lastDir = s.lastDir;
        if (s.lastMove) state.lastMove = s.lastMove;
        if (s.lastAlertAt) state.lastAlertAt = s.lastAlertAt;
      }
    } catch (e) {}
  }
  function write() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        on: state.on, step: state.step, extra: state.extra, anchor: state.anchor,
        lastDir: state.lastDir, lastMove: state.lastMove, lastAlertAt: state.lastAlertAt
      }));
    } catch (e) {}
  }
  function hideOthers() {
    document.querySelectorAll(".trend-panel").forEach(function (p) {
      if (p.id === "btc-panel") return;
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
  function usedStep() {
    var extra = Math.round(Number(state.extra));
    if (isFinite(extra) && extra >= 1) return extra;
    return 2000;
  }
  function levels() {
    var step = usedStep();
    var base = state.anchor > 0 ? state.anchor : state.price;
    return { up: base + step, down: Math.max(0, base - step), step: step };
  }
  function paint() {
    var root = $("btc-board");
    if (!root) return;
    var on = state.on !== false;
    var lv = levels();
    var moved = state.lastAlertAt ? '<div style="margin-top:8px;color:#8b93a7;font-size:12px">Last alert ' + esc(state.lastDir === "down" ? "down" : "up") + " " + pts(state.lastMove) + " pts</div>" : "";
    root.innerHTML =
      '<div style="font-size:40px;font-weight:900;letter-spacing:-.04em">' + usd(state.price) + "</div>" +
      '<div style="margin-top:4px;color:#8b93a7;font-size:13px">' + (state.error ? esc(state.error) : "Watched on the server every 2 minutes, even if this phone is asleep or on silent. Each step goes to Telegram.") + "</div>" +
      '<label style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:8px"><b>Every 2000 points</b>' +
      '<span style="display:flex;align-items:center;gap:6px"><input id="btc-fixed" type="text" readonly value="2000" aria-label="Fixed points" style="width:72px;color-scheme:dark;background:#0e131a;color:#8b93a7;border:1px solid #3d4a5c;border-radius:10px;padding:8px 8px;font-weight:800;font-size:16px;text-align:center">' +
      '<input id="btc-extra" type="number" min="1" step="1" inputmode="numeric" placeholder="Add" value="' + esc(state.extra || "") + '" aria-label="Your points" style="width:84px;color-scheme:dark;background:#0e131a;color:#f4f7fb;border:1px solid #3d4a5c;border-radius:10px;padding:8px 8px;font-weight:800;font-size:16px"></span></label>' +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<div style="flex:1;padding:12px;border-radius:14px;background:#102018"><div style="color:#8b93a7;font-size:11px;font-weight:800">UP</div><b style="color:#3dbe7a">' + usd(lv.up) + "</b></div>" +
      '<div style="flex:1;padding:12px;border-radius:14px;background:#2a1518"><div style="color:#8b93a7;font-size:11px;font-weight:800">DOWN</div><b style="color:#ff8a7a">' + usd(lv.down) + "</b></div></div>" +
      moved +
      '<div style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:14px;background:#12161d">' +
      '<div><div style="font-weight:900">Alerts</div><div style="margin-top:2px;color:#8b93a7;font-size:12px">' + (on ? "On · phone can sleep" : "Off") + "</div></div>" +
      '<button type="button" id="btc-toggle" class="al-sw" role="switch" aria-checked="' + (on ? "true" : "false") + '" aria-label="Alerts"><span class="al-knob"></span></button></div>';
    var extra = $("btc-extra");
    if (extra) {
      extra.addEventListener("change", function () {
        var raw = String(extra.value || "").trim();
        var n = Math.round(Number(raw));
        if (!raw || !isFinite(n) || n < 1) {
          state.extra = "";
          extra.value = "";
        } else {
          state.extra = String(n);
          extra.value = String(n);
        }
        state.step = usedStep();
        write();
        paint();
        pushSettings();
      });
    }
    var btn = $("btc-toggle");
    if (btn) btn.addEventListener("click", function () {
      state.on = !(state.on !== false);
      write();
      arm();
      pushSettings();
    });
  }
  var API = "https://trading-ohlcv.sasipudi.workers.dev/btc";
  function apply(view) {
    if (!view || view.paused) {
      state.error = "Server watcher is not on yet";
      return;
    }
    if (view.price) state.price = view.price;
    if (view.anchor) state.anchor = view.anchor;
    if (view.step) {
      state.step = view.step;
      state.extra = Number(view.step) === 2000 ? "" : String(view.step);
    }
    if (typeof view.on === "boolean") state.on = view.on;
    state.lastDir = view.lastDir || "";
    state.lastMove = view.lastMove || 0;
    state.lastAlertAt = view.lastAlertAt || 0;
    state.error = view.ok === false ? (view.error || "BTC check failed") : (view.error || "");
    write();
  }
  function pushSettings() {
    fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step: usedStep(), on: state.on !== false })
    }).then(function (r) { return r.json(); }).then(function (view) {
      apply(view);
      if (open) paint();
    }).catch(function () {
      state.error = "Server did not take the BTC setting";
      if (open) paint();
    });
  }
  function pull() {
    if (pulling) return;
    pulling = true;
    fetch(API, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (view) {
        apply(view);
        if (open) paint();
      })
      .catch(function () { state.error = "Server did not answer"; if (open) paint(); })
      .then(function () { pulling = false; });
  }
  function arm() {
    if (timer) clearInterval(timer);
    timer = 0;
    if (state.on === false) return;
    timer = setInterval(pull, 30000);
  }
  function show(on) {
    var p = $("btc-panel");
    if (!p) return;
    open = !!on;
    if (!on) {
      p.style.display = "none";
      p.classList.remove("on");
      return;
    }
    hideOthers();
    p.style.display = "block";
    p.classList.add("on");
    paint();
    pull();
  }
  window.showBtc = show;
  read();
  arm();
  pushSettings();
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") pull();
  });
  var tabs = $("tf-tabs");
  if (tabs) tabs.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
    if (!b || b.getAttribute("data-tf") === "btc") return;
    show(false);
  }, true);
})();
