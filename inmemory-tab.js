/* InMemory — handoff prompt for a new Grok chat. Static. Copy only. */
(function () {
  const PROMPT = [
    'Continue my live trading terminal. Do NOT scaffold a new app.',
    '',
    'Repo: https://github.com/Sasikar/Trading',
    'Pages (UI): https://sasikar.github.io/Trading/index.html',
    'Worker (brain): https://trading-ohlcv.sasipudi.workers.dev',
    'Owner: Sasikar. Telegram bot: @MyTradingBreakoutBot (private DM only).',
    '',
    'READ FIRST',
    '- docs/BREAKOUT.md (source of truth for breakout/tape/alerts)',
    '- cloudflare/ohlcv-worker/src/engine.js',
    '- cloudflare/ohlcv-worker/src/index.js',
    '- index.html + breakout-tab.js, hunter-tab.js, holders-tab.js, failures-tab.js, verdict-tab.js, inmemory-tab.js, overview-app.js',
    '',
    'ARCHITECTURE (do not violate)',
    '- GitHub Pages = display only. No Dex polling from the browser.',
    '- Trend heatmap: LIVE book (seconds) / 1H volume profile (default) / 1D. Daily S/R overlay. Coinglass liq map is paid — link out, no fake.',
    '- Cloudflare Durable Object "main" = Dex/Gecko/candles/alerts. Auto tape 5m. 1m on-demand only.',
    '- Watchlist for Breakout = data/ca-recents.json (saved CAs). ~18 coins.',
    '- Deploy: commit to GitHub master → GH Action deploys Pages + worker.',
    '- Free DO SQL writes: 100k/day, reset 00:00 UTC. Auto writes 5m+ only (~50k/day headroom). 1m bars only when 1m is opened. Skip unchanged writes.',
    '',
    'TABS',
    '- MemeGate / CA / Breakout Memes / Hunter / Holders / Failures / InMemory / G-Trade Notes / Verdict / Anti-FOMO / TF charts',
    '- Breakout: EARLY / LIVE / MATURED only (quiet coins hidden). Print canonical breakout LEVEL, spot, dist%. LIVE ≠ buy.',
    '- Hunter: Dex discover every 20 min (Scan now = force). Hunter watch is a PIN LIST only — hunter_watch meta. NEVER merge into getWatch / ca-recents / breakout tape / Telegram.',
    '- Holders: SOL only. Jupiter 1h/6h/24h. 4h/1w/1M from our snapshots. No mix/depth charts in-app. Each card opens Solscan token #analytics and #holders. Do not invent whale counts.',
    '- Failures: last hour of REAL errors only (Dex/Gecko 429, retries, hunter skip, nopool, telegram, stale alarm). Empty hour = none. Do not invent OK rows.',
    '- InMemory: this handoff prompt + Copy. Keep it updated when architecture changes.',
    '- G-Trade Notes (tab label G-Trade + small Notes): one keep.google.com link on the phone. Opens Keep. No Google API, no notes inside the PWA.',
    '- Tab bar: tap Arrange, drag tabs, tap Done. Saved on this phone.',
    '- Hunter: same 4 bands by market cap (not liq). Momentum + high-volume. V $xM = 24h volume.',
    '- Verdict: tape-only HOLD/EXIT. No Dex-24h fake 1D/1W.',
    '',
    'HARD RULES',
    '- Never fake API data, rocket votes, breakout levels, or 1D/1W from Dex 24h %.',
    '- Fake detectors detectDexTf / detectLegacy4h / detectLive5m are DELETED. Do not bring them back.',
    '- ntfy.sh is GONE. Alerts = Telegram only. Do not mention ntfy pause/quota.',
    '- Dex official: 300/min pairs, 60/min profiles. Our cap ~22 Dex calls/min. On 429 pause 20s.',
    '- Gecko 1D backfill: 1 saved CA per hour (GECKO_EVERY_MS), keep 2y 1d/1w/1M. Close-only writes for long TFs.',
    '- 1D/1W breakout is real tape once MIN_BARS exist; otherwise WARMING. Daily PA via screenshot is a separate future layer — frozen, don’t code unless I ask.',
    '- If worker health is STALE, alarm died. /run kicks it. ensureAlarm must re-arm if stored alarm is in the past.',
    '- User is on a phone in Grok. No localhost/ports in replies. Hard-refresh after deploys. Prefer analysis-only when I say analysis.',
    '',
    'ENTRY QUALITY (spec exists in BREAKOUT.md §12): evaluateRow → existing breakout → entryQuality WATCH/WINDOW/EXTENDED/FAILED. Frozen extras: no new engine, no 15m wait, no CVD/RSI layer, no new board.',
    '',
    'CURRENT PAIN',
    '- Worker alarm has gone STALE for hours; fix by re-arming, not by pretending hunter ran.',
    '- Dex 429 on the saved-CA poll can skip hunter the same tick.',
    '- Do not put hunter-watch coins on the 1m tape.',
    '',
    'When I ask to implement: small surgical PR, same GitHub push flow, update docs/BREAKOUT.md in the same change. When I say analysis only: no code.',
    '',
    'First reply: confirm you read BREAKOUT.md + engine.js, worker /status health, and you will not rebuild the site from scratch.'
  ].join('\n');

  window.INMEMORY_PROMPT = PROMPT;

  function $(id) {
    return document.getElementById(id);
  }

  function hideOthers() {
    [
      'tf-panels',
      'trend-panel',
      'struct-panel',
      'macro-panel',
      'signal-panel',
      'memegate-panel',
      'coin-panel',
      'antifomo-panel',
      'hunter-panel',
      'breakouts-panel',
      'holders-panel',
      'failures-panel',
      'verdict-panel',
      'sentiment-panel',
      'keep-panel'
    ].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
    ['showBreakoutMemes', 'showHunter', 'showHolders', 'showFailures', 'showVerdict', 'showSentiment', 'showKeep'].forEach(function (fn) {
      try {
        window[fn](false);
      } catch (e) {}
    });
  }

  function fill() {
    const pre = $('im-text');
    if (pre && !pre.textContent) pre.textContent = PROMPT;
    else if (pre) pre.textContent = PROMPT;
  }

  function copyPrompt() {
    const btn = $('im-copy');
    const text = PROMPT;
    function ok() {
      if (btn) {
        btn.textContent = 'Copied';
        setTimeout(function () {
          btn.textContent = 'Copy prompt';
        }, 1600);
      }
    }
    function fail() {
      if (btn) btn.textContent = 'Select + copy';
      const pre = $('im-text');
      if (pre) {
        const r = document.createRange();
        r.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(fail);
    } else {
      fail();
    }
  }

  function showInMemory(on) {
    const p = $('inmemory-panel');
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      fill();
    } else if (p) {
      p.style.display = 'none';
      p.classList.remove('on');
    }
  }

  window.showInMemory = showInMemory;
  window.copyInMemoryPrompt = copyPrompt;

  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf !== 'inmemory') showInMemory(false);
      }, 0);
    });
  }
})();
