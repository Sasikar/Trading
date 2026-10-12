(function () {
  if (window.__solchainTab) return;
  window.__solchainTab = 1;
  var LIST = "solchain_wallets_v1";
  var OLD = "solchain_addr_v1";
  var SNAP = "solchain_snap_v1";
  var API = "https://trading-ohlcv.sasipudi.workers.dev";
  var SOL = "So11111111111111111111111111111111111111112";
  var wallets = [];
  var selected = "";
  var asking = "";
  var renaming = "";
  var seq = 0;
  var last = null;
  var draft = "";

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
  function short(address) { return String(address || "").slice(0, 4) + "…" + String(address || "").slice(-4); }
  function signed(n) {
    if (!isFinite(n)) return "—";
    return (n > 0 ? "+" : n < 0 ? "-" : "") + money(Math.abs(n)).replace(/^\$/, "$");
  }
  function pct(n) {
    if (!isFinite(n)) return "";
    return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
  }
  async function pnlMap(address) {
    var out = {};
    try {
      var r = await fetch("https://datapi.jup.ag/v1/pnl?addresses=" + address + "&includeClosed=false", { cache: "no-store" });
      if (!r.ok) return out;
      var body = await r.json();
      var bag = (body && body[address]) || {};
      Object.keys(bag).forEach(function (mint) {
        var pnl = bag[mint] && bag[mint].pnl;
        if (!pnl) return;
        out[mint] = { usd: Number(pnl.totalPnl), pct: Number(pnl.totalPnlPercentage) };
      });
    } catch (e) {}
    return out;
  }
  function readList() {
    var rows = [];
    try { rows = JSON.parse(localStorage.getItem(LIST) || "[]") || []; } catch (e) { rows = []; }
    if (!Array.isArray(rows)) rows = [];
    try {
      var old = localStorage.getItem(OLD) || "";
      if (valid(old) && !rows.some(function (row) { return row.address === old; })) rows.push({ address: old, at: Date.now() });
      localStorage.removeItem(OLD);
    } catch (e) {}
    var out = [];
    rows.forEach(function (row) {
      var address = String((row && row.address) || "").trim();
      if (!valid(address) || out.some(function (item) { return item.address === address; })) return;
      out.push({ address: address, name: String((row && row.name) || "").trim().slice(0, 40), at: Number(row && row.at) || Date.now() });
    });
    return out;
  }
  function writeList() {
    try { localStorage.setItem(LIST, JSON.stringify(wallets)); } catch (e) {}
  }
  function snaps() {
    try {
      var raw = JSON.parse(localStorage.getItem(SNAP) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (e) { return {}; }
  }
  function saveSnap(address, total) {
    var all = snaps();
    all[address] = { total: total, at: Date.now() };
    try { localStorage.setItem(SNAP, JSON.stringify(all)); } catch (e) {}
  }
  function persist() {
    fetch(API + "/solchain-wallets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallets: wallets })
    }).catch(function () {});
  }
  function merge(remote) {
    (remote || []).forEach(function (row) {
      var address = String((row && row.address) || "").trim();
      var name = String((row && row.name) || "").trim().slice(0, 40);
      if (!valid(address)) return;
      var hit = wallets.filter(function (item) { return item.address === address; })[0];
      if (!hit) wallets.push({ address: address, name: name, at: Number(row.at) || Date.now() });
      else if (!hit.name && name) hit.name = name;
    });
    writeList();
  }
  function pull() {
    fetch(API + "/solchain-wallets", { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (body) {
        var before = wallets.map(function (row) { return row.address; }).join();
        merge(body && body.wallets);
        if (!selected && wallets.length) selected = wallets[0].address;
        if (wallets.map(function (row) { return row.address; }).join() !== before) persist();
        paint();
        if (selected && (!last || last.address !== selected)) load(selected);
      })
      .catch(function () {});
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
    wallets = readList();
    if (!selected && wallets.length) selected = wallets[0].address;
    paint();
    pull();
    if (selected && !last) load(selected);
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
  function add(address) {
    address = String(address || "").trim();
    if (!valid(address)) {
      last = { address: selected, error: "Paste a Solana wallet address.", rows: last && last.rows, total: last && last.total, at: last && last.at, skipped: last && last.skipped };
      paint();
      return;
    }
    if (!wallets.some(function (row) { return row.address === address; })) {
      wallets.push({ address: address, name: "", at: Date.now() });
      writeList();
      persist();
    }
    draft = "";
    selected = address;
    load(address);
  }
  function rename(address, name) {
    var row = wallets.filter(function (item) { return item.address === address; })[0];
    if (!row) return;
    row.name = String(name || "").trim().slice(0, 40);
    renaming = "";
    writeList();
    persist();
    paint();
  }
  function remove(address) {
    wallets = wallets.filter(function (row) { return row.address !== address; });
    writeList();
    persist();
    asking = "";
    if (selected === address) {
      selected = wallets.length ? wallets[0].address : "";
      last = null;
      if (selected) load(selected);
    }
    paint();
  }
  function timedFetch(url, ms) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    return fetch(url, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined }).finally(function () { clearTimeout(timer); });
  }
  async function fromDatapi(address) {
    var r = await timedFetch("https://datapi.jup.ag/v1/pnl?addresses=" + address + "&includeClosed=false", 25000);
    if (!r.ok) throw new Error("Wallet feed " + r.status + ". Tap Refresh again.");
    var body = await r.json();
    var bag = (body && body[address]) || {};
    var priced = [];
    Object.keys(bag).forEach(function (mint) {
      var row = bag[mint] || {};
      var bal = row.balance || {};
      var value = Number(bal.balanceValue);
      var amount = Number(bal.balance);
      if (!(value > 0)) return;
      var pnl = row.pnl || null;
      priced.push({
        mint: mint,
        symbol: mint === SOL ? "SOL" : "",
        amount: isFinite(amount) ? amount : 0,
        price: Number(row.price && row.price.usdPrice) || 0,
        value: value,
        pnl: pnl && isFinite(Number(pnl.totalPnl)) ? Number(pnl.totalPnl) : null,
        pnlPct: pnl && isFinite(Number(pnl.totalPnlPercentage)) ? Number(pnl.totalPnlPercentage) : null
      });
    });
    return priced;
  }
  async function load(address) {
    address = address || selected;
    if (!valid(address)) return;
    selected = address;
    var id = ++seq;
    last = { loading: true, address: address };
    paint();
    try {
      var priced = await fromDatapi(address);
      if (id !== seq) return;
      if (!priced.length) throw new Error("No priced coins in that wallet. Tap Refresh again.");
      priced.sort(function (a, b) { return b.value - a.value; });
      var total = priced.reduce(function (sum, row) { return sum + row.value; }, 0);
      var sym = await names(priced.slice(0, 30).map(function (row) { return row.mint; }).filter(function (mint) { return mint !== SOL; }));
      if (id !== seq) return;
      priced.forEach(function (row) { if (sym[row.mint]) row.symbol = sym[row.mint]; });
      saveSnap(address, total);
      last = { address: address, total: total, rows: priced, skipped: 0, at: Date.now() };
    } catch (e) {
      if (id !== seq) return;
      var msg = e && e.name === "AbortError" ? "That wallet took too long. Tap Refresh." : String(e && e.message ? e.message : e);
      last = { address: address, error: msg };
    }
    paint();
  }

  function paint() {
    var root = $("sc-board");
    if (!root) return;
    var known = snaps();
    var list = wallets.map(function (row) {
      var on = row.address === selected;
      var snap = known[row.address];
      var worth = snap && isFinite(snap.total) ? money(snap.total) : "—";
      var title = row.name || short(row.address);
      var main = renaming === row.address
        ? '<form data-rename-form="' + esc(row.address) + '" style="flex:1;display:flex;gap:6px;min-width:0">' +
          '<input data-name value="' + esc(row.name) + '" placeholder="Your name" maxlength="40" style="flex:1;min-width:0;padding:8px 10px;border-radius:10px;border:1px solid #2a3142;background:#0c1016;color:#f4f7fb;font-weight:700">' +
          '<button type="submit" style="border:0;border-radius:10px;padding:0 10px;background:#e6c878;color:#1a1406;font-weight:900">Save</button></form>'
        : '<button type="button" data-open="' + esc(row.address) + '" style="flex:1;min-width:0;text-align:left;border:0;background:transparent;color:#f4f7fb;padding:0">' +
          '<div style="font-weight:800">' + esc(title) + '</div>' +
          (row.name ? '<div style="font-size:11px;color:#8b93a7;font-weight:600">' + esc(short(row.address)) + '</div>' : '') +
          '</button><button type="button" data-edit="' + esc(row.address) + '" aria-label="Rename" style="border:0;background:transparent;color:#c5d0dc;font-size:16px;padding:0 4px">✎</button>';
      return '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;border:1px solid ' + (on ? "#3dbe7a" : "#2a3142") + ';background:' + (on ? "#102018" : "#10161d") + '">' +
        main + '<b style="font-size:13px">' + worth + '</b>' +
        '<button type="button" data-ask="' + esc(row.address) + '" aria-label="Delete" style="border:0;background:transparent;color:#ff8a7a;font-weight:900;font-size:18px;padding:0 4px">×</button></div>';
    }).join("");
    var ask = "";
    if (asking) {
      var asked = wallets.filter(function (row) { return row.address === asking; })[0];
      var askedName = asked && asked.name ? asked.name : short(asking);
      ask = '<div style="margin-top:10px;padding:12px;border-radius:12px;background:#2a1518;color:#ffb4ae">Delete ' + esc(askedName) + '?' +
        '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<button type="button" data-yes="' + esc(asking) + '" style="border:0;border-radius:999px;padding:8px 12px;background:#ff5d6c;color:#fff;font-weight:900">Delete</button>' +
        '<button type="button" data-no="1" style="border:0;border-radius:999px;padding:8px 12px;background:#1c2430;color:#f4f7fb;font-weight:900">Keep</button></div></div>';
    }
    var total = last && last.address === selected && isFinite(last.total) ? money(last.total) : "—";
    var note = wallets.length ? "Tap a wallet. Refresh any time." : "Add a wallet. It stays until you delete it.";
    if (last && last.address === selected && last.loading) note = "Reading wallet…";
    else if (last && last.address === selected && last.error) note = last.error;
    else if (last && last.address === selected && last.at) {
      note = "Updated " + new Date(last.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) + (last.skipped ? " · " + last.skipped + " tokens had no price" : "");
    }
    var rows = (last && last.address === selected && last.rows ? last.rows : []).slice(0, 20).map(function (row) {
      var up = row.pnl > 0;
      var down = row.pnl < 0;
      var color = up ? "#3dbe7a" : down ? "#ff8a7a" : "#8b93a7";
      var pnl = isFinite(row.pnl) ? '<div style="color:' + color + ';font-size:12px;font-weight:800;text-align:right">' + signed(row.pnl) + (isFinite(row.pnlPct) ? " · " + pct(row.pnlPct) : "") + '</div>' : '<div style="color:#8b93a7;font-size:12px;text-align:right">—</div>';
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #1c2633">' +
        '<div style="flex:1;min-width:0"><div style="font-weight:800">' + esc(row.symbol || short(row.mint)) + '</div><div style="color:#8b93a7;font-size:12px">' + qty(row.amount) + '</div></div>' +
        '<div><b style="display:block;text-align:right">' + money(row.value) + '</b>' + pnl + '</div></div>';
    }).join("");
    var more = last && last.address === selected && last.rows && last.rows.length > 20 ? '<div style="color:#8b93a7;font-size:12px;padding-top:8px">+' + (last.rows.length - 20) + ' more</div>' : "";
    var link = valid(selected) ? '<a href="https://solscan.io/account/' + esc(selected) + '" target="_blank" rel="noopener" style="color:#7eb6ff;font-size:12px;font-weight:800">Solscan</a>' : "";
    root.innerHTML =
      '<form id="sc-form" style="display:flex;gap:8px">' +
      '<input id="sc-addr" value="' + esc(draft) + '" placeholder="Add Solana wallet" autocomplete="off" spellcheck="false" style="flex:1;min-width:0;padding:12px 14px;border-radius:12px;border:1px solid #2a3142;background:#0c1016;color:#f4f7fb;font-weight:700">' +
      '<button type="submit" style="border:0;border-radius:12px;padding:0 14px;background:#e6c878;color:#1a1406;font-weight:900">Add</button></form>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">' + (list || '<div style="color:#8b93a7;font-size:13px">No wallets yet.</div>') + '</div>' +
      ask +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:16px">' +
      '<div style="font-size:34px;font-weight:900;letter-spacing:-.03em">' + total + '</div>' +
      (selected ? '<button type="button" id="sc-refresh" style="border:0;border-radius:999px;padding:8px 12px;background:#143d2a;color:#3dbe7a;font-weight:900">Refresh</button>' : "") +
      '</div>' +
      '<div style="margin-top:6px;color:#8b93a7;font-size:13px">' + esc(note) + '</div>' +
      (link ? '<div style="margin-top:8px">' + link + '</div>' : "") +
      rows + more;
    var form = $("sc-form");
    var box = $("sc-addr");
    if (box) box.addEventListener("input", function () { draft = box.value; });
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      add(box && box.value);
    });
    var refresh = $("sc-refresh");
    if (refresh) refresh.addEventListener("click", function () { load(selected); });
    root.querySelectorAll("[data-open]").forEach(function (btn) {
      btn.addEventListener("click", function () { load(btn.getAttribute("data-open")); });
    });
    root.querySelectorAll("[data-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () { renaming = btn.getAttribute("data-edit"); paint(); });
    });
    root.querySelectorAll("[data-rename-form]").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var input = form.querySelector("[data-name]");
        rename(form.getAttribute("data-rename-form"), input && input.value);
      });
    });
    var nameBox = root.querySelector("[data-name]");
    if (nameBox) { nameBox.focus(); nameBox.select(); }
    root.querySelectorAll("[data-ask]").forEach(function (btn) {
      btn.addEventListener("click", function () { asking = btn.getAttribute("data-ask"); paint(); });
    });
    root.querySelectorAll("[data-yes]").forEach(function (btn) {
      btn.addEventListener("click", function () { remove(btn.getAttribute("data-yes")); });
    });
    root.querySelectorAll("[data-no]").forEach(function (btn) {
      btn.addEventListener("click", function () { asking = ""; paint(); });
    });
  }

  wallets = readList();
  if (wallets.length) selected = wallets[0].address;
})();
