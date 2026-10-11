(function () {
  if (window.__solchainTab) return;
  window.__solchainTab = 1;
  var KEY = "solchain_addr_v1";
  var SOL = "So11111111111111111111111111111111111111112";
  var seq = 0;
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
  function valid(address) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address || ""); }
  function money(n) {
    if (!isFinite(n)) return "—";
    var v = Math.abs(n);
    var sign = n < 0 ? "-" : "";
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
  function saved() {
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }
  function save(address) {
    try { localStorage.setItem(KEY, address); } catch (e) {}
  }
  function hideOthers() {
    document.querySelectorAll(".trend-panel").forEach(function (p) {
      if (p.id === "solchain-panel") return;
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
    var p = $("solchain-panel");
    if (!p) return;
    if (!on) {
      p.style.display = "none";
      p.classList.remove("on");
      return;
    }
    hideOthers();
    p.style.display = "block";
    p.classList.add("on");
    paint();
    if (saved() && !last) load();
  }
  window.showSolchain = show;

  async function prices(mints) {
    var out = {};
    var i = 0;
    while (i < mints.length) {
      var ids = mints.slice(i, i + 50).join(",");
      i += 50;
      var r = await fetch("https://lite-api.jup.ag/price/v3?ids=" + encodeURIComponent(ids), { cache: "no-store" });
      if (!r.ok) throw new Error("Price feed " + r.status);
      var body = await r.json();
      Object.keys(body || {}).forEach(function (k) {
        var px = body[k] && Number(body[k].usdPrice);
        if (isFinite(px) && px > 0) out[k] = px;
      });
    }
    return out;
  }
  async function names(mints) {
    var out = {};
    if (!mints.length) return out;
    var r = await fetch("https://api.dexscreener.com/tokens/v1/solana/" + mints.slice(0, 30).join(","), { cache: "no-store" });
    if (!r.ok) return out;
    var rows = await r.json();
    (Array.isArray(rows) ? rows : []).forEach(function (pair) {
      var token = pair && pair.baseToken;
      if (token && token.address && token.symbol) out[token.address] = token.symbol;
    });
    return out;
  }
  async function load() {
    var box = $("sc-addr");
    var address = String((box && box.value) || saved() || "").trim();
    if (box) box.value = address;
    if (!valid(address)) {
      last = { error: "Paste a Solana wallet address." };
      paint();
      return;
    }
    save(address);
    var id = ++seq;
    last = { loading: true, address: address };
    paint();
    try {
      var r = await fetch("https://lite-api.jup.ag/ultra/v1/holdings/" + address, { cache: "no-store" });
      if (!r.ok) throw new Error("Wallet feed " + r.status + ". Tap Refresh again.");
      var bag = await r.json();
      if (id !== seq) return;
      var held = [];
      var solAmt = Number(bag && bag.uiAmount) || 0;
      if (solAmt > 0) held.push({ mint: SOL, symbol: "SOL", amount: solAmt });
      var tokens = (bag && bag.tokens) || {};
      Object.keys(tokens).forEach(function (mint) {
        var rows = tokens[mint];
        if (!Array.isArray(rows)) return;
        var amount = 0;
        rows.forEach(function (row) { amount += Number(row && row.uiAmount) || 0; });
        if (amount > 0) held.push({ mint: mint, symbol: "", amount: amount });
      });
      var px = await prices(held.map(function (row) { return row.mint; }));
      if (id !== seq) return;
      var priced = [];
      var skipped = 0;
      held.forEach(function (row) {
        var price = px[row.mint];
        if (!(price > 0)) { skipped++; return; }
        priced.push({ mint: row.mint, symbol: row.symbol, amount: row.amount, price: price, value: row.amount * price });
      });
      priced.sort(function (a, b) { return b.value - a.value; });
      var total = priced.reduce(function (sum, row) { return sum + row.value; }, 0);
      var sym = await names(priced.slice(0, 30).map(function (row) { return row.mint; }).filter(function (mint) { return mint !== SOL; }));
      if (id !== seq) return;
      priced.forEach(function (row) { if (sym[row.mint]) row.symbol = sym[row.mint]; });
      last = { address: address, total: total, rows: priced, skipped: skipped, at: Date.now() };
    } catch (e) {
      if (id !== seq) return;
      last = { address: address, error: String(e && e.message ? e.message : e) };
    }
    paint();
  }

  function paint() {
    var root = $("sc-board");
    if (!root) return;
    var address = saved();
    var total = last && isFinite(last.total) ? money(last.total) : "—";
    var note = "Paste a wallet. Refresh as many times as you want.";
    if (last && last.loading) note = "Reading wallet…";
    else if (last && last.error) note = last.error;
    else if (last && last.at) {
      var when = new Date(last.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
      note = "Updated " + when + (last.skipped ? " · " + last.skipped + " tokens had no price" : "");
    }
    var rows = (last && last.rows ? last.rows : []).slice(0, 20).map(function (row) {
      var label = row.symbol || short(row.mint);
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #1c2633">' +
        '<div style="flex:1;min-width:0;font-weight:800">' + esc(label) + '</div>' +
        '<div style="color:#8b93a7;font-size:12px">' + qty(row.amount) + '</div>' +
        '<b>' + money(row.value) + '</b></div>';
    }).join("");
    var more = last && last.rows && last.rows.length > 20 ? '<div style="color:#8b93a7;font-size:12px;padding-top:8px">+' + (last.rows.length - 20) + ' more</div>' : "";
    var link = address && valid(address) ? '<a href="https://solscan.io/account/' + esc(address) + '" target="_blank" rel="noopener" style="color:#7eb6ff;font-size:12px;font-weight:800">Solscan</a>' : "";
    root.innerHTML =
      '<form id="sc-form" style="display:flex;gap:8px">' +
      '<input id="sc-addr" value="' + esc(address) + '" placeholder="Solana wallet" autocomplete="off" spellcheck="false" style="flex:1;min-width:0;padding:12px 14px;border-radius:12px;border:1px solid #2a3142;background:#0c1016;color:#f4f7fb;font-weight:700">' +
      '<button type="submit" style="border:0;border-radius:12px;padding:0 14px;background:#e6c878;color:#1a1406;font-weight:900">Refresh</button></form>' +
      '<div style="margin-top:18px;font-size:34px;font-weight:900;letter-spacing:-.03em">' + total + '</div>' +
      '<div style="margin-top:6px;color:#8b93a7;font-size:13px">' + esc(note) + '</div>' +
      (link ? '<div style="margin-top:8px">' + link + '</div>' : "") +
      rows + more;
    var form = $("sc-form");
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); load(); });
  }
})();
