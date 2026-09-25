(function () {
  if (window.__coinstatsTab) return;
  window.__coinstatsTab = 1;

  var PICKS = "cs_coin_picks_v1";
  var NAMES = "cs_coin_names_v1";
  var KEY = "coinstats_wallets_v1";
  var API = "https://trading-ohlcv.sasipudi.workers.dev";
  var wallets = [];
  var selected = "";
  var view = "assets";
  var bag = null;
  var query = "";
  var notes = {};
  var noteBusy = {};
  var chartSeries = {};

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&" + "amp;")
      .replace(/</g, "&" + "lt;")
      .replace(/>/g, "&" + "gt;")
      .replace(/"/g, "&" + "quot;");
  }
  function valid(address) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address || ""); }
  function money(n) {
    if (!isFinite(n)) return "—";
    var sign = n < 0 ? "-" : "";
    var v = Math.abs(n);
    if (v >= 1e6) return sign + "$" + (v / 1e6).toFixed(2) + "M";
    if (v >= 1000) return sign + "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return sign + "$" + (v >= 1 ? v.toFixed(2) : v.toFixed(4));
  }
  function qty(n) {
    if (!isFinite(n)) return "—";
    if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(2);
    return n.toFixed(4);
  }
  function short(address) { return address.slice(0, 4) + "…" + address.slice(-4); }
  function when(at) {
    var d = new Date(at);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function loadPicks() {
    try {
      var raw = JSON.parse(localStorage.getItem(PICKS) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (e) { return {}; }
  }
  function savePicks(picks) {
    try { localStorage.setItem(PICKS, JSON.stringify(picks)); } catch (e) {}
  }
  function loadNames() {
    try {
      var raw = JSON.parse(localStorage.getItem(NAMES) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (e) { return {}; }
  }
  function goodName(symbol, mint) {
    var s = String(symbol || "").trim();
    if (!s || s === "—" || s.indexOf("…") >= 0 || s.indexOf("...") >= 0) return "";
    if (/^[1-9A-HJ-NP-Za-km-z]{20,}$/.test(s)) return "";
    if (mint && (s === short(mint) || s === String(mint).slice(0, 4))) return "";
    return s;
  }
  function rememberName(mint, symbol) {
    var name = goodName(symbol, mint);
    if (!name || loadNames()[mint] === name) return name;
    var names = loadNames();
    names[mint] = name;
    try { localStorage.setItem(NAMES, JSON.stringify(names)); } catch (e) {}
    document.querySelectorAll("[data-cs-title]").forEach(function (el) {
      if (el.getAttribute("data-cs-title") === mint) el.textContent = name;
    });
    return name;
  }
  function coinTitle(mint) {
    var saved = goodName(loadNames()[mint], mint);
    if (saved) return saved;
    var rows = (bag && bag.holdings) || [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || !goodName(row.symbol, mint)) continue;
      if (row.mint === mint || short(row.mint || "") === short(mint)) return row.symbol;
    }
    return short(mint);
  }
  function resolveNames() {
    var seen = {};
    wallets.forEach(function (row) {
      (row.mints || []).forEach(function (mint) {
        if (seen[mint] || goodName(loadNames()[mint], mint)) return;
        seen[mint] = 1;
        var fromBag = coinTitle(mint);
        if (fromBag !== short(mint)) {
          rememberName(mint, fromBag);
          return;
        }
        fetch("https://api.dexscreener.com/tokens/v1/solana/" + encodeURIComponent(mint), { cache: "no-store" })
          .then(function (res) { return res.json(); })
          .then(function (arr) {
            var best = "";
            var bestLiq = -1;
            (Array.isArray(arr) ? arr : []).forEach(function (pair) {
              var symbol = pair && pair.baseToken && pair.baseToken.symbol;
              var liq = pair && pair.liquidity && Number(pair.liquidity.usd) || 0;
              if (!goodName(symbol, mint) || liq < bestLiq) return;
              best = symbol;
              bestLiq = liq;
            });
            if (best) rememberName(mint, best);
          })
          .catch(function () {});
      });
    });
  }
  function trashIcon() {
    return "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" aria-hidden=\"true\"><path d=\"M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13\"/></svg>";
  }
  function chip(row) {
    var on = row.address === selected;
    return "<span style=\"display:inline-flex;align-items:center;gap:2px;padding:4px 4px 4px 12px;border-radius:999px;border:1px solid " + (on ? "#f5a14a" : "#243041") + ";background:" + (on ? "#2a1c0e" : "#121a24") + "\">" +
      "<button type=\"button\" data-wallet=\"" + esc(row.address) + "\" style=\"padding:6px 4px;border:0;background:transparent;color:#e8eef6;font-weight:800;font-size:12px;cursor:pointer\">" + esc(row.label || short(row.address)) + "</button>" +
      "<button type=\"button\" data-remove=\"" + esc(row.address) + "\" aria-label=\"Delete wallet\" style=\"width:28px;height:28px;border:0;border-radius:999px;background:transparent;color:#8491a1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center\">" + trashIcon() + "</button></span>";
  }
  function groupHtml() {
    var by = {};
    var loose = [];
    wallets.forEach(function (row) {
      var mints = row.mints || [];
      if (!mints.length) { loose.push(row); return; }
      mints.forEach(function (mint) {
        if (!by[mint]) by[mint] = [];
        by[mint].push(row);
      });
    });
    var html = "";
    Object.keys(by).forEach(function (mint) {
      html += "<div style=\"margin-top:16px;padding-top:12px;border-top:1px solid #243041\"><div data-cs-title=\"" + esc(mint) + "\" style=\"font-size:18px;font-weight:900;color:#f4f7fb\">" + esc(coinTitle(mint)) + "</div>" +
        "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-top:8px\">" + by[mint].map(chip).join("") + "</div>" +
        "<div data-cs-note=\"" + esc(mint) + "\" style=\"margin-top:8px;font-size:13px;line-height:1.45;color:#c5d0dc\">" + esc(notes[mint] || "Reading who still holds, and who bought or sold…") + "</div>" +
        "<div data-cs-chart=\"" + esc(mint) + "\">" + chartHtml(chartSeries[mint]) + "</div></div>";
    });
    if (loose.length) {
      html += "<div style=\"margin-top:14px\"><div style=\"font-size:12px;color:#8491a1\">Added by hand</div>" +
        "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-top:8px\">" + loose.map(chip).join("") + "</div></div>";
    }
    return html;
  }
  function movedCoin(row, mint, name) {
    return row.mint === mint || row.token === mint || (name && name !== "—" && row.token === name);
  }
  function readGroup(mint, list, name) {
    var capped = list.slice(0, 24);
    var out = [];
    var i = 0;
    function next() {
      if (i >= capped.length) return Promise.resolve();
      var address = capped[i++];
      return fetch(API + "/coinstats?wallet=" + encodeURIComponent(address), { cache: "no-store" })
        .then(function (res) { return res.json(); })
        .then(function (body) {
          var held = ((body && body.holdings) || []).filter(function (row) { return row.mint === mint; })[0];
          if (held && goodName(held.symbol, mint)) rememberName(mint, held.symbol);
          var hist = (body && body.history) || [];
          out.push({
            holds: !!held,
            coin: held ? Number(held.value) || 0 : 0,
            total: Number(body && body.total) || 0,
            bought: hist.some(function (row) { return row.side === "in" && movedCoin(row, mint, name); }),
            sold: hist.some(function (row) { return row.side === "out" && movedCoin(row, mint, name); })
          });
        })
        .catch(function () { out.push({ holds: false, bought: false, sold: false, coin: 0, total: 0 }); })
        .then(next);
    }
    return Promise.all([next(), next(), next()]).then(function () {
      var hold = out.filter(function (row) { return row.holds; }).length;
      var buy = out.filter(function (row) { return row.bought; }).length;
      var sell = out.filter(function (row) { return row.sold; }).length;
      var coin = out.reduce(function (sum, row) { return sum + (row.coin || 0); }, 0);
      var total = out.reduce(function (sum, row) { return sum + (row.total || 0); }, 0);
      var extra = list.length > capped.length ? " Showing the first " + capped.length + " wallets." : "";
      return {
        line: hold + " of " + capped.length + " still holding. Last 7 days: " + buy + " bought, " + sell + " sold." + extra,
        coin: coin,
        total: total
      };
    });
  }
  function localDay() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function chartHtml(series) {
    var pts = (series || []).slice(-7);
    if (!pts.length) return "<div style=\"margin-top:8px;font-size:12px;color:#8491a1\">Total holdings chart starts today. One point a day, kept for 7 days.</div>";
    var last = pts[pts.length - 1];
    var vals = pts.map(function (p) { return Number(p.total) || 0; });
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    if (max === min) max = min + 1;
    var w = 320, h = 96, pad = 12;
    var dots = pts.map(function (p, i) {
      var x = pts.length === 1 ? w / 2 : pad + i * (w - pad * 2) / (pts.length - 1);
      var y = h - pad - ((Number(p.total) || 0) - min) / (max - min) * (h - pad * 2);
      return { x: x, y: y };
    });
    var color = vals[vals.length - 1] >= vals[0] ? "#3dbe7a" : "#ff8a7a";
    var poly = dots.map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" ");
    var circles = dots.map(function (p) { return "<circle cx=\"" + p.x.toFixed(1) + "\" cy=\"" + p.y.toFixed(1) + "\" r=\"3.5\" fill=\"" + color + "\"/>"; }).join("");
    return "<div style=\"margin-top:10px;font-weight:800;color:#f4f7fb\">Together " + money(last.total) + "</div>" +
      "<div style=\"margin-top:2px;font-size:12px;color:#8491a1\">This coin " + money(last.coin) + " · total holdings of these wallets</div>" +
      "<svg viewBox=\"0 0 320 96\" width=\"100%\" height=\"96\" style=\"margin-top:6px;display:block\"><polyline fill=\"none\" stroke=\"" + color + "\" stroke-width=\"2.5\" points=\"" + poly + "\"/>" + circles + "</svg>" +
      "<div style=\"font-size:11px;color:#8491a1\">" + pts.map(function (p) { return String(p.day).slice(5); }).join(" · ") + " · 1 point a day · 7 days</div>";
  }
  function paintChart(mint) {
    document.querySelectorAll("[data-cs-chart]").forEach(function (el) {
      if (el.getAttribute("data-cs-chart") === mint) el.innerHTML = chartHtml(chartSeries[mint]);
    });
  }
  function saveChart(mint, row) {
    fetch(API + "/coinstats-chart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mint: mint, day: localDay(), total: row.total, coin: row.coin })
    }).then(function (res) { return res.json(); }).then(function (body) {
      chartSeries[mint] = (body && body.series) || chartSeries[mint] || [];
      paintChart(mint);
    }).catch(function () {});
  }
  function loadCharts() {
    var seen = {};
    wallets.forEach(function (row) {
      (row.mints || []).forEach(function (mint) {
        if (seen[mint]) return;
        seen[mint] = 1;
        if (chartSeries[mint]) { paintChart(mint); return; }
        fetch(API + "/coinstats-chart?mint=" + encodeURIComponent(mint), { cache: "no-store" })
          .then(function (res) { return res.json(); })
          .then(function (body) {
            chartSeries[mint] = (body && body.series) || [];
            paintChart(mint);
          }).catch(function () {});
      });
    });
  }
  function loadNotes() {
    var seen = {};
    wallets.forEach(function (row) {
      (row.mints || []).forEach(function (mint) {
        if (seen[mint] || noteBusy[mint] || notes[mint]) return;
        seen[mint] = 1;
        noteBusy[mint] = 1;
        var name = coinTitle(mint);
        var list = wallets.filter(function (item) { return (item.mints || []).indexOf(mint) >= 0; }).map(function (item) { return item.address; });
        readGroup(mint, list, name).then(function (row) {
          notes[mint] = row.line;
          noteBusy[mint] = 0;
          document.querySelectorAll("[data-cs-note]").forEach(function (el) {
            if (el.getAttribute("data-cs-note") === mint) el.textContent = row.line;
          });
          saveChart(mint, row);
        }).catch(function () { noteBusy[mint] = 0; });
      });
    });
  }
  function loadLocal() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(raw) ? raw.filter(function (row) { return row && valid(row.address); }) : [];
    } catch (e) { return []; }
  }
  function saveLocal(list) {
    wallets = list;
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  }
  function merge(remote) {
    var by = {};
    loadLocal().concat(remote || []).forEach(function (row) {
      if (!row || !valid(row.address)) return;
      var prev = by[row.address];
      var mints = Array.isArray(row.mints) ? row.mints.filter(valid) : [];
      if (!prev) {
        by[row.address] = { address: row.address, label: row.label || "", at: row.at || Date.now(), manual: !!row.manual, mints: mints };
        return;
      }
      prev.manual = prev.manual || !!row.manual;
      prev.label = prev.label || row.label || "";
      mints.forEach(function (mint) { if (prev.mints.indexOf(mint) < 0) prev.mints.push(mint); });
    });
    var list = Object.keys(by).map(function (k) { return by[k]; });
    list.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    saveLocal(list);
    return list;
  }
  function persist() {
    fetch(API + "/coinstats-wallets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallets: wallets })
    }).catch(function () {});
  }

  function hideOthers() {
    document.querySelectorAll(".trend-panel").forEach(function (p) {
      if (p.id === "coinstats-panel") return;
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
  function show(on) {
    var p = $("coinstats-panel");
    if (!p) return;
    if (on) {
      hideOthers();
      p.style.display = "block";
      p.classList.add("on");
      paint();
      if (selected) loadWallet(selected);
    } else {
      p.style.display = "none";
      p.classList.remove("on");
    }
  }
  window.showCoinstats = show;

  function paint() {
    var box = $("cs-board");
    if (!box) return;
    var groups = groupHtml();
    var total = bag && isFinite(bag.total) ? money(bag.total) : "—";
    var held = "";
    var hist = "";
    if (!selected) {
      held = "<div style=\"font-size:13px;color:#8491a1\">Add a Solana wallet. It stays in this list.</div>";
    } else if (!bag) {
      held = "<div style=\"font-size:13px;color:#8491a1\">Reading holdings…</div>";
    } else if (bag.ok === false) {
      held = "<div style=\"font-size:13px;color:#e07a7a\">" + esc(bag.error || "Could not read that wallet") + "</div>";
    } else if (view === "assets") {
      var rows = bag.holdings || [];
      held = rows.length ? rows.map(function (row) {
        return "<div style=\"display:grid;grid-template-columns:1fr auto;gap:8px;padding:12px 0;border-bottom:1px solid #243041\">" +
          "<div><div style=\"font-weight:900;color:#e8eef6\">" + esc(row.symbol) + " <span style=\"font-weight:600;color:#8491a1\">" + qty(row.amount) + "</span></div>" +
          "<div style=\"margin-top:4px;font-size:13px;color:#c5d0dc\">" + money(row.value) + "</div></div>" +
          "<div style=\"text-align:right;font-weight:800;color:#e8eef6\">" + (row.price ? money(row.price) : "—") + "</div></div>";
      }).join("") : "<div style=\"font-size:13px;color:#8491a1\">No holding above $1.</div>";
    } else {
      var q = query.trim().toLowerCase();
      var list = (bag.history || []).filter(function (row) {
        if (!q) return true;
        return (row.token + " " + row.side + " " + row.type + " " + row.signature + " " + row.source).toLowerCase().indexOf(q) >= 0;
      });
      hist = "<input id=\"cs-search\" value=\"" + esc(query) + "\" placeholder=\"Search the last 7 days\" style=\"width:100%;padding:12px;border-radius:12px;border:1px solid #243041;background:#0b121a;color:#e8eef6;font-size:14px\">";
      hist += list.length ? list.slice(0, 200).map(function (row) {
        var inn = row.side === "in";
        return "<div style=\"display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid #243041\">" +
          "<div><div style=\"font-weight:800;color:#e8eef6\">" + esc(row.token) + " · " + (inn ? "in" : "out") + "</div>" +
          "<div style=\"margin-top:4px;font-size:12px;color:#8491a1\">" + esc(when(row.at)) + " · " + esc(row.type || row.source || "") + "</div></div>" +
          "<div style=\"font-weight:800;color:" + (inn ? "#3dbe7a" : "#ff8a7a") + "\">" + (inn ? "+" : "−") + qty(row.amount) + " " + esc(row.token) + "</div></div>";
      }).join("") : "<div style=\"margin-top:10px;font-size:13px;color:#8491a1\">Nothing in the last 7 days matches.</div>";
      if (bag.truncated) hist += "<div style=\"margin-top:8px;font-size:12px;color:#8491a1\">This wallet moved more than the read covered.</div>";
    }
    box.innerHTML =
      "<form id=\"cs-add\" style=\"display:flex;gap:8px;flex-wrap:wrap\">" +
      "<input id=\"cs-addr\" placeholder=\"Solana wallet address\" style=\"flex:1;min-width:180px;padding:12px;border-radius:12px;border:1px solid #243041;background:#0b121a;color:#e8eef6;font-size:14px\">" +
      "<button type=\"submit\" style=\"padding:12px 16px;border-radius:12px;border:0;background:#f5a14a;color:#1a1006;font-weight:900;cursor:pointer\">Add</button></form>" +
      groups +
      "<div style=\"margin-top:22px;font-size:40px;font-weight:900;letter-spacing:-.04em;color:#f4f7fb\">" + total + "</div>" +
      "<div style=\"margin-top:4px;font-size:12px;color:#8491a1\">Current holdings · Jupiter price · not all-time profit</div>" +
      "<div style=\"display:flex;gap:18px;margin-top:18px;border-bottom:1px solid #243041\">" +
      "<button type=\"button\" data-view=\"assets\" style=\"padding:10px 0;border:0;background:transparent;color:" + (view === "assets" ? "#f5a14a" : "#8491a1") + ";font-weight:900;border-bottom:2px solid " + (view === "assets" ? "#f5a14a" : "transparent") + ";cursor:pointer\">Assets</button>" +
      "<button type=\"button\" data-view=\"history\" style=\"padding:10px 0;border:0;background:transparent;color:" + (view === "history" ? "#f5a14a" : "#8491a1") + ";font-weight:900;border-bottom:2px solid " + (view === "history" ? "#f5a14a" : "transparent") + ";cursor:pointer\">History</button></div>" +
      "<div style=\"margin-top:8px\">" + (view === "history" ? hist : held) + "</div>";
    var form = $("cs-add");
    if (form) form.addEventListener("submit", onAdd);
    box.querySelectorAll("[data-wallet]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selected = btn.getAttribute("data-wallet");
        bag = null;
        paint();
        loadWallet(selected);
      });
    });
    box.querySelectorAll("[data-view]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        view = btn.getAttribute("data-view");
        paint();
      });
    });
    var search = $("cs-search");
    if (search) search.addEventListener("input", function () {
      query = search.value;
      paint();
      var again = $("cs-search");
      if (again) { again.focus(); again.setSelectionRange(query.length, query.length); }
    });
    box.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        removeWallet(btn.getAttribute("data-remove"));
      });
    });
    loadNotes();
    resolveNames();
    loadCharts();
  }

  function onAdd(ev) {
    ev.preventDefault();
    var input = $("cs-addr");
    var address = (input && input.value || "").trim();
    if (!valid(address)) {
      var st = $("cs-status");
      if (st) st.textContent = "BAD ADDRESS";
      return;
    }
    if (!wallets.some(function (row) { return row.address === address; })) {
      wallets.push({ address: address, label: "", at: Date.now(), manual: true, mints: [] });
      saveLocal(wallets);
      persist();
    }
    selected = address;
    bag = null;
    paint();
    loadWallet(address);
  }

  function withLivePrices(body) {
    var rows = (body && body.holdings) || [];
    var ids = rows.map(function (row) {
      return row.mint === "SOL" ? "So11111111111111111111111111111111111111112" : row.mint;
    }).filter(Boolean);
    if (!body || !ids.length) return Promise.resolve(body);
    var q = ids.slice(0, 50).map(encodeURIComponent).join(",");
    return fetch("https://lite-api.jup.ag/price/v3?ids=" + q, { cache: "no-store" })
      .then(function (res) { return res.ok ? res.json() : {}; })
      .then(function (prices) {
        rows.forEach(function (row) {
          var key = row.mint === "SOL" ? "So11111111111111111111111111111111111111112" : row.mint;
          var px = prices && prices[key] && Number(prices[key].usdPrice);
          if (!(px > 0)) return;
          row.price = px;
          row.value = row.amount * px;
        });
        body.total = rows.reduce(function (sum, row) { return sum + (Number(row.value) || 0); }, 0);
        return body;
      })
      .catch(function () { return body; });
  }

  function loadWallet(address) {
    var st = $("cs-status");
    if (st) st.textContent = "READING";
    fetch(API + "/coinstats?wallet=" + encodeURIComponent(address), { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (body) { return withLivePrices(body || { ok: false, error: "Could not read that wallet" }); })
      .then(function (body) {
        if (selected !== address) return;
        bag = body || { ok: false, error: "Could not read that wallet" };
        if (st) st.textContent = body && body.ok === false ? "FAILED" : "LIVE";
        paint();
      })
      .catch(function (err) {
        if (selected !== address) return;
        bag = { ok: false, error: err.message || "Could not read that wallet" };
        if (st) st.textContent = "FAILED";
        paint();
      });
  }

  function removeWallet(address) {
    wallets = wallets.filter(function (item) { return item.address !== address; });
    saveLocal(wallets);
    persist();
    if (selected === address) {
      selected = wallets.length ? wallets[wallets.length - 1].address : "";
      bag = null;
      if (selected) loadWallet(selected);
    }
    paint();
  }

  window.coinstatsSetCoin = function (mint, addresses, on, symbol) {
    if (!valid(mint)) return;
    var list = (addresses || []).filter(valid);
    var picks = loadPicks();
    var names = loadNames();
    if (on) {
      picks[mint] = 1;
      if (symbol) names[mint] = String(symbol).slice(0, 24);
    } else {
      delete picks[mint];
      delete names[mint];
      delete notes[mint];
    }
    savePicks(picks);
    try { localStorage.setItem(NAMES, JSON.stringify(names)); } catch (e) {}
    if (on) {
      list.forEach(function (address) {
        var row = wallets.filter(function (item) { return item.address === address; })[0];
        if (!row) wallets.push({ address: address, label: "", at: Date.now(), manual: false, mints: [mint] });
        else if ((row.mints || []).indexOf(mint) < 0) {
          row.mints = (row.mints || []).concat([mint]);
        }
      });
      if (!selected && list.length) selected = list[0];
    } else {
      wallets.forEach(function (row) {
        row.mints = (row.mints || []).filter(function (item) { return item !== mint; });
      });
      wallets = wallets.filter(function (row) {
        if (list.indexOf(row.address) < 0) return true;
        if (row.manual) return true;
        return (row.mints || []).length > 0;
      });
      if (list.indexOf(selected) >= 0 && !wallets.some(function (row) { return row.address === selected; })) {
        selected = wallets.length ? wallets[0].address : "";
        bag = null;
        if (selected) loadWallet(selected);
      }
    }
    saveLocal(wallets);
    persist();
    if ($("coinstats-panel") && $("coinstats-panel").style.display !== "none") paint();
  };

  function boot() {
    wallets = loadLocal();
    if (wallets.length) selected = wallets[wallets.length - 1].address;
    fetch(API + "/coinstats-wallets", { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (body) {
        var before = wallets.map(function (row) { return row.address; }).join();
        merge(body && body.wallets);
        if (!selected && wallets.length) selected = wallets[wallets.length - 1].address;
        if (wallets.map(function (row) { return row.address; }).join() !== before) persist();
        if ($("coinstats-panel") && $("coinstats-panel").style.display !== "none") {
          paint();
          if (selected && !bag) loadWallet(selected);
        }
      })
      .catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setInterval(function () {
    var panel = $("coinstats-panel");
    if (!panel || panel.style.display === "none") return;
    var day = localDay();
    wallets.forEach(function (row) {
      (row.mints || []).forEach(function (mint) {
        var series = chartSeries[mint] || [];
        var last = series[series.length - 1];
        if (!last || last.day !== day) delete notes[mint];
      });
    });
    loadNotes();
  }, 10 * 60 * 1000);
})();
