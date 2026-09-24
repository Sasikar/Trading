(function () {
  if (window.__tiersTab) return;
  window.__tiersTab = 1;

  var BANDS = [
    { id: "whale", label: "Whale", min: 1000000, band: "≥ $1M" },
    { id: "shark", label: "Shark", min: 100000, band: "$100k–$1M" },
    { id: "dolphin", label: "Dolphin", min: 10000, band: "$10k–$100k" },
    { id: "fish", label: "Fish", min: 1000, band: "$1k–$10k" },
    { id: "crab", label: "Crab", min: 100, band: "$100–$1k" },
    { id: "shrimp", label: "Shrimp", min: 0, band: "< $100" }
  ];
  var TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  var TOKEN22 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
  var RPCS = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];
  var busy = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function money(n) {
    if (!isFinite(n)) return "—";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(2) + "K";
    if (n >= 1) return "$" + n.toFixed(2);
    return "$" + n.toFixed(4);
  }
  function pct(n) { return (isFinite(n) ? n : 0).toFixed(2) + "%"; }
  function u64le(b64) {
    var bin = atob(b64);
    var n = 0;
    for (var i = 0; i < bin.length; i++) n += bin.charCodeAt(i) * Math.pow(2, 8 * i);
    return n;
  }

  function hideOthers() {
    document.querySelectorAll(".trend-panel").forEach(function (p) {
      if (p.id === "tiers-panel") return;
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
    var p = $("tiers-panel");
    if (!p) return;
    if (on) {
      hideOthers();
      p.style.display = "block";
      p.classList.add("on");
      var st = $("tier-status");
      if (st && st.textContent === "READY") st.textContent = "PASTE MINT";
    } else {
      p.style.display = "none";
      p.classList.remove("on");
    }
  }
  window.showTiers = show;

  function onTabClick(ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest("#tf-tabs .tab") : null;
    if (!btn) return;
    show(btn.getAttribute("data-tf") === "tiers");
  }

  async function scan(mint) {
    var res = await fetch("https://trading-ohlcv.sasipudi.workers.dev/tiers?mint=" + encodeURIComponent(mint), { cache: "no-store" });
    var body = await res.json();
    if (!body || body.ok === false) throw new Error((body && body.error) || "Tier scan failed");
    return body;
  }

  function paint(result) {
    var meta = $("tier-meta");
    var table = $("tier-table");
    var st = $("tier-status");
    if (st) st.textContent = result.holderCount + " HOLDERS";
    if (meta) {
      meta.innerHTML = "<b style=\"color:#e8eef6\">" + esc(result.name) + "</b> " +
        esc(result.symbol) + " · " + money(result.price) + " · mcap " + money(result.mcap) +
        " · <a href=\"https://solscan.io/token/" + esc(result.mint) + "#holders\" target=\"_blank\" rel=\"noreferrer\" style=\"color:#8eb4ff\">Solscan</a>";
    }
    if (!table) return;
    var html = "<table style=\"width:100%;border-collapse:collapse;font-size:13px\"><thead><tr style=\"color:#8491a1;text-align:left\">" +
      "<th style=\"padding:8px 8px 8px 0\">Tier</th><th>Holders</th><th>% holders</th><th>Value</th><th>% of coin</th></tr></thead><tbody>";
    BANDS.forEach(function (b, i) {
      var row = result.buckets[i];
      if (!row.count) return;
      var hp = result.holderCount ? (row.count / result.holderCount) * 100 : 0;
      var mp = result.sum ? (row.value / result.sum) * 100 : 0;
      html += "<tr style=\"border-top:1px solid #243041\">" +
        "<td style=\"padding:10px 8px 10px 0\"><b style=\"color:#e8eef6\">" + b.label + "</b><div style=\"font-size:11px;color:#8491a1\">" + b.band + "</div></td>" +
        "<td style=\"font-variant-numeric:tabular-nums\">" + row.count.toLocaleString() + "</td>" +
        "<td style=\"color:#8491a1;font-variant-numeric:tabular-nums\">" + pct(hp) + "</td>" +
        "<td style=\"font-variant-numeric:tabular-nums\">" + money(row.value) + "</td>" +
        "<td style=\"font-variant-numeric:tabular-nums\">" + pct(mp) + "</td></tr>";
    });
    html += "</tbody></table>";
    table.innerHTML = html;
  }

  function boot() {
    var tabs = $("tf-tabs");
    if (tabs) tabs.addEventListener("click", onTabClick);
    var form = $("tier-form");
    if (form) {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (busy) return;
        var mint = ($("tier-mint") && $("tier-mint").value || "").trim();
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
          var st0 = $("tier-status");
          if (st0) st0.textContent = "BAD ADDRESS";
          return;
        }
        busy = true;
        var st = $("tier-status");
        if (st) st.textContent = "READING";
        var table = $("tier-table");
        if (table) table.innerHTML = "<div style=\"font-size:12px;color:#8491a1\">Reading every holder…</div>";
        scan(mint).then(paint).catch(function (err) {
          if (st) st.textContent = "FAILED";
          if (table) table.innerHTML = "<div style=\"font-size:12px;color:#e07a7a\">" + esc(err.message || "Could not load holders") + "</div>";
        }).then(function () { busy = false; });
      });
    }
    var act = document.querySelector("#tf-tabs .tab.active");
    if (act && act.getAttribute("data-tf") === "tiers") show(true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
