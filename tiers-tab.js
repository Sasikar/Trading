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
function tokens(n) {
  if (!isFinite(n)) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}
function stat(label, value, note) {
  return "<div style=\"padding:12px 0;border-top:1px solid #243041\">" +
    "<div style=\"font-size:11px;letter-spacing:.04em;color:#8491a1\">" + label + "</div>" +
    "<div style=\"font-size:22px;font-weight:800;color:#e8eef6;margin-top:4px\">" + value + "</div>" +
    (note ? "<div style=\"font-size:12px;color:#8491a1;margin-top:4px\">" + note + "</div>" : "") +
    "</div>";
}
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
    var c = result.concentration || {};
    var top10 = c.top10 || {};
    var top5 = c.top5 || {};
    var top100 = c.top100 || {};
    var tw = c.tokenWhales || {};
    var pw = result.portfolioWhales;
    html += "<div style=\"margin-top:8px\">";
    html += stat(
      "TOP 10 CONCENTRATION",
      pct(top10.pct || 0) + " (" + money(top10.usd || 0) + ")",
      "Top 5 holders: " + pct(top5.pct || 0) + " · Top 100 holders: " + pct(top100.pct || 0)
    );
    html += stat(
      "TOKEN WHALE CONCENTRATION",
      tw.count ? pct(tw.pct || 0) + " (" + money(tw.usd || 0) + ")" : "—",
      tw.count ? (tw.count + " wallet" + (tw.count === 1 ? "" : "s") + " hold $1M or more of this coin") : "No wallet holds $1M of this coin"
    );
    html += stat(
      "PORTFOLIO WHALE CONCENTRATION",
      pw && pw.count != null ? pct(pw.pct || 0) + " (" + money(pw.usd || 0) + ")" : "cannot verify",
      pw && pw.count != null
        ? (pw.count + " of the largest " + pw.checked + " holders have $1M elsewhere, LP excluded")
        : "Other-wallet wealth did not load"
    );
    html += stat(
      "TOP 10 TOKENS",
      pct(top10.pct || 0) + " (" + tokens(top10.tokens || 0) + " tokens)"
    );
    html += "</div>";
    table.innerHTML = html;
    paintCommentary(result);
  }

  function commentaryInput(result) {
    var c = result.concentration || {};
    var tw = c.tokenWhales || {};
    var pw = result.portfolioWhales;
    var tiers = (result.buckets || []).map(function (row, i) {
      var band = BANDS[i];
      var holders = row && row.count ? row.count : 0;
      var value = row && row.value ? row.value : 0;
      return {
        tier: band ? band.label : "",
        holders: holders,
        pctHolders: result.holderCount ? (holders / result.holderCount) * 100 : 0,
        valueUsd: value,
        pctOfCoin: result.sum ? (value / result.sum) * 100 : 0
      };
    });
    return {
      name: result.name,
      symbol: result.symbol,
      priceUsd: result.price,
      mcapUsd: result.mcap,
      holderCount: result.holderCount,
      tiers: tiers,
      top5Pct: c.top5 ? c.top5.pct : null,
      top10Pct: c.top10 ? c.top10.pct : null,
      top10Usd: c.top10 ? c.top10.usd : null,
      top100Pct: c.top100 ? c.top100.pct : null,
      tokenWhaleConcentration: tw.count ? tw.pct : null,
      portfolioWhaleConcentrationPct: pw && pw.count != null ? pw.pct : null,
      lpExcluded: null
    };
  }

  function paintCommentary(result) {
    var box = $("tier-commentary");
    if (!box || typeof window.tierCommentary !== "function") return;
    var out = window.tierCommentary(commentaryInput(result));
    var color = {
      "RUG": "#ff5d5d",
      "Very High Risk": "#ff8a3d",
      "High Risk": "#f0b429",
      "Cautious": "#e6d36a",
      "Safe": "#3dbe7a"
    }[out.verdict] || "#e8eef6";
    var sevColor = { HIGH: "#ff8a7a", WARN: "#f0b429", INFO: "#9eb6d4" };
    var html = "<div style=\"margin-top:18px;padding-top:8px;border-top:1px solid #243041\">";
    html += "<div style=\"font-size:11px;letter-spacing:.04em;color:#8491a1\">COMMENTARY</div>";
    html += "<div style=\"display:inline-block;margin-top:8px;padding:6px 12px;border-radius:999px;font-weight:800;background:#1a2330;color:" + color + "\">" + esc(out.verdict) + "</div>";
    if (!out.flags.length) html += "<div style=\"margin-top:10px;font-size:13px;color:#8491a1\">No tier flag fired.</div>";
    out.flags.forEach(function (f) {
      html += "<div style=\"margin-top:10px;font-size:13px;line-height:1.45;color:" + (sevColor[f.severity] || "#e8eef6") + "\"><b>" + esc(f.severity) + "</b> · " + esc(f.message) + "</div>";
    });
    html += fold("Positives", out.positives);
    html += fold("Not verified", out.unverified);
    html += "<div style=\"margin-top:12px;font-size:11px;color:#8491a1;line-height:1.45\">Tier-based flags only. They can't detect split insider supply. Not financial advice.</div>";
    html += "</div>";
    box.innerHTML = html;
  }

  function fold(title, rows) {
    var body = rows.length
      ? rows.map(function (r) { return "<div style=\"margin-top:6px\">" + esc(r) + "</div>"; }).join("")
      : "<div style=\"margin-top:6px\">None.</div>";
    return "<details style=\"margin-top:12px\"><summary style=\"cursor:pointer;color:#8491a1;font-size:12px\">" + title + " (" + rows.length + ")</summary><div style=\"font-size:12px;color:#c5d0dc;line-height:1.45\">" + body + "</div></details>";
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
        var box = $("tier-commentary");
        if (box) box.innerHTML = "";
        scan(mint).then(paint).catch(function (err) {
          if (st) st.textContent = "FAILED";
          if (table) table.innerHTML = "<div style=\"font-size:12px;color:#e07a7a\">" + esc(err.message || "Could not load holders") + "</div>";
          if (box) box.innerHTML = "";
        }).then(function () { busy = false; });
      });
    }
    var act = document.querySelector("#tf-tabs .tab.active");
    if (act && act.getAttribute("data-tf") === "tiers") show(true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
