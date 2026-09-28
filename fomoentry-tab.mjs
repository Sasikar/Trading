import { advancePaper, alertKey, buildFomoEntry } from "./fomoentry-engine.mjs";

(function () {
  if (window.__fomoEntryDesk) return;
  window.__fomoEntryDesk = 1;
  var API = "https://trading-ohlcv.sasipudi.workers.dev";
  var ca = "";
  var look = "7D";
  var prev = null;
  var paper = null;
  var seen = {};
  var log = [];
  var open = "";
  var timer = null;
  var cards = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&";
      if (c === "<") return "<";
      if (c === ">") return ">";
      return """;
    });
  }
  function px(n) {
    n = +n;
    if (!(n > 0)) return "—";
    if (n >= 1) return n.toFixed(4);
    if (n >= 0.01) return n.toFixed(5);
    if (n >= 0.0001) return n.toFixed(6);
    return n.toPrecision(4);
  }
  function tone(label) {
    label = String(label || "");
    if (label.indexOf("ACTIVE") >= 0) return "#62e3a0";
    if (label.indexOf("NO CHASE") >= 0 || label.indexOf("INVALID") >= 0) return "#ff6f7c";
    if (label.indexOf("APPROACH") >= 0 || label.indexOf("ZONE") >= 0 || label.indexOf("WAIT") >= 0) return "#e6c878";
    return "#8491a1";
  }
  function headline(s) {
    var w = s.when || {};
    if (w.source === "entry-window" && (w.state === "NO_CHASE" || w.state === "INVALIDATED" || w.state === "EXPIRED")) return w.label || "NO CHASE";
    if (w.source === "entry-window" && w.state === "ENTRY_WINDOW_ACTIVE" && s.window && (s.window.state === "IN_ZONE" || s.window.state === "ENTRY_WINDOW_ACTIVE")) return "ENTRY WINDOW ACTIVE";
    return (s.window && s.window.label) || s.status || "WAIT";
  }
  function hideOthers() {
    ["tf-panels", "trend-panel", "struct-panel", "macro-panel", "signal-panel", "memegate-panel", "coin-panel", "antifomo-panel", "hunter-panel", "breakouts-panel", "holders-panel", "failures-panel", "inmemory-panel", "sentiment-panel", "keep-panel", "verdict-panel", "entrywindow-panel", "position-panel", "wowdip-panel", "omg-panel", "pitfalls-panel", "strategy-panel", "decision-panel", "gmgn-panel", "wallets-panel", "pumpfun-panel", "fomo-panel", "fx-panel", "fd-panel", "coinstats-panel", "emotion-panel"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.style.display = "none";
      el.classList.remove("on");
      if (id === "tf-panels") el.classList.add("hidden");
    });
  }
  function show(on) {
    var p = $("fe-panel");
    if (!p) return;
    if (!on) {
      p.style.display = "none";
      p.classList.remove("on");
      if (timer) { clearInterval(timer); timer = null; }
      return;
    }
    hideOthers();
    p.style.display = "block";
    p.classList.add("on");
    boot();
  }
  window.showFomoEntryDesk = show;

  function dist(spot, zone) {
    if (!zone || !(spot > 0)) return null;
    if (spot > zone.high) return ((spot - zone.high) / zone.high) * 100;
    if (spot < zone.low) return ((spot - zone.low) / zone.low) * 100;
    return 0;
  }

  async function barsOf(mint) {
    var tfs = [["5m", 400], ["1h", 220], ["4h", 120], ["1d", 90], ["1w", 40]];
    var out = {};
    await Promise.all(tfs.map(async function (pair) {
      var tf = pair[0], n = pair[1];
      var res = await fetch(API + "/candles?ca=" + encodeURIComponent(mint) + "&tf=" + tf + "&n=" + n, { cache: "no-store" });
      var body = await res.json();
      out[tf] = (body.bars || []).map(function (b) {
        return { t: +b.t, o: +b.o, h: +b.h, l: +b.l, c: +b.c, vol: +b.vol || 0 };
      });
    }));
    return out;
  }

  function levelRows(list, kind) {
    return list.slice(0, 6).map(function (lv) {
      var id = kind + lv.price;
      var on = open === id;
      var distTxt = lv.distancePct == null ? "" : ((lv.distancePct > 0 ? "+" : "") + lv.distancePct + "%");
      var color = kind === "res" ? "#ff6f7c" : "#62e3a0";
      var html = "<button type=\"button\" data-lv=\"" + esc(id) + "\" style=\"width:100%;display:flex;justify-content:space-between;gap:8px;padding:8px 2px;border:0;background:transparent;color:#f4f7fb;font-weight:800;text-align:left\">" +
        "<span style=\"color:" + color + ";font-variant-numeric:tabular-nums\">" + px(lv.price) + "</span>" +
        "<span style=\"color:#8491a1\">" + esc(distTxt) + "</span>" +
        "<span>S " + lv.strength + "</span>" +
        "<span style=\"color:#8491a1\">" + lv.touchCount + "t</span></button>";
      if (on) {
        html += "<div style=\"font-size:12px;color:#8491a1;padding:0 2px 8px\">" + esc((lv.role || lv.type || "").replace(/_/g, " ")) +
          " · " + esc((lv.tfs || []).join("+")) + " · " + lv.touchCount + " touches · age " + (lv.ageBars == null ? "—" : lv.ageBars) + " bars</div>";
      }
      return html;
    }).join("");
  }

  function paint(setup, card) {
    var box = $("fe-board");
    if (!box || !setup) return;
    var label = headline(setup);
    var zone = setup.entryZone;
    var gap = dist(setup.currentPrice, zone);
    var when = setup.when || {};
    var targets = (setup.targets || []).map(function (t, i) {
      return "<div style=\"display:flex;gap:8px;justify-content:space-between;font-size:13px\"><b style=\"color:#ff6f7c\">T" + (i + 1) + "</b><span>" + px(t.price) + "</span><span style=\"color:#8491a1\">+" + t.percent + "%</span><span style=\"color:#8491a1;flex:1;text-align:right\">" + esc(t.reason) + "</span></div>";
    }).join("");
    var opts = cards.map(function (c) {
      var id = String(c.ca).toLowerCase();
      return "<option value=\"" + esc(id) + "\"" + (id === ca ? " selected" : "") + ">" + esc(c.name || id.slice(0, 6)) + " · " + esc((c.ew && c.ew.label) || "saved") + "</option>";
    }).join("");
    var chips = ["24H", "7D", "ALL"].map(function (id) {
      var on = id === look;
      return "<button type=\"button\" data-look=\"" + id + "\" style=\"padding:8px 12px;border-radius:10px;border:0;font-weight:800;background:" + (on ? "#e6c878" : "transparent") + ";color:" + (on ? "#1a1406" : "#8491a1") + "\">" + id + "</button>";
    }).join("");
    box.innerHTML =
      "<div style=\"display:flex;gap:8px;flex-wrap:wrap;align-items:center\">" +
      "<select id=\"fe-ca\" style=\"flex:1;min-width:180px;padding:12px;border-radius:12px;border:1px solid #263341;background:#121a24;color:#f4f7fb;font-weight:800\">" + opts + "</select>" +
      "<div style=\"display:flex;border:1px solid #263341;border-radius:12px;padding:2px\">" + chips + "</div></div>" +
      "<div style=\"margin-top:12px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start\">" +
      "<div><div style=\"font-size:11px;font-weight:800;color:#8491a1\">" + esc((card && card.name) || "Saved") + " · " + esc(setup.setupType || "No setup") + "</div>" +
      "<div style=\"font-size:28px;font-weight:900;color:" + tone(label) + ";line-height:1.1;margin-top:4px\">" + esc(label) + "</div></div>" +
      "<div style=\"text-align:right\"><div style=\"font-size:11px;color:#8491a1;font-weight:800\">SPOT</div><div style=\"font-size:18px;font-weight:800;color:#6eb6ff\">" + px(setup.currentPrice) + "</div>" +
      "<div style=\"font-size:11px;color:#8491a1\">" + (gap == null || !zone ? "" : gap === 0 ? "Inside zone" : (gap > 0 ? "+" : "") + gap.toFixed(1) + "% vs zone") + "</div></div></div>" +
      "<div style=\"margin-top:12px;padding:12px;border-radius:14px;border:1px solid #e6c87855;background:#121a24\">" +
      "<div style=\"font-size:11px;font-weight:900;letter-spacing:.08em;color:#e6c878\">NEXT ENTRY ZONE</div>" +
      "<div style=\"font-size:20px;font-weight:800;margin-top:4px\">" + (zone ? px(zone.low) + " – " + px(zone.high) : "No zone") + "</div>" +
      "<div style=\"font-size:13px;color:#8491a1;margin-top:4px\">" + esc(setup.reason) + "</div></div>" +
      "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px\">" +
      stat("Invalidation", px(setup.invalidation && setup.invalidation.price), setup.invalidation ? setup.invalidation.percentRisk + "% risk" : "", "#ff6f7c") +
      stat("Trigger", px(setup.breakoutTrigger && setup.breakoutTrigger.price), (setup.breakoutTrigger && setup.breakoutTrigger.reason) || "", "#f4f7fb") +
      stat("R:R T1", setup.rr && setup.rr.target1 != null ? setup.rr.target1 + " : 1" : "—", "Only a real shelf", "#f4f7fb") +
      stat("Quality", setup.quality || "—", setup.dataQuality || "", "#f4f7fb") +
      "</div>" + targets +
      "<div style=\"margin-top:12px;padding:12px;border-radius:14px;border:1px solid #263341\">" +
      "<div style=\"font-size:11px;font-weight:900;color:#8491a1\">ENTRY WINDOW · WHEN</div>" +
      "<div style=\"font-weight:900;font-size:16px;color:" + tone(when.label) + "\">" + esc(when.label || "WAIT") + "</div>" +
      "<div style=\"font-size:13px;color:#8491a1;margin-top:4px\">" + esc(when.why || "Existing Entry Window owns confirmation. This does not buy.") + "</div></div>" +
      "<div style=\"margin-top:12px\"><div style=\"font-weight:900;font-size:13px\">Key levels</div>" +
      "<div style=\"font-size:11px;font-weight:800;color:#ff6f7c;margin-top:8px\">RESISTANCE</div>" + levelRows((setup.keyLevels.resistance || []).slice().sort(function (a, b) { return b.price - a.price; }), "res") +
      "<div style=\"margin:6px 0;padding:8px;border-radius:10px;background:#121a24;color:#6eb6ff;font-weight:800\">Price " + px(setup.currentPrice) + "</div>" +
      "<div style=\"font-size:11px;font-weight:800;color:#62e3a0\">SUPPORT</div>" + levelRows((setup.keyLevels.support || []).slice().sort(function (a, b) { return b.price - a.price; }), "sup") +
      "</div>" +
      "<div style=\"margin-top:10px;font-size:12px;color:#8491a1\">Paper MFE " + (paper && paper.mfe != null ? paper.mfe : "—") + "% · MAE " + (paper && paper.mae != null ? paper.mae : "—") + "% · " +
      (log[0] ? esc(log[0]) : "No state change yet. Telegram stays on Entry Window.") + "</div>";
    var sel = $("fe-ca");
    if (sel) sel.addEventListener("change", function () {
      ca = sel.value;
      prev = null;
      paper = null;
      try { localStorage.setItem("fomoentry_ca", ca); } catch (e) {}
      load();
    });
    box.querySelectorAll("[data-look]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        look = btn.getAttribute("data-look");
        prev = null;
        load();
      });
    });
    box.querySelectorAll("[data-lv]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-lv");
        open = open === id ? "" : id;
        paint(setup, card);
      });
    });
    var st = $("fe-status");
    if (st) { st.textContent = label; st.style.color = tone(label); }
  }
  function stat(k, v, sub, color) {
    return "<div style=\"background:#121a24;border-radius:12px;padding:8px 10px\"><div style=\"font-size:10px;color:#8491a1;font-weight:800\">" + esc(k) + "</div><div style=\"font-weight:800;color:" + color + "\">" + esc(v) + "</div><div style=\"font-size:11px;color:#8491a1\">" + esc(sub || "") + "</div></div>";
  }

  async function load() {
    var st = $("fe-status");
    if (st) st.textContent = "LOADING";
    try {
      var ew = await fetch(API + "/entry-window?tf=1h", { cache: "no-store" }).then(function (r) { return r.json(); });
      cards = ew.cards || [];
      if (!ca) {
        var saved = "";
        try { saved = localStorage.getItem("fomoentry_ca") || ""; } catch (e) {}
        var jean = cards.find(function (c) { return /jeanphil/i.test(c.name || "") || String(c.ca).toLowerCase().indexOf("gtbxuiw") === 0; });
        ca = saved || (jean && String(jean.ca).toLowerCase()) || (cards[0] && String(cards[0].ca).toLowerCase()) || "";
      }
      if (!ca) throw new Error("No saved coins");
      var bars = await barsOf(ca);
      var card = cards.find(function (c) { return String(c.ca).toLowerCase() === ca; });
      var spot = (card && card.ew && +card.ew.spot) || (bars["5m"] && bars["5m"].length && +bars["5m"][bars["5m"].length - 1].c) || 0;
      var next = buildFomoEntry({
        ca: ca,
        lookback: look,
        bars: bars,
        spot: spot,
        now: Date.now(),
        prev: prev,
        entryWindow: card && card.ew,
        confirm: false
      });
      prev = next;
      paper = advancePaper(paper, next, Date.now());
      var bucket = Math.floor(Date.now() / 300000);
      (next.events || []).forEach(function (ev) {
        var key = alertKey(ca, next.setupId || "none", ev, bucket);
        if (seen[key]) return;
        seen[key] = 1;
        log.unshift(new Date().toLocaleTimeString() + "  " + String(ev).replace(/_/g, " "));
      });
      log = log.slice(0, 8);
      paint(next, card);
    } catch (e) {
      if (st) st.textContent = "ERROR";
      var box = $("fe-board");
      if (box) box.innerHTML = "<div style=\"color:#ff6f7c;font-weight:800\">" + esc(e && e.message ? e.message : e) + "</div>";
    }
  }

  function boot() {
    load();
    if (timer) clearInterval(timer);
    timer = setInterval(load, 45000);
  }

  var tabs = $("tf-tabs");
  if (tabs) {
    tabs.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
      if (!b || b.getAttribute("data-tf") === "fe") return;
      show(false);
    }, true);
  }
})();
