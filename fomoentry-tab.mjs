import { advancePaper, alertKey, buildFomoEntry, takeState } from "./fomoentry-engine.mjs?v=20260928-take";

(function () {
  if (window.__fomoEntryDesk) return;
  window.__fomoEntryDesk = 1;
  var API = "https://trading-ohlcv.sasipudi.workers.dev";
  var LOOKS = ["24H", "7D", "30D", "ALL"];
  var ca = "";
  var look = "ALL";
  var prev = null;
  var seen = {};
  var who = false;
  var timer = null;
  var cards = [];
  var last = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      return "&" + "quot;";
    });
  }
  function trim(s) { return String(s).replace(/0+$/, "").replace(/\.$/, ""); }
  function money(n) {
    n = +n;
    if (!(n > 0)) return "—";
    if (n >= 1) return "$" + n.toFixed(2);
    if (n >= 0.01) return "$" + trim(n.toFixed(4));
    return "$" + trim(n.toFixed(6));
  }
  function pct(n) {
    n = +n;
    if (!isFinite(n)) return "";
    return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
  }
  function badgeOf(s) {
    return takeState(s);
  }
  function horizon(id) {
    if (id === "24H") return "ACTIVE SWING · MINUTES TO HOURS";
    if (id === "7D") return "ACTIVE SWING · HOURS TO DAYS";
    if (id === "30D") return "ACTIVE SWING · DAYS TO WEEKS";
    return "ACTIVE SWING · SWING TO POSITION";
  }
  function hideOthers() {
    ["tf-panels", "alerts-panel", "trend-panel", "struct-panel", "macro-panel", "signal-panel", "memegate-panel", "coin-panel", "antifomo-panel", "hunter-panel", "breakouts-panel", "holders-panel", "failures-panel", "inmemory-panel", "sentiment-panel", "keep-panel", "verdict-panel", "entrywindow-panel", "position-panel", "wowdip-panel", "omg-panel", "pitfalls-panel", "strategy-panel", "decision-panel", "gmgn-panel", "wallets-panel", "pumpfun-panel", "fomo-panel", "fx-panel", "fd-panel", "coinstats-panel", "emotion-panel"].forEach(function (id) {
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

  function zoneCard(lv, hot) {
    var color = hot ? "#ff5d6c" : "#3dbe7a";
    var bg = hot ? "#2a151a" : "#102218";
    var line = hot ? "#6b2a34" : "#1d6b45";
    var w = Math.max(8, Math.min(100, +lv.strength || 0));
    return "<div style=\"border:1px solid " + line + ";background:" + bg + ";border-radius:16px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px\">" +
      "<div style=\"font-family:ui-monospace,monospace;font-size:18px;font-weight:700;color:" + color + "\">" + money(lv.price) + "</div>" +
      "<div style=\"color:#8b93a7;font-weight:800;font-size:14px\">" + esc(pct(lv.distancePct)) + "</div>" +
      "<div style=\"text-align:right;min-width:92px\"><div style=\"display:flex;justify-content:flex-end;align-items:center;gap:8px\"><b style=\"color:" + color + "\">" + lv.strength + "</b>" +
      "<span style=\"width:48px;height:6px;border-radius:99px;background:#ffffff14;display:inline-block;overflow:hidden\"><span style=\"display:block;height:100%;width:" + w + "%;background:" + color + "\"></span></span></div>" +
      "<div style=\"font-size:10px;letter-spacing:.14em;color:#8b93a7;font-weight:800;margin-top:4px\">STRENGTH</div></div></div>";
  }
  function ladder(kicker, price, note, tone) {
    var map = {
      target: ["#102218", "#1d6b45", "#3dbe7a"],
      trigger: ["#101820", "#2a4a6a", "#7eb6ff"],
      spot: ["#171c24", "#2a3140", "#f4f7fb"],
      entry: ["#241c10", "#6b5420", "#e6b84d"],
      stop: ["#2a151a", "#6b2a34", "#ff5d6c"]
    };
    var c = map[tone];
    return "<div style=\"border:1px solid " + c[1] + ";background:" + c[0] + ";border-radius:16px;padding:12px 14px\">" +
      "<div style=\"display:flex;justify-content:space-between;gap:8px;align-items:flex-start\"><div style=\"font-size:12px;font-weight:900;letter-spacing:.04em;color:" + c[2] + "\">" + esc(kicker) + "</div>" +
      "<div style=\"font-family:ui-monospace,monospace;font-size:18px;font-weight:700;color:#f4f7fb\">" + esc(price) + "</div></div>" +
      (note ? "<div style=\"margin-top:4px;font-size:12px;color:#8b93a7\">" + esc(note) + "</div>" : "") + "</div>";
  }

  function paint(setup) {
    var box = $("fe-board");
    if (!box || !setup) return;
    last = setup;
    var name = "Coin";
    var card = cards.find(function (c) { return String(c.ca).toLowerCase() === ca; });
    if (card && card.name) name = card.name;
    var badge = badgeOf(setup);
    var spot = setup.currentPrice || 0;
    var res = (setup.keyLevels.resistance || []).filter(function (l) { return l.price > spot; }).sort(function (a, b) { return b.price - a.price; }).slice(0, 4);
    var sup = (setup.keyLevels.support || []).filter(function (l) { return l.price < spot; }).sort(function (a, b) { return b.price - a.price; }).slice(0, 4);
    var targets = (setup.targets || []).slice().sort(function (a, b) { return b.price - a.price; });
    var above = (setup.keyLevels.resistance || []).filter(function (l) { return l.price > spot * 1.002; }).sort(function (a, b) { return a.price - b.price; });
    var trigger = (above[0] && above[0].price) || (setup.breakoutTrigger && setup.breakoutTrigger.price) || null;
    var rr = setup.rr && setup.rr.target1;
    var weak = (setup.quality || "").indexOf("WEAK") >= 0 || setup.dataQuality === "LIMITED HISTORY";
    var opts = cards.map(function (c) {
      var id = String(c.ca).toLowerCase();
      return "<option value=\"" + esc(id) + "\"" + (id === ca ? " selected" : "") + ">" + esc(c.name || id.slice(0, 6)) + "</option>";
    }).join("");
    var chips = LOOKS.map(function (id) {
      var on = id === look;
      return "<button type=\"button\" data-look=\"" + id + "\" style=\"flex:1;border:0;border-radius:12px;padding:8px 0;font-weight:900;background:" + (on ? "#e6b84d" : "transparent") + ";color:" + (on ? "#1a1406" : "#8b93a7") + "\">" + id + "</button>";
    }).join("");
    var targetHtml = targets.map(function (t, i) {
      return ladder("TARGET " + (targets.length - i), money(t.price), pct(t.percent) + " · " + (t.reason || ""), "target");
    }).join("");
    box.innerHTML =
      "<div style=\"display:flex;align-items:center;gap:8px;margin-bottom:12px\">" +
      "<div style=\"width:32px;height:32px;border-radius:99px;background:#171c24;color:#e6b84d;display:grid;place-items:center;font-weight:900\">" + esc(name.slice(0, 1).toUpperCase()) + "</div>" +
      "<select id=\"fe-ca\" style=\"flex:1;min-width:0;background:transparent;border:0;color:#f4f7fb;font-weight:900;font-size:16px\">" + opts + "</select>" +
      "<span style=\"border-radius:99px;padding:4px 10px;font-size:12px;font-weight:900;background:" + (badge === "TAKE" ? "#143d2a" : "#3a2e14") + ";color:" + (badge === "TAKE" ? "#3dbe7a" : "#e6b84d") + "\">" + badge + "</span></div>" +
      "<div style=\"display:flex;border:1px solid #2a3140;border-radius:16px;padding:4px;margin-bottom:14px\">" + chips + "</div>" +
      "<section style=\"border:1px solid #2a3140;border-radius:22px;padding:14px\">" +
      "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:10px\"><b style=\"letter-spacing:.04em\">TRADE SETUP</b>" +
      "<span style=\"border:1px solid #2a3140;border-radius:99px;padding:4px 10px;font-size:12px;font-weight:900\">R:R " + (rr != null ? Number(rr).toFixed(1) : "—") + " : 1</span></div>" +
      "<div style=\"display:inline-block;background:#132033;color:#7eb6ff;border-radius:99px;padding:4px 10px;font-size:12px;font-weight:900;margin-bottom:8px\">" + horizon(look) + "</div>" +
      "<div><span style=\"display:inline-block;border-radius:99px;padding:4px 10px;font-size:12px;font-weight:900;background:" + (weak ? "#3a2e14" : "#143d2a") + ";color:" + (weak ? "#e6b84d" : "#3dbe7a") + "\">" + esc(setup.quality || "WAIT") + "</span></div>" +
      "<div style=\"text-align:center;font-size:11px;letter-spacing:.14em;font-weight:900;color:#8b93a7;margin:10px 0\">" + (weak ? "PROJECTED FROM LIMITED MARKET HISTORY" : "FROM CLOSED MARKET STRUCTURE") + "</div>" +
      "<button type=\"button\" id=\"fe-who\" style=\"width:100%;text-align:left;border:1px solid #2a3140;background:transparent;color:#f4f7fb;border-radius:16px;padding:12px;font-weight:900;margin-bottom:10px\">" + (who ? "▾" : "▸") + " Who this setup is designed for</button>" +
      (who ? "<p style=\"color:#8b93a7;font-size:14px;line-height:1.45;margin:0 0 10px\">Someone who will wait for the entry zone and accept being wrong at the stop. Not a chase of the current price. " + esc(setup.reason || "") + "</p>" : "") +
      (weak ? "<p style=\"color:#8b93a7;font-size:14px;line-height:1.45;margin:0 0 10px\">Weak, provisional setup: limited token age or chart history means these levels are projected and should be rechecked as the market develops.</p>" : "") +
      (setup.invalidation ? "<div style=\"border:1px solid #2a3140;border-radius:16px;padding:12px;font-size:14px;line-height:1.45;margin-bottom:10px\"><b>Plan the downside first:</b> the suggested stop is approximately " + setup.invalidation.percentRisk + "% below the middle of the entry zone. Position size should reflect that risk.</div>" : "") +
      "<div style=\"display:flex;flex-direction:column;gap:8px\">" + targetHtml +
      ladder("BREAKOUT TRIGGER", money(trigger), "momentum entry above this", "trigger") +
      ladder("CURRENT PRICE", money(spot), "", "spot") +
      ladder("ENTRY ZONE", money(setup.entryZone && setup.entryZone.midpoint), setup.entryZone ? money(setup.entryZone.low) + " – " + money(setup.entryZone.high) : "No zone yet", "entry") +
      ladder("STOP / INVALIDATION", money(setup.invalidation && setup.invalidation.price), setup.invalidation ? setup.invalidation.percentRisk + "% below the entry midpoint · setup is wrong below this" : "No stop until a zone exists", "stop") +
      "</div></section>" +
      "<section style=\"margin-top:14px;border:1px solid #2a3140;border-radius:22px;padding:14px;background:#12161dcc\">" +
      "<div style=\"font-size:11px;letter-spacing:.16em;font-weight:900;color:#8b93a7;margin:2px 2px 8px\">RESISTANCE ZONES</div>" +
      (res.length ? res.map(function (l) { return zoneCard(l, true); }).join("<div style=\"height:8px\"></div>") : "<div style=\"color:#8b93a7;font-size:13px\">No resistance with enough evidence.</div>") +
      "<div style=\"display:flex;align-items:center;gap:8px;margin:14px 0\"><span style=\"flex:1;border-top:1px dashed #2a3140\"></span>" +
      "<div style=\"border:1px solid #e6b84d;color:#e6b84d;border-radius:99px;padding:8px 14px;font-weight:900;font-size:14px;white-space:nowrap\">Current Price " + money(spot) + "</div>" +
      "<span style=\"flex:1;border-top:1px dashed #2a3140\"></span></div>" +
      "<div style=\"font-size:11px;letter-spacing:.16em;font-weight:900;color:#8b93a7;margin:2px 2px 8px\">SUPPORT ZONES</div>" +
      (sup.length ? sup.map(function (l) { return zoneCard(l, false); }).join("<div style=\"height:8px\"></div>") : "<div style=\"color:#8b93a7;font-size:13px\">No support with enough evidence.</div>") +
      "</section>";
    var sel = $("fe-ca");
    if (sel) sel.addEventListener("change", function () {
      ca = sel.value;
      prev = null;
      try { localStorage.setItem("fomoentry_ca", ca); } catch (e) {}
      load();
    });
    box.querySelectorAll("[data-look]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        look = btn.getAttribute("data-look") || "ALL";
        prev = null;
        load();
      });
    });
    var whoBtn = $("fe-who");
    if (whoBtn) whoBtn.addEventListener("click", function () {
      who = !who;
      paint(last);
    });
    var st = $("fe-status");
    if (st) st.textContent = badge;
  }

  async function barsOf(mint) {
    var tfs = [["5m", 400], ["1h", 220], ["4h", 120], ["1d", 90], ["1w", 40]];
    var out = {};
    await Promise.all(tfs.map(async function (pair) {
      var res = await fetch(API + "/candles?ca=" + encodeURIComponent(mint) + "&tf=" + pair[0] + "&n=" + pair[1], { cache: "no-store" });
      var body = await res.json();
      out[pair[0]] = (body.bars || []).map(function (b) {
        return { t: +b.t, o: +b.o, h: +b.h, l: +b.l, c: +b.c, vol: +b.vol || 0 };
      });
    }));
    return out;
  }

  async function load() {
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
        ca: ca, lookback: look, bars: bars, spot: spot, now: Date.now(), prev: prev,
        entryWindow: card && card.ew, confirm: false
      });
      prev = next;
      advancePaper(null, next, Date.now());
      var bucket = Math.floor(Date.now() / 300000);
      (next.events || []).forEach(function (ev) { seen[alertKey(ca, next.setupId || "none", ev, bucket)] = 1; });
      paint(next);
    } catch (e) {
      var box = $("fe-board");
      if (box) box.innerHTML = "<div style=\"color:#ff5d6c;font-weight:800\">" + esc(e && e.message ? e.message : e) + "</div>";
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
  var active = document.querySelector("#tf-tabs .tab.active");
  if (active && active.getAttribute("data-tf") === "fe") show(true);
})();
