(function () {
  if (window.__btcTab) return;
  window.__btcTab = 1;
  var KEY = "trading_btc_alert_v1";
  var state = { on: true, step: 200, anchor: 0, lastDir: "", lastMove: 0, lastAlertAt: 0, price: 0, error: "", checked: 0 };
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
        on: state.on, step: state.step, anchor: state.anchor,
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
  function levels() {
    var step = state.step || 200;
    var base = state.anchor > 0 ? state.anchor : state.price;
    return { up: base + step, down: Math.max(0, base - step) };
  }
  function paint() {
    var root = $("btc-board");
    if (!root) return;
    var on = state.on !== false;
    var lv = levels();
    var moved = state.lastAlertAt ? '<div style="margin-top:8px;color:#8b93a7;font-size:12px">Last alert ' + esc(state.lastDir === "down" ? "down" : "up") + " " + pts(state.lastMove) + " pts</div>" : "";
    root.innerHTML =
      '<div style="font-size:40px;font-weight:900;letter-spacing:-.04em">' + usd(state.price) + "</div>" +
      '<div style="margin-top:4px;color:#8b93a7;font-size:13px">' + (state.error ? esc(state.error) : "Coinbase price in this browser. A cross goes to your Telegram bot. Cloudflare storage is not used.") + "</div>" +
      '<div style="margin-top:16px;display:flex;justify-content:space-between;align-items:baseline"><b id="btc-step-label">Every ' + (state.step || 200) + ' points</b><span style="color:#8b93a7;font-size:12px">steps of 100</span></div>' +
      '<input id="btc-step" type="range" min="100" max="3000" step="100" value="' + (state.step || 200) + '" style="width:100%;margin-top:8px;accent-color:#e6c878">' +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<div style="flex:1;padding:12px;border-radius:14px;background:#102018"><div style="color:#8b93a7;font-size:11px;font-weight:800">UP</div><b style="color:#3dbe7a">' + usd(lv.up) + "</b></div>" +
      '<div style="flex:1;padding:12px;border-radius:14px;background:#2a1518"><div style="color:#8b93a7;font-size:11px;font-weight:800">DOWN</div><b style="color:#ff8a7a">' + usd(lv.down) + "</b></div></div>" +
      moved +
      '<div style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:14px;background:#12161d">' +
      '<div><div style="font-weight:900">Alerts</div><div style="margin-top:2px;color:#8b93a7;font-size:12px">' + (on ? "On · every 30s" : "Off") + "</div></div>" +
      '<button type="button" id="btc-toggle" class="al-sw" role="switch" aria-checked="' + (on ? "true" : "false") + '" aria-label="Alerts"><span class="al-knob"></span></button></div>';
    var bar = $("btc-step");
    var label = $("btc-step-label");
    if (bar) {
      bar.addEventListener("input", function () {
        if (label) label.textContent = "Every " + bar.value + " points";
      });
      bar.addEventListener("change", function () {
        state.step = Number(bar.value) || 200;
        write();
        paint();
      });
    }
    var btn = $("btc-toggle");
    if (btn) btn.addEventListener("click", function () {
      state.on = !(state.on !== false);
      if (state.on) ask();
      write();
      arm();
      paint();
    });
  }
  function ask() {
    try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
  }
  function ping(dir, move, price) {
    var title = "BTC " + (dir === "down" ? "down" : "up") + " " + pts(move);
    var body = usd(price);
    try {
      if (window.Notification && Notification.permission === "granted") new Notification(title, { body: body });
    } catch (e) {}
    fetch("https://trading-ohlcv.sasipudi.workers.dev/price-ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "btc", name: "BTC", dir: dir, price: body, detail: pts(move) + " pts" })
    }).then(function (r) { return r.json(); }).then(function (out) {
      if (out && out.ok === false && out.error) {
        state.error = out.error;
        if (open) paint();
      }
    }).catch(function () {});
  }
  function check(price) {
    if (!(price > 0)) return;
    state.price = price;
    state.checked = Date.now();
    if (!(state.anchor > 0)) {
      state.anchor = price;
      write();
      return;
    }
    var step = state.step || 200;
    var move = price - state.anchor;
    if (state.on !== false && Math.abs(move) >= step) {
      state.lastDir = move > 0 ? "up" : "down";
      state.lastMove = Math.round(move);
      state.lastAlertAt = Date.now();
      state.anchor = price;
      ping(state.lastDir, state.lastMove, price);
    }
    write();
  }
  function pull() {
    if (pulling || document.visibilityState === "hidden") return;
    if (state.on === false && !open) return;
    pulling = true;
    fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        var price = Number(body && body.data && body.data.amount);
        state.error = price > 0 ? "" : "No BTC price";
        if (price > 0) check(price);
        if (open) paint();
      })
      .catch(function () { state.error = "Coinbase did not answer"; if (open) paint(); })
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
