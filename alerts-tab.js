(function () {
  if (window.__alertsTab) return;
  window.__alertsTab = 1;
  var API = "https://trading-ohlcv.sasipudi.workers.dev";
  var KEY = "trading_alert_types_v1";
  var TYPES = [
    { id: "bestpicks", name: "CA Best Picks", hint: "A saved coin newly becomes Early or Strong on at least one timeframe. Watch-only coins stay quiet.", tone: "#3dbe7a" },
    { id: "breakout", name: "Breakout", hint: "NEW BREAKOUT on a closed candle. One ping per coin and timeframe.", tone: "#ff5d6c" },
    { id: "breakout1m", name: "1 minute", hint: "Focus coin only. Fresh 1m breakout, shorter cooldown.", tone: "#e6b84d" },
    { id: "entry", name: "Entry quality", hint: "WINDOW, EXTENDED, or FAILED after a breakout.", tone: "#3dbe7a" },
    { id: "entrywindow", name: "Entry Window", hint: "NO CHASE, approaching, retest, reclaim, active, invalidated.", tone: "#7eb6ff" },
    { id: "fomoentry", name: "FomoEntry TAKE", hint: "A setup just entered TAKE. Zone, stop, and targets. Not a buy.", tone: "#e6b84d" },
    { id: "parabolic", name: "Parabolic", hint: "Dex smash. Does not wait for a higher-timeframe close.", tone: "#ff8a4a" },
    { id: "wowdip", name: "WOW DIP", hint: "Crash, avoid, or recovery test. Not an entry.", tone: "#ff5d6c" },
    { id: "position", name: "Position", hint: "Existing-position monitor. Not an entry signal.", tone: "#c9a6ff" },
    { id: "decision", name: "Decision Check", hint: "CLEAR, CHECK, and WAIT changes.", tone: "#e6b84d" },
    { id: "wallets", name: "Wallet tracker", hint: "Cluster or watchlist buys. Not a buy call.", tone: "#3dbe7a" }
  ];
  var state = {};
  var note = "Saved on this phone until the worker answers.";

  function $(id) { return document.getElementById(id); }
  function defaults() {
    var o = {};
    TYPES.forEach(function (t) { o[t.id] = true; });
    return o;
  }
  function readLocal() {
    var o = defaults();
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "{}");
      TYPES.forEach(function (t) {
        if (typeof saved[t.id] === "boolean") o[t.id] = saved[t.id];
      });
    } catch (e) {}
    return o;
  }
  function writeLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function hideOthers() {
    ["tf-panels", "fe-panel", "trend-panel", "struct-panel", "macro-panel", "signal-panel", "memegate-panel", "coin-panel", "antifomo-panel", "hunter-panel", "breakouts-panel", "holders-panel", "failures-panel", "inmemory-panel", "sentiment-panel", "keep-panel", "verdict-panel", "entrywindow-panel", "position-panel", "wowdip-panel", "omg-panel", "pitfalls-panel", "strategy-panel", "decision-panel", "gmgn-panel", "wallets-panel", "pumpfun-panel", "fomo-panel", "fx-panel", "fd-panel", "coinstats-panel", "emotion-panel"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.style.display = "none";
      el.classList.remove("on");
      if (id === "tf-panels") el.classList.add("hidden");
    });
  }
  function onCount() {
    return TYPES.filter(function (t) { return state[t.id] !== false; }).length;
  }
  function paint() {
    var box = $("alerts-board");
    if (!box) return;
    var rows = TYPES.map(function (t) {
      var on = state[t.id] !== false;
      return '<div style="display:flex;align-items:center;gap:12px;border:1px solid #2a3140;background:#12161d;border-radius:18px;padding:14px">' +
        '<div style="width:4px;align-self:stretch;border-radius:99px;background:' + t.tone + '"></div>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:900;font-size:15px">' + t.name + '</div>' +
        '<div style="margin-top:4px;color:#8b93a7;font-size:12px;line-height:1.4">' + t.hint + '</div></div>' +
        '<button type="button" class="al-sw" data-al="' + t.id + '" role="switch" aria-checked="' + (on ? "true" : "false") + '" aria-label="' + t.name + '">' +
        '<span class="al-knob"></span></button></div>';
    }).join("");
    box.innerHTML =
      '<div style="margin-bottom:14px"><div style="font-size:22px;font-weight:900">Alerts</div>' +
      '<div style="color:#8b93a7;font-size:13px;margin-top:4px">Every Telegram type. Off means that ping does not send.</div></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px">' +
      '<div style="font-size:12px;font-weight:900;letter-spacing:.12em;color:#8b93a7">' + onCount() + ' OF ' + TYPES.length + ' ON</div>' +
      '<div style="display:flex;gap:8px">' +
      '<button type="button" data-all="1" style="border:0;border-radius:999px;padding:8px 12px;font-weight:900;background:#143d2a;color:#3dbe7a">All on</button>' +
      '<button type="button" data-all="0" style="border:0;border-radius:999px;padding:8px 12px;font-weight:900;background:#2a151a;color:#ff5d6c">All off</button>' +
      '</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' + rows + '</div>' +
      '<div id="al-note" style="margin-top:12px;color:#8b93a7;font-size:12px">' + note + '</div>';
    box.querySelectorAll("[data-al]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-al");
        state[id] = !(state[id] !== false);
        writeLocal();
        paint();
        push({ types: (function () { var o = {}; o[id] = state[id]; return o; })() });
      });
    });
    box.querySelectorAll("[data-all]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var on = btn.getAttribute("data-all") === "1";
        TYPES.forEach(function (t) { state[t.id] = on; });
        writeLocal();
        paint();
        push({ typesAll: on });
      });
    });
  }
  async function pull() {
    try {
      var res = await fetch(API + "/status", { cache: "no-store" });
      var body = await res.json();
      if (body && body.alertTypes) {
        TYPES.forEach(function (t) {
          if (typeof body.alertTypes[t.id] === "boolean") state[t.id] = body.alertTypes[t.id];
        });
        writeLocal();
        note = "Saved on the worker. Telegram follows these switches.";
        paint();
      }
    } catch (e) {}
  }
  async function push(body) {
    note = "Saving…";
    var n = $("al-note");
    if (n) n.textContent = note;
    try {
      var res = await fetch(API + "/alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      var out = await res.json();
      if (out && out.alertTypes) {
        TYPES.forEach(function (t) {
          if (typeof out.alertTypes[t.id] === "boolean") state[t.id] = out.alertTypes[t.id];
        });
        writeLocal();
        note = "Saved on the worker. Telegram follows these switches.";
      } else {
        note = "Saved on this phone. Worker has not taken the switch yet.";
      }
    } catch (e) {
      note = "Saved on this phone. Worker did not answer.";
    }
    paint();
  }
  function show(on) {
    var p = $("alerts-panel");
    if (!p) return;
    if (!on) {
      p.style.display = "none";
      return;
    }
    hideOthers();
    p.style.display = "block";
    state = readLocal();
    paint();
    pull();
  }
  window.showAlerts = show;
  var tabs = $("tf-tabs");
  if (tabs) {
    tabs.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
      if (!b || b.getAttribute("data-tf") === "alerts") return;
      show(false);
    }, true);
  }
})();
