(function () {
  if (window.__memePoints) return;
  window.__memePoints = 1;
  var KEY = "trading_meme_alerts_v1";
  var state = { on: true, pct: 10, coins: [], imported: false, error: "" };
  var quotes = {};
  var open = false;
  var timer = 0;
  var pulling = false;
  var adding = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      return "&" + "quot;";
    });
  }
  function mintOk(s) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s); }
  function px(n) {
    n = Number(n);
    if (!(n > 0)) return "—";
    if (n >= 1) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (n >= 0.01) return "$" + n.toFixed(4);
    return "$" + n.toPrecision(4);
  }
  function mc(n) {
    n = Number(n);
    if (!(n > 0)) return "";
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + Math.round(n);
  }
  function read() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (!s || typeof s !== "object") return;
      if (typeof s.on === "boolean") state.on = s.on;
      if (s.imported) state.imported = true;
      var fallback = s.pct || 10;
      if (Array.isArray(s.coins)) state.coins = s.coins.filter(function (c) { return c && mintOk(c.mint); }).slice(0, 20).map(function (c) {
        c.pct = coinPct(c.pct || fallback);
        return c;
      });
    } catch (e) {}
  }
  function write() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ on: state.on, imported: state.imported, coins: state.coins }));
    } catch (e) {}
  }
  function hideOthers() {
    document.querySelectorAll(".trend-panel").forEach(function (p) {
      if (p.id === "memes-panel") return;
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
  function coinPct(n) {
    n = Math.round(Number(n));
    if (!isFinite(n) || n < 1) return 10;
    if (n > 100) return 100;
    return n;
  }
  function band(anchor, pct) {
    pct = coinPct(pct);
    return { up: anchor * (1 + pct / 100), down: anchor * (1 - pct / 100) };
  }
  function paint() {
    var root = $("memes-board");
    if (!root) return;
    var on = state.on !== false;
    var rows = state.coins.map(function (c) {
      var q = quotes[c.mint] || {};
      var price = Number(q.price) || 0;
      var pct = coinPct(c.pct);
      var b = c.anchor > 0 ? band(c.anchor, pct) : { up: 0, down: 0 };
      return '<div style="padding:12px 0;border-top:1px solid #243041">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<div style="flex:1;min-width:0"><b>' + esc(c.symbol || "COIN") + "</b>" +
        '<div style="color:#8b93a7;font-size:11px;overflow:hidden;text-overflow:ellipsis">' + esc(c.mint) + "</div></div>" +
        '<div style="text-align:right"><div style="font-weight:900">' + px(price) + "</div>" +
        '<div style="color:#8b93a7;font-size:11px">' + esc(mc(q.mc)) + "</div></div>" +
        '<button type="button" data-drop="' + esc(c.mint) + '" aria-label="Remove" style="border:0;background:#2a1518;color:#ff8a7a;border-radius:10px;padding:8px 10px;font-weight:900">×</button></div>' +
        '<label style="display:flex;align-items:center;gap:8px;margin-top:8px;color:#8b93a7;font-size:12px">Every' +
        '<input data-pct="' + esc(c.mint) + '" type="number" min="1" max="100" step="1" value="' + pct + '" style="width:72px;border:1px solid #2a3140;background:#0e131a;color:#fff;border-radius:10px;padding:8px;font-weight:900">' +
        '% from the last alert</label>' +
        '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<div style="flex:1;padding:8px;border-radius:12px;background:#102018;font-size:12px"><span style="color:#8b93a7">UP </span><b style="color:#3dbe7a">' + px(b.up) + "</b></div>" +
        '<div style="flex:1;padding:8px;border-radius:12px;background:#2a1518;font-size:12px"><span style="color:#8b93a7">DOWN </span><b style="color:#ff8a7a">' + px(b.down) + "</b></div></div></div>";
    }).join("");
    root.innerHTML =
      '<form id="meme-add" style="display:flex;gap:8px">' +
      '<input id="meme-ca" placeholder="Paste contract. New coin goes on top." autocomplete="off" style="flex:1;min-width:0;border:1px solid #2a3140;background:#0e131a;color:#fff;border-radius:12px;padding:12px;font-size:14px">' +
      '<button type="submit" style="border:0;border-radius:12px;padding:12px 14px;font-weight:900;background:#e6c878;color:#1a1408">Add</button></form>' +
      '<div style="margin-top:8px;color:#8b93a7;font-size:12px">' + (state.error ? esc(state.error) : "DexScreener price in this browser. Each coin has its own percent. A cross goes to your Telegram bot.") + "</div>" +
      '<div style="margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:14px;background:#12161d">' +
      '<div><div style="font-weight:900">Alerts</div><div style="margin-top:2px;color:#8b93a7;font-size:12px">' + (on ? "On · every 30s" : "Off") + "</div></div>" +
      '<button type="button" id="meme-toggle" class="al-sw" role="switch" aria-checked="' + (on ? "true" : "false") + '" aria-label="Alerts"><span class="al-knob"></span></button></div>' +
      (rows || '<div style="margin-top:14px;color:#8b93a7;font-size:13px">No coins yet.</div>');
    var form = $("meme-add");
    if (form) form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var input = $("meme-ca");
      addCoin(input ? input.value : "");
    });
    var btn = $("meme-toggle");
    if (btn) btn.addEventListener("click", function () {
      state.on = !(state.on !== false);
      if (state.on) ask();
      write();
      arm();
      paint();
    });
    root.querySelectorAll("[data-pct]").forEach(function (input) {
      input.addEventListener("change", function () {
        var mint = input.getAttribute("data-pct");
        state.coins.forEach(function (c) {
          if (c.mint === mint) c.pct = coinPct(input.value);
        });
        write();
        paint();
      });
    });
    root.querySelectorAll("[data-drop]").forEach(function (b) {
      b.addEventListener("click", function () {
        var mint = b.getAttribute("data-drop");
        state.coins = state.coins.filter(function (c) { return c.mint !== mint; });
        write();
        paint();
      });
    });
  }
  function ask() {
    try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
  }
  function ping(symbol, dir, price, mint, pct) {
    var title = symbol + " " + dir + " " + coinPct(pct) + "%";
    try {
      if (window.Notification && Notification.permission === "granted") new Notification(title, { body: px(price) });
    } catch (e) {}
    fetch("https://trading-ohlcv.sasipudi.workers.dev/price-ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "meme", name: symbol, dir: dir, price: px(price), detail: coinPct(pct) + "%", mint: mint })
    }).then(function (r) { return r.json(); }).then(function (out) {
      if (out && out.ok === false && out.error) {
        state.error = out.error;
        if (open) paint();
      }
    }).catch(function () {});
  }
  function bestPair(list, mint) {
    var rows = (list || []).filter(function (p) { return p && p.baseToken && p.baseToken.address === mint; });
    rows.sort(function (a, b) { return (Number(b.liquidity && b.liquidity.usd) || 0) - (Number(a.liquidity && a.liquidity.usd) || 0); });
    return rows[0] || null;
  }
  function addCoin(raw) {
    raw = String(raw || "").trim();
    if (!raw || adding) return;
    adding = true;
    state.error = "Looking up…";
    paint();
    var job;
    if (mintOk(raw)) {
      job = fetch("https://api.dexscreener.com/tokens/v1/solana/" + encodeURIComponent(raw), { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (list) { return bestPair(list, raw); });
    } else {
      job = fetch("https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(raw), { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          var pairs = ((body && body.pairs) || []).filter(function (p) { return p && p.chainId === "solana" && p.baseToken && mintOk(p.baseToken.address); });
          pairs.sort(function (a, b) { return (Number(b.liquidity && b.liquidity.usd) || 0) - (Number(a.liquidity && a.liquidity.usd) || 0); });
          return pairs[0] || null;
        });
    }
    job.then(function (pair) {
      if (!pair || !pair.baseToken) {
        state.error = "No Solana pair for that.";
        return;
      }
      var mint = pair.baseToken.address;
      var price = Number(pair.priceUsd) || 0;
      quotes[mint] = { price: price, mc: Number(pair.marketCap) || Number(pair.fdv) || 0 };
      var prev = null;
      state.coins.forEach(function (c) { if (c.mint === mint) prev = c; });
      var coin = { mint: mint, symbol: pair.baseToken.symbol || "COIN", name: pair.baseToken.name || "", anchor: price, pct: coinPct(prev && prev.pct) };
      state.coins = [coin].concat(state.coins.filter(function (c) { return c.mint !== mint; })).slice(0, 20);
      state.error = "";
      write();
    }).catch(function () {
      state.error = "DexScreener did not answer.";
    }).then(function () {
      adding = false;
      paint();
      var input = $("meme-ca");
      if (input && !state.error) input.value = "";
    });
  }
  function pull() {
    if (pulling || !state.coins.length || document.visibilityState === "hidden") return;
    if (state.on === false && !open) return;
    pulling = true;
    var lists = [];
    var mints = state.coins.map(function (c) { return c.mint; });
    for (var i = 0; i < mints.length; i += 30) lists.push(mints.slice(i, i + 30));
    Promise.all(lists.map(function (part) {
      return fetch("https://api.dexscreener.com/tokens/v1/solana/" + part.join(","), { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (list) { return Array.isArray(list) ? list : []; })
        .catch(function () { return []; });
    })).then(function (groups) {
        var list = [].concat.apply([], groups);
        state.coins.forEach(function (c) {
          var pair = bestPair(list, c.mint);
          if (!pair) return;
          var price = Number(pair.priceUsd) || 0;
          if (!(price > 0)) return;
          quotes[c.mint] = { price: price, mc: Number(pair.marketCap) || Number(pair.fdv) || 0 };
          if (!(c.anchor > 0)) c.anchor = price;
          var pct = coinPct(c.pct);
          var move = (price - c.anchor) / c.anchor * 100;
          if (state.on !== false && Math.abs(move) >= pct) {
            ping(c.symbol || "COIN", move > 0 ? "up" : "down", price, c.mint, pct);
            c.anchor = price;
          }
        });
        state.error = "";
        write();
        if (open) paint();
      })
      .catch(function () { state.error = "DexScreener did not answer."; if (open) paint(); })
      .then(function () { pulling = false; });
  }
  function loadExisting() {
    if (state.imported) return;
    function take(rows) {
      var tomb = {};
      try { tomb = JSON.parse(localStorage.getItem("ca_recents_tomb_v1") || "{}"); } catch (e) {}
      var have = {};
      state.coins.forEach(function (c) { have[c.mint] = 1; });
      var add = [];
      (rows || []).forEach(function (row) {
        var mint = String((row && (row.ca || row.mint)) || "").trim();
        var chain = String((row && row.chain) || "solana");
        if (chain !== "solana" || !mintOk(mint) || have[mint]) return;
        if (tomb["solana|" + mint.toLowerCase()]) return;
        have[mint] = 1;
        add.push({ mint: mint, symbol: (row.base || row.name || "COIN"), name: row.name || "", anchor: 0, pct: 10 });
      });
      state.imported = true;
      if (add.length) state.coins = state.coins.concat(add).slice(0, 40);
      write();
      if (open) paint();
      pull();
    }
    var local = [];
    try { local = JSON.parse(localStorage.getItem("ca_recents_v1") || "[]"); } catch (e) {}
    if (local.length) { take(local); return; }
    fetch("data/ca-recents.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (body) {
      take((body && body.items) || []);
    }).catch(function () {});
  }
  function arm() {
    if (timer) clearInterval(timer);
    timer = 0;
    if (state.on === false) return;
    timer = setInterval(pull, 30000);
  }
  function show(on) {
    var p = $("memes-panel");
    if (!p) return;
    open = !!on;
    if (!on) {
      p.style.display = "none";
      p.classList.remove("on");
      return;
    }
    document.body.classList.remove("md-on", "wh-on", "cal-on", "sl-on");
    hideOthers();
    p.style.setProperty("display", "block", "important");
    p.classList.add("on");
    paint();
    loadExisting();
    if (state.coins.length) pull();
    if (p.scrollIntoView) p.scrollIntoView({ block: "start" });
  }
  window.showMemes = show;
  read();
  loadExisting();
  arm();
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") pull();
  });
  var tabs = $("tf-tabs");
  if (tabs) tabs.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
    if (!b) return;
    if (b.getAttribute("data-tf") === "memes") show(true);
    else show(false);
  }, true);
})();
