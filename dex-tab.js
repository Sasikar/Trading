(function () {
  if (window.__dexVolume) return;
  window.__dexVolume = 1;
  var data = null;
  var loading = false;
  var viewDays = 90;
  var viewOffset = null;
  var hzLines = [];
  var hzSel = null;
  var hzSeq = 1;
  try {
    hzLines = JSON.parse(localStorage.getItem("trading_dex_hz_v1") || "[]") || [];
  } catch (e) { hzLines = []; }
  if (!Array.isArray(hzLines)) hzLines = [];
  hzLines.forEach(function (ln) { if (ln.id >= hzSeq) hzSeq = ln.id + 1; });
  function saveLines() {
    try { localStorage.setItem("trading_dex_hz_v1", JSON.stringify(hzLines)); } catch (e) {}
  }

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
    var rows = (data.protocols || []).map(function (row, i) {
      var c = Number(row.change1d);
      return '<div style="display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-top:1px solid #243041"><div><b>' + (i + 1) + ". " + esc(row.name) + '</b><div style="color:#8b93a7;font-size:12px;margin-top:2px">' + esc(row.chain || "") + '</div></div><div style="text-align:right"><b>' + money(row.volume24h) + '</b><div style="font-size:12px;font-weight:800;color:' + (c < 0 ? "#ff8a7a" : "#7dffb3") + '">' + pct(c) + "</div></div></div>";
    }).join("");
    root.innerHTML =
      '<div style="color:#8b93a7;font-size:12px">DEX volume, 24h · ' + esc(when) + ' · DefiLlama</div>' +
      '<div style="margin-top:6px;font-size:34px;font-weight:900;letter-spacing:-.03em">' + money(data.total24h) + "</div>" +
      '<div style="display:flex;justify-content:space-between;gap:12px;margin-top:12px;color:#c5d0dc;font-size:14px"><span>30d</span><b style="color:#fff">' + money(data.total30d) + "</b></div>" +
      '<div style="display:flex;justify-content:space-between;gap:12px;margin-top:6px;color:#c5d0dc;font-size:14px"><span>Weekly change</span><b style="color:' + chgColor + '">' + pct(data.change7d) + "</b></div>" +
      '<div style="margin-top:8px;color:#c5d0dc;font-size:13px">Drag New line onto the chart. Drag a line up or down. Two fingers still shrink the chart.</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
      '<button type="button" id="dex-new-line" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#e6c878;color:#1a1406;touch-action:none">New line</button>' +
      '<button type="button" id="dex-del-line" style="border:0;border-radius:999px;padding:10px 14px;font-weight:800;background:#3a1c1c;color:#ff8a7a">Delete</button></div>' +
      '<canvas id="dex-canvas" style="display:block;width:100%;height:250px;margin-top:12px;border-radius:14px;background:#0b1016;border:1px solid #243041;touch-action:none"></canvas>' +
      '<div style="margin-top:16px;font-weight:800">Top DEXes, 24h</div>' + rows;
    draw();
  }
  var pickedTs = null;
  function draw() {
    var canvas = $("dex-canvas");
    if (!canvas || !data) return;
    var rows = data.chart || [];
    var height = 250;
    var width = canvas.clientWidth || 320;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var daysShown = viewDays;
    var offset = viewOffset == null ? rows.length - daysShown : viewOffset;
    var scaleMax = 1;
    var ghost = null;
    function yToValue(y) {
      var t = (228 - y) / 188;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      return t * scaleMax;
    }
    function valueToY(v) {
      var t = scaleMax ? v / scaleMax : 0;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      return 228 - t * 188;
    }
    function lineAt(y) {
      var best = null;
      var bestD = 22;
      hzLines.forEach(function (ln) {
        var d = Math.abs(valueToY(ln.value) - y);
        if (d <= bestD) { best = ln; bestD = d; }
      });
      return best;
    }
    function canvasY(ev) {
      return ev.clientY - canvas.getBoundingClientRect().top;
    }
    function clamp() {
      daysShown = Math.max(21, Math.min(rows.length || 21, daysShown));
      var maxStart = Math.max(0, rows.length - daysShown);
      if (offset < 0) offset = 0;
      if (offset > maxStart) offset = maxStart;
      viewDays = daysShown;
      viewOffset = offset;
    }
    function frame() {
      clamp();
      var n = Math.max(1, Math.round(daysShown));
      var start = Math.round(offset);
      var max = 0;
      var step = Math.max(1, Math.floor(n / width));
      for (var i = 0; i < n; i += step) {
        var row = rows[start + i];
        if (row && row[1] > max) max = row[1];
      }
      if (!max) max = 1;
      scaleMax = max;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#0b1016";
      ctx.fillRect(0, 0, width, height);
      var bar = width / n;
      var picked = null;
      var pickedX = 0;
      var pickedTop = 0;
      if (bar >= 2) {
        for (var j = 0; j < n; j++) {
          var item = rows[start + j];
          if (!item) continue;
          var h = Math.max(2, (item[1] / max) * 188);
          var on = item[0] === pickedTs;
          ctx.fillStyle = on ? "#e6c878" : "#3d8bfd";
          ctx.fillRect(j * bar, 228 - h, Math.max(1, bar - 1), h);
          if (on) { picked = item; pickedX = j * bar + bar / 2; pickedTop = 228 - h; }
        }
      } else {
        var cols = Math.max(1, Math.floor(width));
        for (var x = 0; x < cols; x++) {
          var from = Math.floor(x / cols * n);
          var to = Math.floor((x + 1) / cols * n);
          var peak = 0;
          var peakRow = null;
          for (var k = from; k < to; k++) {
            var cell = rows[start + k];
            if (cell && cell[1] >= peak) { peak = cell[1]; peakRow = cell; }
          }
          var bh = Math.max(2, (peak / max) * 188);
          ctx.fillStyle = peakRow && peakRow[0] === pickedTs ? "#e6c878" : "#3d8bfd";
          ctx.fillRect(x, 228 - bh, 1, bh);
          if (peakRow && peakRow[0] === pickedTs) { picked = peakRow; pickedX = x; pickedTop = 228 - bh; }
        }
      }
      var first = rows[start];
      var last = rows[Math.min(rows.length - 1, start + n - 1)];
      if (first && last) {
        ctx.font = "700 12px sans-serif";
        ctx.fillStyle = "#c5d0dc";
        ctx.fillText(dayLabel(first[0]) + "  –  " + dayLabel(last[0]), 8, 18);
      }
      function strokeLevel(y, label, on) {
        ctx.strokeStyle = on ? "#e6c878" : "rgba(244,247,251,.85)";
        ctx.lineWidth = on ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.font = "700 13px sans-serif";
        var lw = ctx.measureText(label).width + 14;
        ctx.fillStyle = on ? "#e6c878" : "#1c2430";
        ctx.fillRect(8, Math.max(22, y - 18), lw, 18);
        ctx.fillStyle = on ? "#1a1406" : "#fff";
        ctx.fillText(label, 14, Math.max(22, y - 18) + 13);
      }
      hzLines.forEach(function (ln) { strokeLevel(valueToY(ln.value), money(ln.value), ln.id === hzSel); });
      if (ghost != null) strokeLevel(ghost, money(yToValue(ghost)), true);
      if (!picked) return;
      var line1 = dayLabel(picked[0]);
      var line2 = money(picked[1]);
      ctx.font = "700 13px sans-serif";
      var tw = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width) + 22;
      var th = 46;
      var tx = Math.max(6, Math.min(width - tw - 6, pickedX - tw / 2));
      var ty = Math.max(24, pickedTop - th - 8);
      ctx.fillStyle = "#1c2430";
      ctx.strokeStyle = "#3d4f66";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tx, ty, tw, th, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f4f7fb";
      ctx.fillText(line1, tx + 10, ty + 18);
      ctx.fillStyle = "#3d8bfd";
      ctx.beginPath();
      ctx.arc(tx + 14, ty + 33, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e6c878";
      ctx.fillText(line2, tx + 24, ty + 38);
    }
    function pick(ev) {
      var rect = canvas.getBoundingClientRect();
      var x = ev.clientX - rect.left;
      var n = Math.max(1, Math.round(daysShown));
      var i = Math.round(offset) + Math.min(n - 1, Math.max(0, Math.floor(x / width * n)));
      if (!rows[i]) return;
      pickedTs = rows[i][0];
      frame();
    }
    var pts = {};
    var pinch = null;
    var drag = null;
    var lineDrag = null;
    canvas.addEventListener("touchmove", function (ev) {
      if (ev.touches.length >= 2) ev.preventDefault();
    }, { passive: false });
    canvas.onpointerdown = function (ev) {
      pts[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      var ids = Object.keys(pts);
      if (ids.length >= 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, days: daysShown, center: offset + daysShown / 2 };
        drag = null;
        lineDrag = null;
      } else {
        var hit = lineAt(canvasY(ev));
        if (hit) {
          hzSel = hit.id;
          lineDrag = { id: hit.id, pointerId: ev.pointerId, moved: false };
          drag = null;
          frame();
        } else {
          drag = { x: ev.clientX, offset: offset, id: ev.pointerId, moved: false };
        }
      }
    };
    canvas.onpointermove = function (ev) {
      if (!pts[ev.pointerId]) return;
      pts[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      var ids = Object.keys(pts);
      if (ids.length >= 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        var dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        if (!pinch) pinch = { dist: dist, days: daysShown, center: offset + daysShown / 2 };
        var center = pinch.center;
        daysShown = pinch.days * (pinch.dist / dist);
        offset = center - daysShown / 2;
        frame();
        return;
      }
      if (lineDrag && String(ev.pointerId) === String(lineDrag.pointerId)) {
        lineDrag.moved = true;
        hzLines.forEach(function (ln) {
          if (ln.id === lineDrag.id) ln.value = yToValue(canvasY(ev));
        });
        frame();
        return;
      }
      if (!drag || String(ev.pointerId) !== String(drag.id)) return;
      var dx = ev.clientX - drag.x;
      if (Math.abs(dx) > 6) drag.moved = true;
      offset = drag.offset - dx / width * daysShown;
      frame();
    };
    canvas.onpointerup = canvas.onpointercancel = function (ev) {
      var movedLine = lineDrag && String(ev.pointerId) === String(lineDrag.pointerId);
      var moved = drag && String(ev.pointerId) === String(drag.id) && drag.moved;
      var wasPinch = !!pinch;
      delete pts[ev.pointerId];
      if (Object.keys(pts).length < 2) pinch = null;
      if (movedLine) { saveLines(); lineDrag = null; frame(); return; }
      if (drag && String(ev.pointerId) === String(drag.id)) drag = null;
      if (!moved && !wasPinch && Object.keys(pts).length === 0) pick(ev);
    };
    var add = $("dex-new-line");
    var del = $("dex-del-line");
    if (add) {
      var placing = null;
      add.onpointerdown = function (ev) {
        ev.preventDefault();
        placing = { id: ev.pointerId };
        ghost = null;
        try { add.setPointerCapture(ev.pointerId); } catch (e) {}
      };
      add.onpointermove = function (ev) {
        if (!placing || ev.pointerId !== placing.id) return;
        var y = canvasY(ev);
        ghost = y >= 24 && y <= 236 ? y : null;
        frame();
      };
      add.onpointerup = add.onpointercancel = function (ev) {
        if (!placing || ev.pointerId !== placing.id) return;
        var y = ghost != null ? ghost : 228 - 94;
        var ln = { id: hzSeq++, value: yToValue(y) };
        hzLines.push(ln);
        hzSel = ln.id;
        saveLines();
        placing = null;
        ghost = null;
        frame();
      };
    }
    if (del) del.onclick = function () {
      if (!hzLines.length) return;
      if (hzSel == null) hzLines.pop();
      else hzLines = hzLines.filter(function (ln) { return ln.id !== hzSel; });
      hzSel = hzLines.length ? hzLines[hzLines.length - 1].id : null;
      saveLines();
      frame();
    };
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
