(function () {
  if (window.__dexVolume) return;
  window.__dexVolume = 1;
  var data = null;
  var range = "90D";
  var loading = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      return "&" + "quot;";
    });
  }
  function money(n) {
    var v = Number(n);
    if (!isFinite(v)) return "—";
    var a = Math.abs(v);
    var sign = v < 0 ? "-" : "";
    if (a >= 1e12) return sign + "$" + (a / 1e12).toFixed(2) + "t";
    if (a >= 1e9) return sign + "$" + (a / 1e9).toFixed(2) + "b";
    if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(1) + "m";
    return sign + "$" + Math.round(a).toLocaleString();
  }
  function pct(n) {
    var v = Number(n);
    if (!isFinite(v)) return "—";
    return (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  }
  function dayLabel(ts) {
    var d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function slice() {
    var chart = (data && data.chart) || [];
    if (range === "All") return chart;
    var days = range === "30D" ? 30 : range === "1Y" ? 365 : 90;
    var cut = Math.floor(Date.now() / 1000) - days * 86400;
    var out = chart.filter(function (row) { return row[0] >= cut; });
    return out.length ? out : chart.slice(-days);
  }
  function hideOthers() {
    document.body.classList.remove("md-on", "wh-on", "cal-on", "sl-on");
    document.querySelectorAll(".trend-panel, .struct-trend-panel").forEach(function (p) {
      if (p.id === "dex-panel") return;
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
    try { window.showMarkets && window.showMarkets(false); } catch (e) {}
    try { window.showExperience && window.showExperience(false); } catch (e) {}
  }
  function paint() {
    var root = $("dex-board");
    if (!root) return;
    if (!data) {
      root.innerHTML = '<div style="color:#c5d0dc;padding:12px">' + (loading ? "Loading DEX volume…" : "No DEX volume yet.") + "</div>";
      return;
    }
    var chg = Number(data.change7d);
    var chgColor = chg < 0 ? "#ff8a7a" : "#7dffb3";
    var when = data.updated ? new Date(data.updated).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
    var ranges = ["30D", "90D", "1Y", "All"].map(function (id) {
      var on = id === range;
      return '<button type="button" data-range="' + id + '" style="border:0;border-radius:999px;padding:8px 12px;font-weight:800;background:' + (on ? "#e6c878" : "#243140") + ';color:' + (on ? "#1a1406" : "#f4f7fb") + '">' + id + "</button>";
    }).join("");
    var rows = (data.protocols || []).map(function (row, i) {
      var c = Number(row.change1d);
      return '<div style="display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-top:1px solid #243041"><div><b>' + (i + 1) + ". " + esc(row.name) + '</b><div style="color:#8b93a7;font-size:12px;margin-top:2px">' + esc(row.chain || "") + '</div></div><div style="text-align:right"><b>' + money(row.volume24h) + '</b><div style="font-size:12px;font-weight:800;color:' + (c < 0 ? "#ff8a7a" : "#7dffb3") + '">' + pct(c) + "</div></div></div>";
    }).join("");
    root.innerHTML =
      '<div style="color:#8b93a7;font-size:12px">DEX volume, 24h · ' + esc(when) + ' · DefiLlama</div>' +
      '<div style="margin-top:6px;font-size:34px;font-weight:900;letter-spacing:-.03em">' + money(data.total24h) + "</div>" +
      '<div style="display:flex;justify-content:space-between;gap:12px;margin-top:12px;color:#c5d0dc;font-size:14px"><span>30d</span><b style="color:#fff">' + money(data.total30d) + "</b></div>" +
      '<div style="display:flex;justify-content:space-between;gap:12px;margin-top:6px;color:#c5d0dc;font-size:14px"><span>Weekly change</span><b style="color:' + chgColor + '">' + pct(data.change7d) + "</b></div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' + ranges + "</div>" +
      '<div style="margin-top:8px;color:#8b93a7;font-size:12px">Swipe the chart sideways. The page still scrolls up and down.</div>' +
      '<div id="dex-read" style="margin-top:8px;font-weight:800;color:#e6c878"> </div>' +
      '<div id="dex-scroll" style="margin-top:8px;overflow-x:auto;overflow-y:hidden;touch-action:pan-x pan-y;border-radius:14px;background:#0b1016;border:1px solid #243041">' +
      '<div id="dex-spacer" style="position:relative;height:230px"><canvas id="dex-canvas" style="position:sticky;left:0;top:0;height:230px"></canvas></div></div>' +
      '<div style="margin-top:16px;font-weight:800">Top DEXes, 24h</div>' + rows;
    root.querySelectorAll("[data-range]").forEach(function (btn) {
      btn.onclick = function () {
        range = btn.getAttribute("data-range");
        paint();
      };
    });
    draw();
  }
  function draw() {
    var scroller = $("dex-scroll");
    var spacer = $("dex-spacer");
    var canvas = $("dex-canvas");
    var read = $("dex-read");
    if (!scroller || !canvas || !data) return;
    var rows = slice();
    var bar = 8;
    var width = scroller.clientWidth || 320;
    spacer.style.width = Math.max(width, rows.length * bar) + "px";
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(230 * dpr);
    canvas.style.width = width + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    function frame() {
      var start = Math.max(0, Math.floor(scroller.scrollLeft / bar));
      var count = Math.ceil(width / bar) + 1;
      var view = rows.slice(start, start + count);
      var max = 0;
      view.forEach(function (row) { if (row[1] > max) max = row[1]; });
      if (!max) max = 1;
      ctx.clearRect(0, 0, width, 230);
      view.forEach(function (row, i) {
        var h = Math.max(2, (row[1] / max) * 188);
        ctx.fillStyle = "#3d8bfd";
        ctx.fillRect(i * bar, 210 - h, Math.max(1, bar - 2), h);
      });
      var mid = view[Math.min(view.length - 1, Math.floor(count / 2))];
      if (read && mid) read.textContent = dayLabel(mid[0]) + " · " + money(mid[1]);
    }
    scroller.onscroll = frame;
    scroller.scrollLeft = spacer.scrollWidth;
    frame();
  }
  function load() {
    if (data || loading) { paint(); return; }
    loading = true;
    paint();
    fetch("dex-volume.json?v=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) { data = j; loading = false; paint(); })
      .catch(function () { loading = false; paint(); });
  }
  function show(on) {
    var p = $("dex-panel");
    if (!p) return;
    if (!on) {
      p.style.display = "none";
      p.classList.remove("on");
      return;
    }
    hideOthers();
    p.style.display = "block";
    p.classList.add("on");
    load();
    if (p.scrollIntoView) p.scrollIntoView({ block: "start" });
  }
  window.showDex = show;
  var tabs = $("tf-tabs");
  if (tabs) tabs.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
    if (!b || b.getAttribute("data-tf") === "dex") return;
    show(false);
  }, true);
})();
