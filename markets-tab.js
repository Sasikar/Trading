(function () {
  if (window.__marketStates) return;
  window.__marketStates = 1;
  var KEY = "trading_market_state_v1";
  var picked = "";
  var STATES = [
    {
      id: "fullbear",
      name: "Full bear",
      span: "Straight year or years",
      tone: "#ff6b6b",
      img: "markets/fullbear.jpg",
      see: "BTC keeps making lower highs for a year or more. Every rally is sold. Memes that pump are dead the same day.",
      do: "Stay small or in cash. Only a coin you already know, and only a small dip. Mostly wait.",
      dont: "A green week is not a new bull. Do not size up because you are bored.",
      know: "The weekly chart is still down. A 30% bounce does not repair a year of lower highs."
    },
    {
      id: "monthbear",
      name: "4 month bear",
      span: "Four straight months",
      tone: "#ff8a7a",
      img: "markets/monthbear.jpg",
      see: "A season of pain, not a full winter. BTC bleeds for about a quarter. Memes still launch, then round-trip.",
      do: "Smaller size, faster exits. A bounce can be a trade. It is not a hold.",
      dont: "Do not hold a meme until the bull. Four months is long enough to wipe a bag.",
      know: "About four red months in a row, but the multi-year structure is not broken yet."
    },
    {
      id: "dry",
      name: "Dry",
      span: "No bids",
      tone: "#c4b49a",
      img: "markets/dry.jpg",
      see: "Nothing trades. New launches die. Even good coins sit still. The timeline is quiet, or it is only scams.",
      do: "Stop forcing trades. Watch coins you already hold. Cash is a position.",
      dont: "Do not ape a fresh pump. A dry market is where fake volume looks real.",
      know: "Your usual coins have no buyers. Volume is a fraction of a normal day."
    },
    {
      id: "sideways",
      name: "Sideways",
      span: "A box",
      tone: "#e6c878",
      img: "markets/sideways.jpg",
      see: "Price goes up, then down, and comes back. Stops get hit both ways. There is no trend.",
      do: "Stand aside, or fade only the edge of the box. Take profit inside the range.",
      dont: "Do not chase the middle. Do not use bull size.",
      know: "Breakouts fail and price returns to the same area."
    },
    {
      id: "rally",
      name: "Sudden rally",
      span: "A pump, not a trend",
      tone: "#7dffb3",
      img: "markets/rally.jpg",
      see: "One violent move. Memes wake up for hours or a few days. It did not earn a trend yet.",
      do: "Treat it as a spike. Sell into strength. Use less size than a real bull.",
      dont: "Do not marry the first green candle. Most sudden rallies give it back.",
      know: "It started from nowhere. Volume is a spike, not a staircase, and it has not held for weeks."
    },
    {
      id: "bull",
      name: "Bull",
      span: "The real one",
      tone: "#3dbe7a",
      img: "markets/bull.jpg",
      see: "BTC makes higher highs for weeks. Dips get bought. Memes trend instead of dying the same day.",
      do: "Hold winners longer. Add only on dips. Still cut a rug the same way.",
      dont: "A bull hides the worst scams. A green chart is not a reason to skip the scanners.",
      know: "Dips are shallow and get bought. The move has lasted. It is not one candle."
    }
  ];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      return "&" + "quot;";
    });
  }
  function read() {
    try { picked = localStorage.getItem(KEY) || ""; } catch (e) { picked = ""; }
    if (!STATES.some(function (s) { return s.id === picked; })) picked = "";
  }
  function write() {
    try { localStorage.setItem(KEY, picked); } catch (e) {}
  }
  function hideOthers() {
    document.body.classList.remove("md-on", "wh-on", "cal-on", "sl-on");
    document.querySelectorAll(".trend-panel, .struct-trend-panel").forEach(function (p) {
      if (p.id === "markets-panel") return;
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
    try { window.showBtc && window.showBtc(false); } catch (e) {}
    try { window.showMemes && window.showMemes(false); } catch (e) {}
  }
  function paint() {
    var root = $("markets-board");
    if (!root) return;
    var now = STATES.filter(function (s) { return s.id === picked; })[0];
    root.innerHTML =
      '<div style="margin-bottom:12px;color:#8b93a7;font-size:13px;line-height:1.45">Name the state before you buy. Saved on this phone only.</div>' +
      (now ? '<div style="margin-bottom:12px;padding:12px 14px;border-radius:14px;background:#12161d;border:1px solid ' + now.tone + '"><div style="font-size:11px;font-weight:800;letter-spacing:.12em;color:' + now.tone + '">NOW</div><b>' + esc(now.name) + '</b><div style="color:#8b93a7;font-size:12px;margin-top:4px">' + esc(now.span) + "</div></div>" : "") +
      STATES.map(function (s) {
        var on = s.id === picked;
        return '<article style="margin:0 0 14px;border-radius:18px;overflow:hidden;background:#12161d;border:1px solid ' + (on ? s.tone : "#243041") + '">' +
          '<img src="' + s.img + '" alt="" style="display:block;width:100%;height:168px;object-fit:cover;background:#0b0e13">' +
          '<div style="padding:14px">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><b style="font-size:18px">' + esc(s.name) + '</b><span style="color:' + s.tone + ';font-size:12px;font-weight:800">' + esc(s.span) + "</span></div>" +
          '<p style="margin:10px 0 0;color:#d7dee8;font-size:14px;line-height:1.45">' + esc(s.see) + "</p>" +
          '<p style="margin:8px 0 0;font-size:13px;line-height:1.45"><b style="color:#3dbe7a">Do. </b>' + esc(s.do) + "</p>" +
          '<p style="margin:6px 0 0;font-size:13px;line-height:1.45"><b style="color:#ff8a7a">Don\u2019t. </b>' + esc(s.dont) + "</p>" +
          '<p style="margin:6px 0 0;color:#8b93a7;font-size:12px;line-height:1.45"><b>You know it when. </b>' + esc(s.know) + "</p>" +
          '<button type="button" data-state="' + s.id + '" style="margin-top:12px;border:0;border-radius:999px;padding:8px 12px;font-weight:800;background:' + (on ? s.tone : "#1c2430") + ";color:" + (on ? "#111" : "#e8eef6") + '">' + (on ? "This is now" : "Mark as now") + "</button>" +
          "</div></article>";
      }).join("");
    root.querySelectorAll("[data-state]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-state");
        picked = picked === id ? "" : id;
        write();
        paint();
      });
    });
  }
  function show(on) {
    var p = $("markets-panel");
    if (!p) return;
    if (!on) {
      p.style.display = "none";
      p.classList.remove("on");
      return;
    }
    hideOthers();
    p.style.display = "block";
    p.classList.add("on");
    read();
    paint();
    if (p.scrollIntoView) p.scrollIntoView({ block: "start" });
  }
  window.showMarkets = show;
  var tabs = $("tf-tabs");
  if (tabs) tabs.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
    if (!b || b.getAttribute("data-tf") === "markets") return;
    show(false);
  }, true);
})();
