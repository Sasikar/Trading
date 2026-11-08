/* One BTC Elliott count from live swings. A reading, not a promise. */
(function () {
  var mode = "1d";
  var rows = [];

  function $(id) { return document.getElementById(id); }
  function money(n) {
    n = Number(n);
    if (!isFinite(n)) return "—";
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      return "&" + "quot;";
    });
  }
  function zigzag(candles, pct) {
    var points = [];
    var last = candles[0].c;
    var lastI = 0;
    var dir = 0;
    for (var i = 1; i < candles.length; i++) {
      var hi = candles[i].h;
      var lo = candles[i].l;
      if (!dir) {
        if (hi >= last * (1 + pct)) { dir = 1; last = hi; lastI = i; }
        else if (lo <= last * (1 - pct)) { dir = -1; last = lo; lastI = i; }
        continue;
      }
      if (dir > 0) {
        if (hi >= last) { last = hi; lastI = i; }
        else if (lo <= last * (1 - pct)) {
          points.push({ i: lastI, price: last, kind: "H" });
          dir = -1; last = lo; lastI = i;
        }
      } else if (lo <= last) { last = lo; lastI = i; }
      else if (hi >= last * (1 + pct)) {
        points.push({ i: lastI, price: last, kind: "L" });
        dir = 1; last = hi; lastI = i;
      }
    }
    points.push({ i: lastI, price: last, kind: dir > 0 ? "H" : "L", open: true });
    return points;
  }
  function wavesOf(points, spot) {
    var recent = points.slice(-10);
    var hi = recent[0];
    var lo = recent[0];
    recent.forEach(function (p) {
      if (p.price > hi.price) hi = p;
      if (p.price < lo.price) lo = p;
    });
    var down = hi.i > lo.i && !hi.open && spot < hi.price;
    var anchor = down ? hi : lo;
    var seq = points.filter(function (p) { return p.i >= anchor.i; });
    if (seq.length < 2) seq = points.slice(-2);
    var names = ["1", "2", "3", "4", "5", "A", "B", "C"];
    var leg = Math.max(1, seq.length - 1);
    var idx = (leg - 1) % names.length;
    return { up: !down, seq: seq, name: names[idx], next: names[(idx + 1) % names.length] };
  }
  function target(pack) {
    var seq = pack.seq;
    var origin = seq[0].price;
    var last = seq[seq.length - 1].price;
    var prev = seq.length > 1 ? seq[seq.length - 2].price : origin;
    var wave = pack.name;
    var span = last - origin;
    var price = last;
    if (wave === "1") price = last - span * 0.618;
    else if (wave === "2") price = last + (seq[1].price - origin) * 1.618;
    else if (wave === "3") {
      var w3 = (seq[3] ? seq[3].price : last) - (seq[2] ? seq[2].price : prev);
      price = last - w3 * 0.382;
    } else if (wave === "4") price = last + (seq[1].price - origin);
    else if (wave === "5") price = last - (last - origin) * 0.382;
    else if (wave === "A") price = last + (prev - last) * 0.5;
    else if (wave === "B") {
      var a0 = seq.length > 2 ? seq[seq.length - 3].price : origin;
      price = last + (prev - a0);
    } else price = last + (prev - last) * 0.382;
    return { next: pack.next, price: price };
  }
  function invalidOf(pack) {
    var seq = pack.seq;
    if (pack.name === "2" || pack.name === "1") return seq[0].price;
    if (pack.name === "4" && seq.length > 2) return seq[1].price;
    if (pack.name === "3" && seq.length > 2) return seq[2].price;
    return seq.length > 1 ? seq[seq.length - 2].price : seq[0].price;
  }
  function chart(candles, pack, tgt) {
    var view = candles.slice(-90);
    var min = Infinity;
    var max = -Infinity;
    view.forEach(function (c) { if (c.l < min) min = c.l; if (c.h > max) max = c.h; });
    if (tgt) { min = Math.min(min, tgt); max = Math.max(max, tgt); }
    var pad = (max - min) * 0.08 || 1;
    min -= pad; max += pad;
    var w = 640;
    var h = 220;
    var l = 8;
    var r = 8;
    var t = 16;
    var b = 16;
    function x(i) { return l + (view.length < 2 ? 0 : i * (w - l - r) / (view.length - 1)); }
    function y(p) { return t + (max - p) * (h - t - b) / (max - min); }
    var line = view.map(function (c, i) { return x(i).toFixed(1) + "," + y(c.c).toFixed(1); }).join(" ");
    var base = candles.length - view.length;
    var marks = pack.seq.filter(function (p) { return p.i >= base; }).map(function (p) {
      var i = p.i - base;
      return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.price).toFixed(1) + '" r="3.5" fill="' + (p.open ? "#e6c878" : "#7aa2ff") + '"/>';
    }).join("");
    var goal = "";
    if (tgt) {
      var gy = y(tgt);
      goal = '<line x1="' + l + '" y1="' + gy.toFixed(1) + '" x2="' + (w - r) + '" y2="' + gy.toFixed(1) + '" stroke="#3dbe7a" stroke-dasharray="4 4"/>' +
        '<text x="' + (w - r) + '" y="' + Math.max(12, gy - 4).toFixed(1) + '" fill="#3dbe7a" font-size="12" text-anchor="end">' + money(tgt) + "</text>";
    }
    return '<svg viewBox="0 0 ' + w + " " + h + '" style="width:100%;height:auto;background:#0e131a;border:1px solid #2a3140;border-radius:16px">' +
      '<polyline fill="none" stroke="#d7dee8" stroke-width="2" points="' + line + '"/>' + marks + goal + "</svg>";
  }
  function row(label, value, color) {
    return '<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid #243041"><span style="color:#8b93a7">' + label + '</span><b style="color:' + (color || "#f4f7fb") + '">' + value + "</b></div>";
  }
  function paint() {
    var root = $("ew-board");
    if (!root || !rows.length) return;
    var pct = mode === "4h" ? 0.035 : 0.08;
    var points = zigzag(rows, pct);
    var spot = rows[rows.length - 1].c;
    var pack = wavesOf(points, spot);
    var goal = target(pack);
    var bad = invalidOf(pack);
    var names = ["1", "2", "3", "4", "5", "A", "B", "C"];
    var strip = names.map(function (n) {
      var on = n === pack.name;
      return '<span style="flex:1;text-align:center;padding:8px 0;border-radius:10px;font-weight:900;background:' + (on ? "#e6c878" : "#121820") + ';color:' + (on ? "#1a1406" : "#9aa6b6") + '">' + n + "</span>";
    }).join("");
    root.innerHTML =
      '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      '<button type="button" data-mode="1d" style="border:0;border-radius:999px;padding:8px 14px;font-weight:800;background:' + (mode === "1d" ? "#e6c878" : "#17202b") + ';color:' + (mode === "1d" ? "#1a1406" : "#c5d0dc") + '">Daily</button>' +
      '<button type="button" data-mode="4h" style="border:0;border-radius:999px;padding:8px 14px;font-weight:800;background:' + (mode === "4h" ? "#e6c878" : "#17202b") + ';color:' + (mode === "4h" ? "#1a1406" : "#c5d0dc") + '">4H</button></div>' +
      '<div style="font-size:13px;color:#8b93a7;font-weight:800">NOW</div>' +
      '<div style="font-size:40px;font-weight:900;line-height:1.1;color:#e6c878">Wave ' + esc(pack.name) + "</div>" +
      '<div style="margin-top:4px;color:#c5d0dc">' + (pack.up ? "Up count" : "Down count") + " · BTC " + money(spot) + "</div>" +
      '<div style="display:flex;gap:4px;margin:12px 0">' + strip + "</div>" +
      chart(rows, pack, goal.price) +
      row("Next wave", "Wave " + goal.next, "#3dbe7a") +
      row("Next target", money(goal.price), "#3dbe7a") +
      row("Count fails past", money(bad), "#ff8a7a") +
      '<div style="margin-top:8px;color:#8b93a7;font-size:12px;line-height:1.45">One reading of the bigger BTC swings. The next target is the usual Fibonacci level for that wave. The count fails if price goes through the level below. Not a promise.</div>';
    root.querySelectorAll("[data-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        mode = btn.getAttribute("data-mode");
        load();
      });
    });
    var st = $("ew-status");
    if (st) st.textContent = mode === "4h" ? "4H" : "DAILY";
  }
  function load() {
    var st = $("ew-status");
    if (st) st.textContent = "LOADING";
    var url = "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=" + mode + "&limit=240";
    fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("binance");
      return r.json();
    }).then(function (data) {
      if (!data || !data.length || !data[0] || data[0].length < 5) throw new Error("empty");
      rows = data.map(function (k) { return { t: +k[0], h: +k[2], l: +k[3], c: +k[4] }; });
      paint();
    }).catch(function () {
      var iv = mode === "4h" ? 240 : 1440;
      fetch("https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=" + iv, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
        var raw = j && j.result && (j.result.XXBTZUSD || j.result.XBTUSD) || [];
        if (!raw.length) throw new Error("empty");
        rows = raw.map(function (k) { return { t: k[0] * 1000, h: +k[2], l: +k[3], c: +k[4] }; });
        paint();
      }).catch(function () {
        var root = $("ew-board");
        if (root) root.innerHTML = '<div style="color:#ff8a7a;font-weight:800">Price feed did not load.</div>';
        if (st) st.textContent = "OFF";
      });
    });
  }
  function show(on) {
    var p = $("elliott-panel");
    if (!p) return;
    if (!on) { p.style.display = "none"; p.classList.remove("on"); return; }
    document.querySelectorAll(".trend-panel, .struct-trend-panel").forEach(function (el) {
      if (el.id === "elliott-panel") return;
      el.style.display = "none";
      el.classList.remove("on");
    });
    ["tf-panels", "memegate-panel", "coin-panel", "antifomo-panel", "signal-panel"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.style.display = "none";
      el.classList.add("hidden");
    });
    p.style.display = "block";
    p.classList.add("on");
    load();
    if (p.scrollIntoView) p.scrollIntoView({ block: "start" });
  }
  window.showElliott = show;
  var tabs = $("tf-tabs");
  if (tabs) tabs.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
    if (!b || b.getAttribute("data-tf") === "elliott") return;
    show(false);
  }, true);
})();
