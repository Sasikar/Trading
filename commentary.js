(function (exp) {
  var CONFIG = {
    top5WarnPct: 15,
    top5VeryHighPct: 30,
    top5RugPct: 45,
    top10WarnPct: 25,
    top10HighPct: 35,
    top10VeryHighPct: 45,
    top10RugPct: 60,
    top100WarnPct: 60,
    midTierWarnPct: 45,
    midTierHighPct: 55,
    midTierVeryHighPct: 70,
    sharkWhaleWarnPct: 20,
    sharkWhaleVeryHighPct: 35,
    sharkWhaleRugPct: 50,
    sharkWhaleRugHolders: 500,
    retailThinWarnPct: 15,
    retailThinHighPct: 8,
    minHoldersWarn: 300,
    minHoldersHigh: 150,
    minHoldersVeryHigh: 100,
    minHoldersRug: 80,
    shrimpHolderShareInfoPct: 85,
    portfolioWhaleWarnPct: 20,
    portfolioWhalePositivePct: 5,
    mcapPerHolderWarnUsd: 2000,
    top10CleanPct: 20,
    top5CleanPct: 12,
    sharkWhaleCleanPct: 10,
    holdersClean: 5000,
    pctSumLo: 95,
    pctSumHi: 105
  };

  var TIER_NAMES = ["Whale", "Shark", "Dolphin", "Fish", "Crab", "Shrimp"];

  function num(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    var s = v.trim().replace(/[$,%\s]/g, "").replace(/,/g, "");
    if (!s) return null;
    var mult = 1;
    var suf = s.slice(-1).toLowerCase();
    if (suf === "k" || suf === "m" || suf === "b") {
      mult = suf === "k" ? 1e3 : suf === "m" ? 1e6 : 1e9;
      s = s.slice(0, -1);
    }
    if (!s || !/^[-+]?\d*\.?\d+$/.test(s)) return null;
    var n = Number(s);
    return Number.isFinite(n) ? n * mult : null;
  }

  function fmt(n) {
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function fmtCount(n) {
    if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
    return fmt(n);
  }

  function has(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function readTiers(list, unverified) {
    var out = {};
    TIER_NAMES.forEach(function (n) {
      out[n] = { holders: 0, pctHolders: null, pctOfCoin: 0, present: false };
    });
    if (!Array.isArray(list)) {
      TIER_NAMES.forEach(function (n) { unverified.push("Tier " + n + " missing"); });
      return out;
    }
    var seen = {};
    list.forEach(function (row) {
      if (!row || row.tier == null) return;
      var key = TIER_NAMES.filter(function (n) { return n.toLowerCase() === String(row.tier).trim().toLowerCase(); })[0];
      if (!key) return;
      seen[key] = true;
      var pct = num(row.pctOfCoin);
      if (pct == null) {
        unverified.push("Tier " + key + " percent unreadable");
        return;
      }
      out[key] = {
        holders: num(row.holders),
        pctHolders: num(row.pctHolders),
        pctOfCoin: pct,
        present: true
      };
    });
    TIER_NAMES.forEach(function (n) {
      if (seen[n]) return;
      if (n === "Whale") return;
      unverified.push("Tier " + n + " missing");
    });
    return out;
  }

  function commentary(input, config) {
    var cfg = {};
    Object.keys(CONFIG).forEach(function (k) { cfg[k] = CONFIG[k]; });
    if (config) Object.keys(config).forEach(function (k) { if (k in CONFIG) cfg[k] = config[k]; });
    var src = input && typeof input === "object" ? input : {};
    var flags = [];
    var positives = [];
    var unverified = [];

    function flag(id, severity, message) {
      flags.push({ id: id, severity: severity, message: message });
    }

    var tiers = readTiers(src.tiers, unverified);
    var shark = tiers.Shark;
    var whale = tiers.Whale;
    var dolphin = tiers.Dolphin;
    var crab = tiers.Crab;
    var shrimp = tiers.Shrimp;
    var fish = tiers.Fish;

    var top5 = field(src, "top5Pct", "Top 5 concentration", unverified);
    var top10 = field(src, "top10Pct", "Top 10 concentration", unverified);
    var top100 = field(src, "top100Pct", "Top 100 concentration", unverified);
    var holders = field(src, "holderCount", "Holder count", unverified);
    var mcap = field(src, "mcapUsd", "Market cap", unverified);
    var port = field(src, "portfolioWhaleConcentrationPct", "Portfolio whale concentration", unverified);

    var tokenWhale = undefined;
    if (!has(src, "tokenWhaleConcentration")) {
      unverified.push("Token whale concentration");
    } else if (src.tokenWhaleConcentration == null) {
      tokenWhale = null;
    } else {
      tokenWhale = num(src.tokenWhaleConcentration);
      if (tokenWhale == null) unverified.push("Token whale concentration was not a number");
    }

    var mid = null;
    var midN = null;
    if (shark.present && dolphin.present) {
      var whalePct = whale.present ? whale.pctOfCoin : 0;
      var whaleN = whale.present && whale.holders != null ? whale.holders : 0;
      if (shark.holders != null && dolphin.holders != null) midN = shark.holders + dolphin.holders + whaleN;
      mid = shark.pctOfCoin + dolphin.pctOfCoin + whalePct;
    } else unverified.push("Mid-tier share");

    var sharkWhale = null;
    if (shark.present) sharkWhale = shark.pctOfCoin + (whale.present ? whale.pctOfCoin : 0);
    else unverified.push("Shark plus whale share");

    var retail = null;
    if (crab.present && shrimp.present) retail = crab.pctOfCoin + shrimp.pctOfCoin;
    else unverified.push("Retail share");

    var shrimpShare = null;
    if (shrimp.present && shrimp.pctHolders != null) shrimpShare = shrimp.pctHolders;
    else if (shrimp.present && shrimp.holders != null && holders != null && holders > 0) shrimpShare = (shrimp.holders / holders) * 100;
    else unverified.push("Shrimp share of holders");

    var presentTiers = [whale, shark, dolphin, fish, crab, shrimp].filter(function (t) { return t.present; });
    var corePresent = shark.present && dolphin.present && fish.present && crab.present && shrimp.present;
    if (corePresent) {
      var sum = presentTiers.reduce(function (s, t) { return s + t.pctOfCoin; }, 0);
      if (sum < cfg.pctSumLo || sum > cfg.pctSumHi) {
        flag("SUM", "INFO", "Tier percentages don't sum to 100; data may be partial or exclude the LP.");
      }
    }

    if (top10 == null) { /* skipped */ }
    else if (top10 > cfg.top10RugPct || top10 > cfg.top10VeryHighPct || top10 > cfg.top10HighPct) {
      flag("T1", "HIGH", "Top 10 wallets hold " + fmt(top10) + "% of supply.");
    } else if (top10 > cfg.top10WarnPct) {
      flag("T1", "WARN", "Top 10 wallets hold " + fmt(top10) + "% of supply.");
    }

    if (top5 != null && top5 > cfg.top5WarnPct) {
      var sev5 = top5 > cfg.top5VeryHighPct || top5 > cfg.top5RugPct ? "HIGH" : "WARN";
      flag("T2", sev5, "Top 5 wallets hold " + fmt(top5) + "% of supply.");
    } else if (top5 == null) { /* already unverified */ }

    if (top100 != null && top100 > cfg.top100WarnPct) {
      flag("T3", "WARN", "Top 100 wallets hold " + fmt(top100) + "% of supply.");
    }

    if (mid != null && mid > cfg.midTierWarnPct) {
      var sev4 = mid > cfg.midTierVeryHighPct || mid > cfg.midTierHighPct ? "HIGH" : "WARN";
      var who = midN == null ? "Dolphins + sharks + whales hold " : fmtCount(midN) + " wallets (dolphins + sharks + whales) hold ";
      flag("T4", sev4, who + fmt(mid) + "% of supply. If even a fraction are linked, real concentration is higher.");
    }

    if (sharkWhale != null && sharkWhale > cfg.sharkWhaleWarnPct) {
      var sev5b = sharkWhale > cfg.sharkWhaleVeryHighPct ? "HIGH" : "WARN";
      flag("T5", sev5b, "Sharks and whales hold " + fmt(sharkWhale) + "% of supply.");
    }

    if (retail != null && retail < cfg.retailThinWarnPct) {
      var sev6 = retail < cfg.retailThinHighPct ? "HIGH" : "WARN";
      flag("T6", sev6, "Retail holds only " + fmt(retail) + "%: little organic buy support if big wallets sell.");
    }

    if (holders != null && holders < cfg.minHoldersWarn) {
      var sev7 = holders < cfg.minHoldersHigh ? "HIGH" : "WARN";
      flag("T7", sev7, "Only " + fmtCount(holders) + " holders.");
    }

    var mcapPer = null;
    if (mcap != null && holders != null && holders > 0) mcapPer = mcap / holders;
    else unverified.push("Market cap per holder");
    if (mcapPer != null && mcapPer > cfg.mcapPerHolderWarnUsd) {
      flag("T8", "WARN", "Market cap per holder is $" + fmt(mcapPer) + ", high for the holder count.");
    }

    if (shrimpShare != null && shrimpShare > cfg.shrimpHolderShareInfoPct) {
      flag("T9", "INFO", "Most holders are dust wallets; holder count overstates real breadth.");
    }

    if (tokenWhale != null && tokenWhale > 0) {
      flag("T10", "WARN", "A wallet holds over $1M of this coin.");
    }

    if (port != null && port > cfg.portfolioWhaleWarnPct) {
      flag("T11", "WARN", "Large holders have big wealth elsewhere: possible professional sellers.");
    }

    var shape = top10 != null && mid != null && top10 < cfg.top10CleanPct && mid > cfg.midTierWarnPct;
    if (shape) {
      flag("T12", "INFO", "Top 10 looks clean but supply sits in dolphins, sharks, and whales. This pattern can hide split insider supply. Check Bubblemaps and the mint creator.");
    }

    if (top10 != null && top10 < cfg.top10CleanPct) positives.push("Top 10 hold under 20%.");
    if (top5 != null && top5 < cfg.top5CleanPct) positives.push("Top 5 hold under 12%.");
    if (tokenWhale === null && !whale.present) positives.push("No whale wallet on this coin.");
    if (sharkWhale != null && shark.present && sharkWhale < cfg.sharkWhaleCleanPct) positives.push("Sharks and whales together hold under 10%.");
    if (holders != null && holders > cfg.holdersClean) positives.push("More than 5,000 holders.");
    if (port != null && port < cfg.portfolioWhalePositivePct) positives.push("Portfolio whales hold under 5%.");

    unverified.push("Mint creator and first-supply flow");
    unverified.push("Wallets linked or funded by the same source");
    if (src.lpExcluded !== true) unverified.push("Whether the LP is excluded from these figures");
    unverified.push("Balance trend over time");

    var fishCrab = fish.present && crab.present ? fish.pctOfCoin + crab.pctOfCoin : null;
    var checks = scorecard(cfg, {
      top5: top5, top10: top10, top100: top100, holders: holders, mid: mid,
      sharkWhale: sharkWhale, retail: retail, fishCrab: fishCrab,
      tokenWhale: tokenWhale === null || typeof tokenWhale === "number" ? (tokenWhale || 0) : null,
      port: port, shrimpShare: shrimpShare, mcapPer: mcapPer, shape: shape
    });
    var verdict = judge(cfg, { top5: top5, top10: top10, holders: holders, mid: mid, sharkWhale: sharkWhale, retail: retail, tokenWhale: tokenWhale, port: port, shrimpShare: shrimpShare, mcapPer: mcapPer, shape: shape, top100: top100, core: corePresent && top10 != null && top5 != null && holders != null });

    var rank = { HIGH: 0, WARN: 1, INFO: 2 };
    flags.sort(function (a, b) { return rank[a.severity] - rank[b.severity]; });

    return { verdict: verdict, reason: reasonFor(verdict, checks), checks: checks, flags: flags, positives: positives, unverified: dedupe(unverified) };
  }

  function scorecard(cfg, c) {
    var rows = [];
    function row(label, value, unit, rules, note) {
      var hit = null;
      var nearest = null;
      var gap = Infinity;
      (rules || []).forEach(function (rule) {
        if (value == null) return;
        var fired = rule.op === ">" ? value > rule.threshold : value < rule.threshold;
        if (fired && !hit) hit = rule;
        var room = rule.op === ">" ? rule.threshold - value : value - rule.threshold;
        if (rule.threshold === 0) return;
        if (room >= 0 && room < gap) { gap = room; nearest = rule; }
      });
      rows.push({
        label: label,
        value: value,
        unit: unit,
        used: !note,
        note: note || "",
        hit: !!hit,
        verdict: hit ? hit.verdict : null,
        op: hit ? hit.op : nearest && nearest.op,
        threshold: hit ? hit.threshold : nearest && nearest.threshold,
        gap: gap,
        nearest: nearest
      });
    }
    row("Top 5", c.top5, "pct", [
      { op: ">", threshold: cfg.top5RugPct, verdict: "RUG" },
      { op: ">", threshold: cfg.top5VeryHighPct, verdict: "Very High Risk" },
      { op: ">", threshold: cfg.top5WarnPct, verdict: "Cautious" }
    ]);
    row("Top 10", c.top10, "pct", [
      { op: ">", threshold: cfg.top10RugPct, verdict: "RUG" },
      { op: ">", threshold: cfg.top10VeryHighPct, verdict: "Very High Risk" },
      { op: ">", threshold: cfg.top10HighPct, verdict: "High Risk" },
      { op: ">", threshold: cfg.top10WarnPct, verdict: "Cautious" }
    ]);
    row("Sharks + whales", c.sharkWhale, "pct", [
      { op: ">", threshold: cfg.sharkWhaleVeryHighPct, verdict: "Very High Risk" },
      { op: ">", threshold: cfg.sharkWhaleWarnPct, verdict: "High Risk" }
    ]);
    row("Dolphins + sharks + whales", c.mid, "pct", [
      { op: ">", threshold: cfg.midTierVeryHighPct, verdict: "Very High Risk" },
      { op: ">", threshold: cfg.midTierHighPct, verdict: "High Risk" },
      { op: ">", threshold: cfg.midTierWarnPct, verdict: "Cautious" }
    ]);
    row("Fish + crab", c.fishCrab, "pct", [], "Not a risk rule. Fish is $1k–$10k and crab is $100–$1k.");
    row("Crab + shrimp", c.retail, "pct", [
      { op: "<", threshold: cfg.retailThinHighPct, verdict: "High Risk" },
      { op: "<", threshold: cfg.retailThinWarnPct, verdict: "Cautious" }
    ]);
    row("Holders", c.holders, "count", [
      { op: "<", threshold: cfg.minHoldersRug, verdict: "RUG" },
      { op: "<", threshold: cfg.minHoldersVeryHigh, verdict: "Very High Risk" },
      { op: "<", threshold: cfg.minHoldersHigh, verdict: "High Risk" },
      { op: "<", threshold: cfg.minHoldersWarn, verdict: "Cautious" }
    ]);
    row("$1M wallets", c.tokenWhale, "pct", [
      { op: ">", threshold: 0, verdict: "High Risk" }
    ]);
    return rows;
  }

  function reasonFor(verdict, checks) {
    var order = ["RUG", "Very High Risk", "High Risk", "Cautious"];
    if (order.indexOf(verdict) !== -1) {
      var hit = checks.filter(function (c) { return c.hit && c.verdict === verdict; })[0];
      if (hit) return hit.label + ": " + showNum(hit.value, hit.unit) + " " + hit.op + " " + showNum(hit.threshold, hit.unit);
    }
    var near = checks.filter(function (c) { return c.used && c.nearest && isFinite(c.gap); }).sort(function (a, b) { return a.gap - b.gap; })[0];
    if (!near) return "No rule fired.";
    var way = near.nearest.op === ">" ? "over " : "under ";
    return "No rule fired. Closest: " + near.label + " " + showNum(near.value, near.unit) + " vs " + way + showNum(near.nearest.threshold, near.unit) + ".";
  }

  function showNum(n, unit) {
    if (unit === "count") return fmtCount(n);
    if (unit === "usd") return "$" + fmt(n);
    return fmt(n) + "%";
  }

  function field(src, key, label, unverified) {
    if (!has(src, key) || src[key] == null || src[key] === "") {
      unverified.push(label);
      return null;
    }
    var n = num(src[key]);
    if (n == null) unverified.push(label + " was not a number");
    return n;
  }

  function judge(cfg, c) {
    if (c.holders != null && c.holders < cfg.minHoldersRug) return "RUG";
    if (c.top10 != null && c.top10 > cfg.top10RugPct) return "RUG";
    if (c.top5 != null && c.top5 > cfg.top5RugPct) return "RUG";
    if (c.sharkWhale != null && c.holders != null && c.sharkWhale > cfg.sharkWhaleRugPct && c.holders < cfg.sharkWhaleRugHolders) return "RUG";

    if (c.top10 != null && c.top10 > cfg.top10VeryHighPct) return "Very High Risk";
    if (c.top5 != null && c.top5 > cfg.top5VeryHighPct) return "Very High Risk";
    if (c.sharkWhale != null && c.sharkWhale > cfg.sharkWhaleVeryHighPct) return "Very High Risk";
    if (c.holders != null && c.holders < cfg.minHoldersVeryHigh) return "Very High Risk";
    if (c.mid != null && c.mid > cfg.midTierVeryHighPct) return "Very High Risk";

    if (c.top10 != null && c.top10 > cfg.top10HighPct) return "High Risk";
    if (c.sharkWhale != null && c.sharkWhale > cfg.sharkWhaleWarnPct) return "High Risk";
    if (c.mid != null && c.mid > cfg.midTierHighPct) return "High Risk";
    if (c.retail != null && c.retail < cfg.retailThinHighPct) return "High Risk";
    if (c.holders != null && c.holders < cfg.minHoldersHigh) return "High Risk";
    if (c.tokenWhale != null && c.tokenWhale > 0) return "High Risk";

    var cautious = false;
    if (c.top10 != null && c.top10 > cfg.top10WarnPct) cautious = true;
    if (c.top5 != null && c.top5 > cfg.top5WarnPct) cautious = true;
    if (c.top100 != null && c.top100 > cfg.top100WarnPct) cautious = true;
    if (c.mid != null && c.mid > cfg.midTierWarnPct) cautious = true;
    if (c.retail != null && c.retail < cfg.retailThinWarnPct) cautious = true;
    if (c.holders != null && c.holders < cfg.minHoldersWarn) cautious = true;
    if (c.mcapPer != null && c.mcapPer > cfg.mcapPerHolderWarnUsd) cautious = true;
    if (c.shrimpShare != null && c.shrimpShare > cfg.shrimpHolderShareInfoPct) cautious = true;
    if (c.port != null && c.port > cfg.portfolioWhaleWarnPct) cautious = true;
    if (c.shape) cautious = true;
    if (!c.core) cautious = true;
    if (cautious) return "Cautious";
    return "Safe";
  }

  function dedupe(list) {
    var seen = {};
    return list.filter(function (item) {
      if (seen[item]) return false;
      seen[item] = 1;
      return true;
    });
  }

  exp.CONFIG = CONFIG;
  exp.commentary = commentary;
  exp.num = num;
  if (typeof window !== "undefined") window.tierCommentary = commentary;
})(typeof module === "object" && module.exports ? module.exports : (typeof window !== "undefined" ? (window.TierCommentary = {}) : {}));
