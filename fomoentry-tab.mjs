import { advancePaper, alertKey, buildFomoEntry, takeState } from "./fomoentry-engine.mjs?v=20260928-near";

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
  var query = "";
  var menuOpen = false;
  var takes = [];
  var page = 0;
  var lane = "all";
  var scanned = false;
  var scanning = false;

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
    return "$" + n.toPrecision(4);
  }
  function pct(n) {
    n = +n;
    if (!isFinite(n)) return "";
    return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
  }
  function badgeOf(s) {
    return takeState(s);
  }
  function fmtMc(n) {
    n = +n;
    if (!(n > 0)) return "";
    if (n >= 1e9) return "$" + trim((n / 1e9).toFixed(n >= 10e9 ? 1 : 2)) + "B";
    if (n >= 1e6) return "$" + trim((n / 1e6).toFixed(n >= 100e6 ? 1 : 2)) + "M";
    if (n >= 1e3) return "$" + trim((n / 1e3).toFixed(n >= 1e5 ? 0 : 1)) + "k";
    return "$" + Math.round(n);
  }
  var quotes = {};
  function mcOf(c) {
    var id = String(c.ca || "").toLowerCase();
    var q = quotes[id];
    if (q && q.mc > 0) return q.mc;
    return +c.mcap || 0;
  }
  function fmtIst(ms) {
    ms = +ms;
    if (!(ms > 0)) return "";
    var d = new Date(ms + 330 * 60 * 1000);
    var mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
    var h = d.getUTCHours();
    var m = d.getUTCMinutes();
    var ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    var mm = (m < 10 ? "0" : "") + m;
    return d.getUTCDate() + " " + mon + ", " + h + ":" + mm + " " + ap + " IST";
  }
  function takeWhere(setup) {
    var zone = setup && setup.entryZone;
    var spot = setup && +setup.currentPrice;
    if (!zone || !(spot > 0) || !(zone.high > 0) || !(zone.low > 0)) return "";
    if (spot >= zone.low && spot <= zone.high) return "in";
    if (spot > zone.high && (spot - zone.high) / zone.high <= 0.03) return "above";
    if (spot < zone.low && (zone.low - spot) / zone.low <= 0.03) return "under";
    return "";
  }
  function takeChips(active) {
    var items = [
      ["in", "IN THE ZONE"],
      ["under", "WITHIN 3% UNDER"],
      ["above", "WITHIN 3% ABOVE"]
    ];
    return "<div style=\"display:flex;flex-wrap:wrap;gap:6px;margin-top:8px\">" + items.map(function (item) {
      var on = item[0] === active;
      return "<span style=\"border-radius:99px;padding:5px 10px;font-size:11px;font-weight:900;border:1px solid " + (on ? "#1d6b45" : "#2a3140") + ";background:" + (on ? "#143d2a" : "transparent") + ";color:" + (on ? "#3dbe7a" : "#6d7688") + "\">" + item[1] + "</span>";
    }).join("") + "</div>";
  }
  function metrics(item) {
    var s = item && item.setup;
    if (!s) return { risk: 99, up: 0, rr: 0, where: "" };
    var risk = s.invalidation ? +s.invalidation.percentRisk : 0;
    var t1 = s.targets && s.targets[0];
    var up = t1 ? +t1.percent : 0;
    var rr = s.rr && +s.rr.target1 > 0 ? +s.rr.target1 : risk > 0 && up > 0 ? up / risk : 0;
    return { risk: risk > 0 ? risk : 99, up: up, rr: rr, where: takeWhere(s) };
  }
  function laneList() {
    var rows = takes.slice();
    if (lane === "up") {
      rows = rows.filter(function (t) {
        var m = metrics(t);
        return m.up >= 15 && m.rr >= 1.5;
      });
      rows.sort(function (a, b) { return metrics(b).rr - metrics(a).rr || metrics(b).up - metrics(a).up; });
    } else if (lane === "down") {
      rows = rows.filter(function (t) {
        var m = metrics(t);
        return m.risk <= 8 && (m.where === "in" || m.where === "under");
      });
      rows.sort(function (a, b) { return metrics(a).risk - metrics(b).risk; });
    }
    return rows;
  }
  function laneBar() {
    var items = [["all", "ALL TAKE"], ["up", "BEST UPSIDE"], ["down", "PROTECT"]];
    return "<div style=\"display:flex;gap:6px;margin-bottom:10px\">" + items.map(function (it) {
      var on = lane === it[0];
      var bg = !on ? "transparent" : it[0] === "down" ? "#6b2a34" : it[0] === "up" ? "#1d6b45" : "#e6b84d";
      var fg = !on ? "#8b93a7" : it[0] === "all" ? "#1a1406" : "#f4f7fb";
      return "<button type=\"button\" data-lane=\"" + it[0] + "\" style=\"flex:1;border:1px solid #2a3140;border-radius:14px;padding:9px 4px;font-size:11px;font-weight:900;letter-spacing:.03em;background:" + bg + ";color:" + fg + "\">" + it[1] + "</button>";
    }).join("") + "</div>";
  }
  function pagerHtml() {
    if (!takes.length) return "";
    var list = laneList();
    var note = lane === "up" ? "First target at least +15%, and it must pay at least 1.5 times the stop." : lane === "down" ? "Stop within 8%, and price is in the zone or 3% under it." : "Every coin currently in TAKE.";
    var nums = list.map(function (t, i) {
      var on = String(t.ca) === ca;
      return "<button type=\"button\" data-page=\"" + i + "\" title=\"" + esc(t.name || "") + "\" style=\"width:34px;height:34px;border-radius:12px;border:1px solid " + (on ? "#e6b84d" : "#2a3140") + ";background:" + (on ? "#e6b84d" : "#12161d") + ";color:" + (on ? "#1a1406" : "#c5cad6") + ";font-weight:900;font-size:13px\">" + (i + 1) + "</button>";
    }).join("");
    var cur = list.filter(function (t) { return String(t.ca) === ca; })[0];
    var pos = 0;
    list.forEach(function (t, i) { if (String(t.ca) === ca) pos = i; });
    var riskLine = "";
    if (lane === "up" && cur) {
      var m = metrics(cur);
      riskLine = "<div style=\"border:1px solid #1d6b45;background:#102218;border-radius:16px;padding:10px 12px;margin:-4px 0 12px;font-size:13px;line-height:1.45;color:#d7deea\"><b style=\"color:#3dbe7a\">" + (m.rr > 0 ? m.rr.toFixed(1) + "× the stop." : "Stop multiple.") + "</b> R means the stop-loss risk, not the reward. The stop is " + (m.risk < 99 ? m.risk.toFixed(1) + "% under the entry middle." : "not set.") + (m.up > 0 && m.risk > 0 && m.risk < 99 ? " The first target is +" + m.up.toFixed(1) + "%, so " + m.up.toFixed(1) + " ÷ " + m.risk.toFixed(1) + " = " + m.rr.toFixed(1) + "." : "") + "</div>";
    }
    return laneBar() +
      "<div style=\"font-size:12px;color:#8b93a7;font-weight:700;margin:-2px 2px 8px\">" + note + "</div>" +
      (list.length
        ? "<div style=\"display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px\">" + nums +
          "<span style=\"font-size:12px;font-weight:800;color:#8b93a7\">" + (cur ? esc(cur.name) + " · " : "") + (pos + 1) + " / " + list.length + "</span></div>" + riskLine
        : "<div style=\"border:1px solid #2a3140;border-radius:16px;padding:12px;margin-bottom:12px;color:#8b93a7;font-weight:800\">No TAKE coin clears this tab. The setup below stays hidden so it is not mistaken for a match.</div>");
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

  function paint(setup, keepFocus) {
    var box = $("fe-board");
    if (!box || !setup) return;
    var wasTyping = !!keepFocus || (document.activeElement && document.activeElement.id === "fe-q");
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
    var q = query.trim().toLowerCase();
    var shown = cards.filter(function (c) {
      if (!q) return true;
      var id = String(c.ca).toLowerCase();
      return (c.name || "").toLowerCase().indexOf(q) >= 0 || id.indexOf(q) >= 0;
    });
    var mintish = /^[1-9A-HJ-NP-Za-km-z]{32,48}$/.test(query.trim());
    var rows = shown.slice(0, 12).map(function (c) {
      var id = String(c.ca).toLowerCase();
      var on = id === ca;
      var mc = fmtMc(mcOf(c));
      return "<button type=\"button\" class=\"fe-row" + (on ? " on" : "") + "\" data-ca=\"" + esc(id) + "\">" +
        "<span class=\"fe-ava\">" + esc((c.name || "?").slice(0, 1).toUpperCase()) + "</span>" +
        "<span style=\"flex:1;min-width:0;font-weight:800\">" + esc(c.name || id.slice(0, 6)) + "</span>" +
        "<span style=\"font-weight:800;font-size:13px;color:" + (mc ? "#3dbe7a" : "#6d7688") + "\">" + esc(mc || "MC —") + "</span>" +
        "</button>";
    }).join("");
    if (!rows && mintish) {
      rows = "<button type=\"button\" class=\"fe-row\" data-ca=\"" + esc(query.trim()) + "\"><span class=\"fe-ava\">+</span><span style=\"font-weight:800\">Load this CA</span></button>";
    }
    if (!rows) rows = "<div style=\"padding:14px;color:#6d7688;font-size:13px\">No coin matches.</div>";
    var chips = LOOKS.map(function (id) {
      var on = id === look;
      return "<button type=\"button\" data-look=\"" + id + "\" style=\"flex:1;border:0;border-radius:12px;padding:8px 0;font-weight:900;background:" + (on ? "#e6b84d" : "transparent") + ";color:" + (on ? "#1a1406" : "#8b93a7") + "\">" + id + "</button>";
    }).join("");
    var targetHtml = targets.map(function (t, i) {
      return ladder("TARGET " + (targets.length - i), money(t.price), pct(t.percent) + " · " + (t.reason || ""), "target");
    }).join("");
    var zoneNote = "No zone yet";
    if (setup.entryZone) {
      zoneNote = money(setup.entryZone.low) + " – " + money(setup.entryZone.high);
      var touched = fmtIst(setup.entryZone.triggeredAt);
      zoneNote += touched ? " · Triggered " + touched : " · No trigger in this lookback";
    }
    box.innerHTML =
      "<div style=\"margin-bottom:14px\">" +
      "<div class=\"fe-lab\">SEARCH</div>" +
      "<label class=\"fe-search\"><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#6d7688\" stroke-width=\"2.4\"><circle cx=\"11\" cy=\"11\" r=\"7\"></circle><path d=\"M20 20l-3.5-3.5\"></path></svg>" +
      "<input id=\"fe-q\" type=\"search\" placeholder=\"Name or contract\" value=\"" + esc(query) + "\" autocomplete=\"off\"></label>" +
      "<div class=\"fe-lab\" style=\"margin-top:12px\">COIN</div>" +
      "<button type=\"button\" class=\"fe-drop\" id=\"fe-drop\" aria-expanded=\"" + (menuOpen ? "true" : "false") + "\">" +
      "<span class=\"fe-ava\">" + esc(name.slice(0, 1).toUpperCase()) + "</span>" +
      "<span style=\"flex:1;min-width:0\"><span style=\"display:block;font-weight:900;font-size:16px\">" + esc(name) + "</span>" +
      "<span style=\"display:block;color:#3dbe7a;font-size:12px;font-weight:800\">" + esc(fmtMc(mcOf(card || { ca: ca })) || "MC —") + "</span></span>" +
      "<span style=\"border-radius:99px;padding:4px 10px;font-size:11px;font-weight:900;background:" + (badge === "TAKE" ? "#143d2a" : "#3a2e14") + ";color:" + (badge === "TAKE" ? "#3dbe7a" : "#e6b84d") + "\">" + badge + "</span>" +
      "<span style=\"color:#8b93a7;font-size:12px\">" + (menuOpen ? "▴" : "▾") + "</span></button>" +
      (menuOpen ? "<div class=\"fe-menu\" id=\"fe-menu\">" + rows + "</div>" : "") +
      "</div>" +
      pagerHtml() +
      (lane !== "all" && !laneList().length ? "" :
      "<div style=\"display:flex;border:1px solid #2a3140;border-radius:16px;padding:4px;margin-bottom:14px\">" + chips + "</div>" +
      "<section style=\"border:1px solid #2a3140;border-radius:22px;padding:14px\">" +
      "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:10px\"><b style=\"letter-spacing:.04em\">TRADE SETUP</b>" +
      "<span style=\"border:1px solid #2a3140;border-radius:99px;padding:4px 10px;font-size:12px;font-weight:900\">" + (rr != null ? (lane === "up" ? Number(rr).toFixed(1) + "× THE STOP" : "R:R " + Number(rr).toFixed(1) + " : 1") : "—") + "</span></div>" +
      "<div style=\"display:inline-block;background:#132033;color:#7eb6ff;border-radius:99px;padding:4px 10px;font-size:12px;font-weight:900;margin-bottom:8px\">" + horizon(look) + "</div>" +
      "<div><span style=\"display:inline-block;border-radius:99px;padding:4px 10px;font-size:12px;font-weight:900;background:" + (weak ? "#3a2e14" : "#143d2a") + ";color:" + (weak ? "#e6b84d" : "#3dbe7a") + "\">" + esc(setup.quality || "WAIT") + "</span></div>" +
      takeChips(takeWhere(setup)) +
      "<div style=\"text-align:center;font-size:11px;letter-spacing:.14em;font-weight:900;color:#8b93a7;margin:10px 0\">" + (weak ? "PROJECTED FROM LIMITED MARKET HISTORY" : "FROM CLOSED MARKET STRUCTURE") + "</div>" +
      "<button type=\"button\" id=\"fe-who\" style=\"width:100%;text-align:left;border:1px solid #2a3140;background:transparent;color:#f4f7fb;border-radius:16px;padding:12px;font-weight:900;margin-bottom:10px\">" + (who ? "▾" : "▸") + " Who this setup is designed for</button>" +
      (who ? "<p style=\"color:#8b93a7;font-size:14px;line-height:1.45;margin:0 0 10px\">Someone who will wait for the entry zone and accept being wrong at the stop. Not a chase of the current price. " + esc(setup.reason || "") + "</p>" : "") +
      (weak ? "<p style=\"color:#8b93a7;font-size:14px;line-height:1.45;margin:0 0 10px\">Weak, provisional setup: limited token age or chart history means these levels are projected and should be rechecked as the market develops.</p>" : "") +
      (setup.invalidation ? "<div style=\"border:1px solid #2a3140;border-radius:16px;padding:12px;font-size:14px;line-height:1.45;margin-bottom:10px\"><b>Plan the downside first:</b> the suggested stop is approximately " + setup.invalidation.percentRisk + "% below the middle of the entry zone. Position size should reflect that risk.</div>" : "") +
      "<div style=\"display:flex;flex-direction:column;gap:8px\">" + targetHtml +
      ladder("BREAKOUT TRIGGER", money(trigger), "momentum entry above this", "trigger") +
      ladder("CURRENT PRICE", money(spot), "", "spot") +
      ladder("ENTRY ZONE", money(setup.entryZone && setup.entryZone.midpoint), zoneNote, "entry") +
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
      "</section>");
    var qEl = $("fe-q");
    if (qEl) {
      qEl.addEventListener("input", function () {
        query = qEl.value;
        menuOpen = true;
        paint(last, true);
      });
      if (wasTyping) {
        qEl.focus();
        var n = qEl.value.length;
        try { qEl.setSelectionRange(n, n); } catch (e) {}
      }
    }
    var drop = $("fe-drop");
    if (drop) drop.addEventListener("click", function () {
      menuOpen = !menuOpen;
      paint(last);
    });
    box.querySelectorAll("[data-lane]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        lane = btn.getAttribute("data-lane") || "all";
        var list = laneList();
        page = 0;
        if (!list.length) {
          if (last) paint(last);
          return;
        }
        ca = list[0].ca;
        query = "";
        menuOpen = false;
        prev = null;
        if (list[0].setup) paint(list[0].setup);
        load();
      });
    });
    box.querySelectorAll("[data-page]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var n = +btn.getAttribute("data-page");
        var list = laneList();
        if (!list[n]) return;
        page = n;
        ca = list[n].ca;
        query = "";
        menuOpen = false;
        prev = null;
        if (list[n].setup) paint(list[n].setup);
        load();
      });
    });
    box.querySelectorAll("[data-ca]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        ca = btn.getAttribute("data-ca") || ca;
        query = "";
        menuOpen = false;
        prev = null;
        try { localStorage.setItem("fomoentry_ca", ca); } catch (e) {}
        load();
      });
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
    var tfs = [["5m", 400], ["15m", 400], ["30m", 400], ["1h", 240], ["4h", 160], ["1d", 90], ["1w", 40]];
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

  var mcAt = 0;
  var trigToken = 0;
  async function dexJson(cas) {
    var path = "/latest/dex/tokens/" + cas.map(encodeURIComponent).join(",");
    try {
      var r = await fetch("https://api.dexscreener.com" + path, { cache: "no-store" });
      if (r.ok) return await r.json();
    } catch (e) {}
    var pr = await fetch("https://trading-proxy.sasipudi.workers.dev/dex?path=" + encodeURIComponent(path), { cache: "no-store" });
    if (!pr.ok) throw new Error("dex " + pr.status);
    return pr.json();
  }
  function keepBest(body) {
    var best = {};
    (body.pairs || []).forEach(function (p) {
      var mint = String((p.baseToken && p.baseToken.address) || "").toLowerCase();
      var mc = +p.marketCap || +p.fdv || 0;
      var price = +p.priceUsd || 0;
      var liq = +((p.liquidity && p.liquidity.usd) || 0);
      if (!mint || !(mc > 0 || price > 0)) return;
      if (!best[mint] || liq > best[mint].liq) best[mint] = { mc: mc, price: price, liq: liq, pair: p.pairAddress || "", chain: p.chainId || "" };
    });
    Object.keys(best).forEach(function (k) { quotes[k] = best[k]; });
  }
  async function fillMc() {
    var now = Date.now();
    if (mcAt && now - mcAt < 45000) return;
    var need = cards.map(function (c) { return String(c.ca || ""); }).filter(Boolean);
    if (!need.length) return;
    mcAt = now;
    try {
      for (var i = 0; i < need.length; i += 30) {
        keepBest(await dexJson(need.slice(i, i + 30)));
      }
      if (last) {
        var live = quotes[ca];
        if (live && live.price > 0) last.currentPrice = live.price;
        paint(last);
      }
    } catch (e) {
      mcAt = 0;
    }
  }

  async function gtBars(chain, pool, frame) {
    var net = String(chain || "").toLowerCase();
    if (net === "sol" || net === "solana") net = "solana";
    else if (net === "eth" || net === "ethereum") net = "eth";
    var path = "/networks/" + net + "/pools/" + pool + "/ohlcv/" + frame;
    var urls = [
      "https://api.geckoterminal.com/api/v2" + path,
      "https://trading-proxy.sasipudi.workers.dev/gt?path=" + encodeURIComponent(path)
    ];
    for (var i = 0; i < urls.length; i++) {
      try {
        var r = await fetch(urls[i], { cache: "no-store" });
        if (!r.ok) continue;
        var j = await r.json();
        var list = j && j.data && j.data.attributes && j.data.attributes.ohlcv_list;
        if (list && list.length) return list;
      } catch (e) {}
    }
    return [];
  }
  async function refineTrigger(setup, token) {
    var zone = setup && setup.entryZone;
    var q = quotes[String(ca || "").toLowerCase()];
    if (!zone || !q || !q.pair) return;
    var frames = [
      ["hour?aggregate=1&limit=240&currency=usd", 60 * 60 * 1000],
      ["minute?aggregate=15&limit=200&currency=usd", 15 * 60 * 1000]
    ];
    var bestOpen = 0;
    var bestAt = 0;
    for (var f = 0; f < frames.length; f++) {
      var list = await gtBars(q.chain, q.pair, frames[f][0]);
      if (token !== trigToken) return;
      var ms = frames[f][1];
      for (var i = 0; i < list.length; i++) {
        var row = list[i];
        var t = +row[0];
        if (t > 0 && t < 1e12) t *= 1000;
        var hi = +row[2];
        var lo = +row[3];
        if (!(t > 0) || !(hi > 0) || !(lo > 0)) continue;
        if (hi < zone.low || lo > zone.high) continue;
        if (t >= bestOpen) {
          bestOpen = t;
          bestAt = Math.min(Date.now(), t + ms);
        }
      }
    }
    if (token !== trigToken || !(bestAt > 0)) return;
    if (bestAt > (+zone.triggeredAt || 0)) {
      zone.triggeredAt = bestAt;
      if (last === setup) paint(setup);
    }
  }

  async function barsLight(mint) {
    var tfs = [["5m", 160], ["1h", 140], ["4h", 80], ["1d", 50]];
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
  async function setupFor(mint, card, heavy) {
    var bars = heavy ? await barsOf(mint) : await barsLight(mint);
    var live = quotes[String(mint).toLowerCase()];
    var spot = (live && live.price > 0 && live.price) || (card && card.ew && +card.ew.spot) || (bars["5m"] && bars["5m"].length && +bars["5m"][bars["5m"].length - 1].c) || 0;
    return buildFomoEntry({
      ca: mint, lookback: "ALL", bars: bars, spot: spot, now: Date.now(), prev: null,
      entryWindow: card && card.ew, confirm: false
    });
  }
  function scanNote(msg) {
    var box = $("fe-board");
    if (box && !last) box.innerHTML = "<div style=\"padding:18px;color:#8b93a7;font-weight:800\">" + esc(msg) + "</div>";
  }
  async function preload() {
    if (scanned) {
      if (ca) load();
      return;
    }
    if (scanning) return;
    scanning = true;
    try {
      scanNote("Loading TAKE setups…");
      var ew = await fetch(API + "/entry-window?tf=1h", { cache: "no-store" }).then(function (r) { return r.json(); });
      cards = ew.cards || [];
      try { await fillMc(); } catch (e) {}
      var found = [];
      var cursor = 0;
      var done = 0;
      async function worker() {
        while (cursor < cards.length) {
          var c = cards[cursor++];
          var id = String((c && c.ca) || "").toLowerCase();
          if (id) {
            try {
              var setup = await setupFor(id, c, false);
              if (takeState(setup) === "TAKE") found.push({ ca: id, name: c.name || id.slice(0, 6), setup: setup });
            } catch (e) {}
          }
          done++;
          scanNote("TAKE scan " + done + " / " + cards.length);
        }
      }
      var jobs = [];
      var n = Math.min(3, Math.max(1, cards.length));
      for (var k = 0; k < n; k++) jobs.push(worker());
      await Promise.all(jobs);
      found.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      takes = found;
      scanned = true;
      if (takes.length) {
        page = 0;
        ca = takes[0].ca;
        prev = null;
        paint(takes[0].setup);
      }
      await load();
    } catch (e) {
      scanned = true;
      await load();
    } finally {
      scanning = false;
    }
  }

  async function load() {
    try {
      var ew = await fetch(API + "/entry-window?tf=1h", { cache: "no-store" }).then(function (r) { return r.json(); });
      cards = ew.cards || [];
      fillMc();
      if (!ca) {
        var saved = "";
        try { saved = localStorage.getItem("fomoentry_ca") || ""; } catch (e) {}
        var jean = cards.find(function (c) { return /jeanphil/i.test(c.name || "") || String(c.ca).toLowerCase().indexOf("gtbxuiw") === 0; });
        ca = saved || (jean && String(jean.ca).toLowerCase()) || (cards[0] && String(cards[0].ca).toLowerCase()) || "";
      }
      if (!ca) throw new Error("No saved coins");
      var bars = await barsOf(ca);
      var card = cards.find(function (c) { return String(c.ca).toLowerCase() === ca; });
      try { keepBest(await dexJson([ca])); } catch (e) {}
      var live = quotes[ca];
      var spot = (live && live.price > 0 && live.price) || (card && card.ew && +card.ew.spot) || (bars["5m"] && bars["5m"].length && +bars["5m"][bars["5m"].length - 1].c) || 0;
      var next = buildFomoEntry({
        ca: ca, lookback: look, bars: bars, spot: spot, now: Date.now(), prev: prev,
        entryWindow: card && card.ew, confirm: false
      });
      prev = next;
      advancePaper(null, next, Date.now());
      var bucket = Math.floor(Date.now() / 300000);
      (next.events || []).forEach(function (ev) { seen[alertKey(ca, next.setupId || "none", ev, bucket)] = 1; });
      var ix = -1;
      for (var ti = 0; ti < takes.length; ti++) if (takes[ti].ca === ca) ix = ti;
      if (ix >= 0) {
        takes[ix].setup = next;
        takes[ix].name = (card && card.name) || takes[ix].name;
      }
      var shown = laneList();
      page = 0;
      for (var pi = 0; pi < shown.length; pi++) if (shown[pi].ca === ca) page = pi;
      paint(next);
      trigToken += 1;
      refineTrigger(next, trigToken);
    } catch (e) {
      var box = $("fe-board");
      if (box) box.innerHTML = "<div style=\"color:#ff5d6c;font-weight:800\">" + esc(e && e.message ? e.message : e) + "</div>";
    }
  }

  function boot() {
    preload();
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      if (!scanning && ca) load();
    }, 45000);
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
