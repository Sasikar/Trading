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
  function evmOk(s) { return /^0x[a-fA-F0-9]{40}$/.test(String(s || "")); }
  function mintOk(s) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s || "")); }
  function coinOk(s) { return mintOk(s) || evmOk(s); }
  function normMint(s) { return evmOk(s) ? String(s).toLowerCase() : String(s || "").trim(); }
  function qid(chain, mint) { return (chain || "solana") + ":" + mint; }
  function chainTag(c) {
    if (c.chain === "robinhood") return "HOOD";
    if (c.chain === "ethereum") return "ETH";
    return "SOL";
  }
  function sameMint(a, b) {
    if (evmOk(a) || evmOk(b)) return String(a || "").toLowerCase() === String(b || "").toLowerCase();
    return a === b;
  }
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
  function read() {}
  function write() {}
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
    var shown = state.coins.slice().sort(function (a, b) {
      return String(a.symbol || "").localeCompare(String(b.symbol || ""), undefined, { sensitivity: "base" });
    });
    var rows = shown.map(function (c) {
      var q = quotes[qid(c.chain, c.mint)] || {};
      var price = Number(q.price) || 0;
      var pct = coinPct(c.pct);
      var b = c.anchor > 0 ? band(c.anchor, pct) : { up: 0, down: 0 };
      var mint = String(c.mint || "");
      var short = mint.length > 12 ? mint.slice(0, 4) + "…" + mint.slice(-4) : mint;
      return '<div style="margin-top:6px;padding:7px 8px;border:1px solid #2a3140;border-radius:12px;background:#12161d">' +
        '<div style="display:flex;align-items:center;gap:6px">' +
        '<div style="flex:1;min-width:0"><b style="color:#f4f7fb;font-size:14px">' + esc(c.symbol || "COIN") + '</b> <span style="color:#8b93a7;font-size:10px">' + chainTag(c) + "</span>" +
        '<div style="color:#6f7a8c;font-size:10px">' + esc(short) + "</div></div>" +
        '<div style="text-align:right;color:#f4f7fb;font-weight:800;font-size:13px">' + px(price) + "</div>" +
        '<button type="button" data-drop="' + esc(qid(c.chain, c.mint)) + '" aria-label="Remove" style="border:0;background:#2a1518;color:#ff8a7a;border-radius:8px;width:26px;height:26px;font-weight:900;color-scheme:dark">×</button></div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin-top:6px">' +
        '<label style="display:flex;align-items:center;gap:4px;color:#8b93a7;font-size:11px;white-space:nowrap">Every' +
        '<input data-pct="' + esc(qid(c.chain, c.mint)) + '" type="number" min="1" max="100" step="1" value="' + pct + '" style="width:46px;color-scheme:dark;background:#0e131a;color:#f4f7fb;border:1px solid #3d4a5c;border-radius:8px;padding:3px 4px;font-weight:800">' +
        "%</label>" +
        '<div style="flex:1;padding:4px 6px;border-radius:8px;background:#102018;font-size:11px;color:#3dbe7a;white-space:nowrap">↑ ' + px(b.up) + "</div>" +
        '<div style="flex:1;padding:4px 6px;border-radius:8px;background:#2a1518;font-size:11px;color:#ff8a7a;white-space:nowrap">↓ ' + px(b.down) + "</div></div></div>";
    }).join("");
    root.innerHTML =
      '<form id="meme-add" style="display:flex;gap:8px">' +
      '<input id="meme-ca" placeholder="Paste a Solana, Ethereum, or Robinhood contract." autocomplete="off" style="flex:1;min-width:0;color-scheme:dark;border:1px solid #3d4a5c;background:#0e131a;color:#f4f7fb;border-radius:12px;padding:10px;font-size:14px">' +
      '<button type="submit" style="border:0;border-radius:12px;padding:12px 14px;font-weight:900;background:#e6c878;color:#1a1408">Add</button></form>' +
      '<div style="margin-top:8px;color:#8b93a7;font-size:12px">' + (state.error ? esc(state.error) : "One list, loaded from the server. Normal and incognito show the same coins, A to Z.") + "</div>" +
      '<div style="margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:14px;background:#12161d">' +
      '<div><div style="font-weight:900">Alerts</div><div style="margin-top:2px;color:#8b93a7;font-size:12px">' + (on ? "On · phone can sleep" : "Off") + "</div></div>" +
      '<button type="button" id="meme-toggle" class="al-sw" role="switch" aria-checked="' + (on ? "true" : "false") + '" aria-label="Alerts"><span class="al-knob"></span></button></div>' +
      '<label style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:14px;background:#12161d;border:1px solid #2a3140;color:#f4f7fb">' +
      '<span><b style="display:block;font-size:14px">All coins</b><span style="display:block;margin-top:2px;color:#8b93a7;font-size:11px">Sets every coin. One coin can still be different.</span></span>' +
      '<span style="display:flex;align-items:center;gap:4px;color:#8b93a7;font-size:12px;white-space:nowrap">Every' +
      '<input id="meme-all-pct" type="number" min="1" max="100" step="1" value="' + coinPct(state.pct) + '" style="width:52px;color-scheme:dark;background:#0e131a;color:#f4f7fb;border:1px solid #3d4a5c;border-radius:8px;padding:6px 4px;font-weight:800">' +
      "%</span></label>" +
      (rows || '<div style="margin-top:14px;color:#8b93a7;font-size:13px">No coins yet.</div>');
    var form = $("meme-add");
    if (form) form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var input = $("meme-ca");
      addCoin(input ? input.value : "");
    });
    var allPct = $("meme-all-pct");
    if (allPct) allPct.addEventListener("change", function () {
      state.pct = coinPct(allPct.value);
      state.coins.forEach(function (c) { c.pct = state.pct; });
      write();
      sync(null, true);
    });
    var btn = $("meme-toggle");
    if (btn) btn.addEventListener("click", function () {
      state.on = !(state.on !== false);
      write();
      arm();
      sync();
    });
    root.querySelectorAll("[data-pct]").forEach(function (input) {
      input.addEventListener("change", function () {
        var id = String(input.getAttribute("data-pct") || "");
        var chain = id.slice(0, id.indexOf(":"));
        var mint = id.slice(id.indexOf(":") + 1);
        state.coins.forEach(function (c) {
          if (c.mint === mint && (c.chain || "solana") === chain) c.pct = coinPct(input.value);
        });
        write();
        sync();
      });
    });
    root.querySelectorAll("[data-drop]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = String(b.getAttribute("data-drop") || "");
        var chain = id.slice(0, id.indexOf(":"));
        var mint = id.slice(id.indexOf(":") + 1);
        state.coins = state.coins.filter(function (c) { return !(c.mint === mint && (c.chain || "solana") === chain); });
        write();
        sync([{ mint: mint, chain: chain }]);
      });
    });
  }
  var WATCH = "https://trading-ohlcv.sasipudi.workers.dev/meme-watch";
  var listGen = 0;
  function applyWatch(view) {
    if (!view || !Array.isArray(view.coins)) {
      if (view && view.error) state.error = view.error;
      return;
    }
    if (typeof view.on === "boolean") state.on = view.on;
    if (view.pct) state.pct = coinPct(view.pct);
    state.coins = view.coins.filter(function (row) { return row && coinOk(row.mint); }).slice(0, 40).map(function (row) {
      var chain = row.chain === "robinhood" || row.chain === "ethereum" ? row.chain : "solana";
      var mint = chain === "solana" ? row.mint : String(row.mint).toLowerCase();
      if (row.price > 0) {
        quotes[qid(chain, mint)] = quotes[qid(chain, mint)] || {};
        quotes[qid(chain, mint)].price = row.price;
      }
      return { mint: mint, chain: chain, symbol: row.symbol || "COIN", name: "", anchor: Number(row.anchor) || 0, pct: coinPct(row.pct) };
    });
    state.error = "";
  }
  function loadServer() {
    var gen = ++listGen;
    fetch(WATCH, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (view) {
      if (gen !== listGen) return;
      applyWatch(view);
      arm();
      paint();
      pull();
    }).catch(function () {
      if (gen !== listGen) return;
      state.error = "Server did not load the meme list";
      paint();
    });
  }
  function sync(drop, applyAll) {
    var gen = ++listGen;
    fetch(WATCH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        on: state.on !== false,
        pct: coinPct(state.pct),
        applyAll: !!applyAll,
        drop: drop || [],
        coins: state.coins.map(function (c) {
          return { mint: c.mint, chain: c.chain === "robinhood" || c.chain === "ethereum" ? c.chain : "solana", symbol: c.symbol || "COIN", pct: coinPct(c.pct), anchor: Number(c.anchor) || 0 };
        })
      })
    }).then(function (r) { return r.json(); }).then(function (view) {
      if (gen !== listGen) return;
      applyWatch(view);
      paint();
    }).catch(function () {
      if (gen !== listGen) return;
      state.error = "Server did not take the meme list";
      if (open) paint();
    });
  }
  function bestPair(list, mint) {
    var rows = (list || []).filter(function (p) { return p && p.baseToken && sameMint(p.baseToken.address, mint); });
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
    if (evmOk(raw)) {
      var looked = normMint(raw);
      job = Promise.all(["ethereum", "robinhood"].map(function (chain) {
        return fetch("https://api.dexscreener.com/tokens/v1/" + chain + "/" + encodeURIComponent(looked), { cache: "no-store" })
          .then(function (r) { return r.json(); })
          .then(function (list) { return bestPair(list, looked); })
          .catch(function () { return null; });
      })).then(function (found) {
        var pairs = found.filter(Boolean);
        pairs.sort(function (a, b) { return (Number(b.liquidity && b.liquidity.usd) || 0) - (Number(a.liquidity && a.liquidity.usd) || 0); });
        return pairs[0] || null;
      });
    } else if (mintOk(raw)) {
      job = fetch("https://api.dexscreener.com/tokens/v1/solana/" + encodeURIComponent(raw), { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (list) { return bestPair(list, raw); });
    } else {
      job = fetch("https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(raw), { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          var pairs = ((body && body.pairs) || []).filter(function (p) {
            return p && (p.chainId === "solana" || p.chainId === "ethereum" || p.chainId === "robinhood") && p.baseToken && coinOk(p.baseToken.address);
          });
          pairs.sort(function (a, b) { return (Number(b.liquidity && b.liquidity.usd) || 0) - (Number(a.liquidity && a.liquidity.usd) || 0); });
          return pairs[0] || null;
        });
    }
    job.then(function (pair) {
      if (!pair || !pair.baseToken) {
        state.error = "No Solana, Ethereum, or Robinhood pair for that.";
        return;
      }
      var chain = pair.chainId === "robinhood" ? "robinhood" : pair.chainId === "ethereum" ? "ethereum" : "solana";
      var mint = chain === "solana" ? pair.baseToken.address : String(pair.baseToken.address).toLowerCase();
      var price = Number(pair.priceUsd) || 0;
      quotes[qid(chain, mint)] = { price: price, mc: Number(pair.marketCap) || Number(pair.fdv) || 0 };
      var prev = null;
      state.coins.forEach(function (c) { if (qid(c.chain, c.mint) === qid(chain, mint)) prev = c; });
      var coin = { mint: mint, chain: chain, symbol: pair.baseToken.symbol || "COIN", name: pair.baseToken.name || "", anchor: price, pct: coinPct(prev ? prev.pct : state.pct) };
      state.coins = [coin].concat(state.coins.filter(function (c) { return qid(c.chain, c.mint) !== qid(chain, mint); })).slice(0, 40);
      state.error = "";
      write();
      sync();
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
    if (pulling || !state.coins.length) return;
    pulling = true;
    var groups = { solana: [], ethereum: [], robinhood: [] };
    state.coins.forEach(function (c) {
      var chain = c.chain === "robinhood" || c.chain === "ethereum" ? c.chain : "solana";
      groups[chain].push(c.mint);
    });
    var jobs = [];
    ["solana", "ethereum", "robinhood"].forEach(function (chain) {
      var mints = groups[chain];
      for (var i = 0; i < mints.length; i += 30) {
        jobs.push(fetch("https://api.dexscreener.com/tokens/v1/" + chain + "/" + mints.slice(i, i + 30).join(","), { cache: "no-store" })
          .then(function (r) { return r.json(); })
          .then(function (list) { return Array.isArray(list) ? list : []; })
          .catch(function () { return []; }));
      }
    });
    Promise.all(jobs).then(function (groups) {
        var list = [].concat.apply([], groups);
        state.coins.forEach(function (c) {
          var pair = bestPair(list, c.mint);
          if (!pair) return;
          var price = Number(pair.priceUsd) || 0;
          if (!(price > 0)) return;
          quotes[qid(c.chain, c.mint)] = { price: price, mc: Number(pair.marketCap) || Number(pair.fdv) || 0 };
          if (!(c.anchor > 0)) c.anchor = price;
        });
        write();
        if (open) paint();
      })
      .catch(function () { state.error = "DexScreener did not answer."; if (open) paint(); })
      .then(function () { pulling = false; });
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
    loadServer();
    if (p.scrollIntoView) p.scrollIntoView({ block: "start" });
  }
  window.showMemes = show;
  loadServer();
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
