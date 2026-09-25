/* Overlay — Coin selection + Old Coins. Not a buy signal. */
(function () {
  function apiBase() {
    try {
      if (window.BREAKOUT_API) return String(window.BREAKOUT_API).replace(/\/+$/, '');
    } catch (e) {}
    return 'https://trading-ohlcv.sasipudi.workers.dev';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&', '<': '<', '>': '>', '"': '"' })[c];
    });
  }
  function shortCa(ca) {
    ca = String(ca || '');
    return ca.length < 12 ? ca : ca.slice(0, 4) + '\u2026' + ca.slice(-4);
  }
  function scoreOf(c) {
    return +c.score || (c.wallets || []).length || 0;
  }
  function dexHref(mint) {
    return 'https://dexscreener.com/solana/' + String(mint || '').trim();
  }
  function copyText(t) {
    t = String(t || '');
    if (!t) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).catch(function () {
        window.prompt('Copy', t);
      });
    } else {
      window.prompt('Copy', t);
    }
  }
  function hideDead() {
    document.querySelectorAll(
      '#wallets-panel .wt-tab[data-wt="buys"], #wallets-panel .wt-tab[data-wt="signals"], #wallets-panel .wt-tab[data-wt="common"]'
    ).forEach(function (b) {
      b.style.display = 'none';
    });
    const coinsBtn = document.querySelector('#wallets-panel .wt-tab[data-wt="coins"]');
    if (coinsBtn) coinsBtn.textContent = 'Coin selection';
  }
  function paintChips(mode) {
    document.querySelectorAll('#wallets-panel .wt-tab').forEach(function (b) {
      const on = b.getAttribute('data-wt') === mode;
      b.style.background = on ? '#1a9b6c' : '#121a24';
      b.style.color = on ? '#fff' : '#c5d0dc';
    });
  }
  function ensure() {
    hideDead();
    const card = document.querySelector('#wallets-panel .card');
    if (!card) return;
    const row = card.querySelector('.wt-tab') && card.querySelector('.wt-tab').parentNode;
    if (row && !document.querySelector('#wallets-panel .wt-tab[data-wt="coins"]')) {
      const html =
        '<button type="button" class="wt-tab" data-wt="coins" style="padding:8px 12px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#c5d0dc;font-weight:800;font-size:12px;cursor:pointer">Coin selection</button>';
      const lead = row.querySelector('.wt-tab[data-wt="leaders"]');
      if (lead) lead.insertAdjacentHTML('afterend', html);
      else row.insertAdjacentHTML('afterbegin', html);
    }
    if (row && !document.querySelector('#wallets-panel .wt-tab[data-wt="old"]')) {
      const html =
        '<button type="button" class="wt-tab" data-wt="old" style="padding:8px 12px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#c5d0dc;font-weight:800;font-size:12px;cursor:pointer">Old Coins</button>';
      const coins = row.querySelector('.wt-tab[data-wt="coins"]');
      if (coins) coins.insertAdjacentHTML('afterend', html);
      else row.insertAdjacentHTML('beforeend', html);
    }
    if (!card.getAttribute('data-wt-bound')) {
      card.setAttribute('data-wt-bound', '1');
      card.addEventListener('click', onClick);
      card.addEventListener('keydown', onLookupKey);
    }
  }
  function onLookupKey(ev) {
    if (ev.key !== 'Enter') return;
    const id = ev.target && ev.target.id;
    if (id === 'wt-lookup-wallet' || id === 'wt-lookup-q') {
      ev.preventDefault();
      runLookup();
    }
  }
  function onClick(ev) {
    const copyBtn = ev.target && ev.target.closest && ev.target.closest('[data-copy]');
    if (copyBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      copyText(copyBtn.getAttribute('data-copy'));
      copyBtn.textContent = 'copied';
      setTimeout(function () {
        copyBtn.textContent = copyBtn.getAttribute('data-copy-label') || 'copy';
      }, 900);
      return;
    }
    if (ev.target && ev.target.closest && ev.target.closest('#wt-lookup-go')) {
      ev.preventDefault();
      ev.stopPropagation();
      runLookup();
      return;
    }
    const coinBtn = ev.target && ev.target.closest && ev.target.closest('[data-cs-mint]');
    if (coinBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const mint = coinBtn.getAttribute('data-cs-mint') || '';
      const list = (coinBtn.getAttribute('data-cs-wallets') || '').split(',').filter(Boolean);
      const on = coinBtn.getAttribute('data-cs-on') !== '1';
      if (window.coinstatsSetCoin) window.coinstatsSetCoin(mint, list, on);
      document.querySelectorAll('#wallets-panel [data-cs-mint="' + mint + '"]').forEach(function (el) {
        el.setAttribute('data-cs-on', on ? '1' : '0');
        el.style.background = on ? '#2a1c0e' : 'transparent';
        el.style.color = on ? '#f5a14a' : '#e8eef6';
        el.style.borderColor = on ? '#f5a14a' : '#3d4d63';
        el.textContent = (el.textContent || '').replace(/ · (add|added)$/, '') + (on ? ' · added' : ' · add');
      });
      return;
    }
    const b = ev.target && ev.target.closest && ev.target.closest('.wt-tab');
    if (!b) return;
    const wt = b.getAttribute('data-wt');
    if (wt === 'coins' || wt === 'old') {
      ev.preventDefault();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      ev.stopPropagation();
      if (window.setWalletInner) window.setWalletInner(wt);
      else paint(wt);
    }
  }
  function toMs(at) {
    at = +at || 0;
    if (at > 0 && at < 1e12) at *= 1000;
    return at;
  }
  function ago(at) {
    const t = toMs(at);
    if (!(t > 0)) return '';
    const ms = Date.now() - t;
    if (ms < 0) return 'just now';
    const s = Math.floor(ms / 1000);
    if (s < 8) return 'just now';
    if (s < 60) return s + 's ago';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (h < 24) return rm ? h + 'h ' + rm + 'm ago' : h + 'h ago';
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh ? d + 'd ' + rh + 'h ago' : d + 'd ago';
  }
  let agoTimer = 0;
  function tickAgo() {
    document.querySelectorAll('#wallets-panel [data-bought-at]').forEach(function (el) {
      const txt = ago(el.getAttribute('data-bought-at'));
      if (txt && el.textContent !== txt) el.textContent = txt;
    });
  }
  function startAgo() {
    tickAgo();
    if (agoTimer) return;
    agoTimer = setInterval(tickAgo, 1000);
  }
  const lookupState = { wallet: '', q: '', html: '' };
  function inpStyle() {
    return 'flex:1;min-width:160px;padding:8px 10px;border-radius:8px;border:1px solid #243041;background:#0b121a;color:#e8eef6;font-size:13px;font-weight:700';
  }
  function lookupBox() {
    return (
      '<div id="wt-lookup" style="padding:12px;border-radius:12px;border:1px solid #243041;background:#0b121a;margin-bottom:4px">' +
      '<div style="font-size:11px;color:#8491a1;font-weight:800;letter-spacing:.06em;margin-bottom:8px">WALLET BUY TIME · HELIUS</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
      '<input id="wt-lookup-wallet" type="text" spellcheck="false" autocomplete="off" placeholder="wallet address" value="' +
      esc(lookupState.wallet) +
      '" style="' +
      inpStyle() +
      '">' +
      '<input id="wt-lookup-q" type="text" spellcheck="false" autocomplete="off" placeholder="coin name or mint" value="' +
      esc(lookupState.q) +
      '" style="' +
      inpStyle() +
      '">' +
      '<button type="button" id="wt-lookup-go" style="border:0;background:#1a9b6c;color:#fff;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:900;cursor:pointer">Lookup</button>' +
      '</div>' +
      '<div id="wt-lookup-out" style="margin-top:10px">' +
      (lookupState.html ||
        '<div style="color:#8491a1;font-size:12px">Any Solana wallet + ticker or CA. First and last buy from chain.</div>') +
      '</div></div>'
    );
  }
  function clockUtc(at) {
    const t = toMs(at);
    if (!t) return '';
    const d = new Date(t);
    if (!d.getTime()) return '';
    return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  }
  function buyLine(label, b, solUsd) {
    if (!b) return '';
    const usd = (+b.sol || 0) * (+solUsd || 0) + (+b.usdc || 0);
    return (
      '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:8px;align-items:baseline">' +
      '<span style="color:#8491a1;font-size:11px;font-weight:800;min-width:70px">' +
      esc(label) +
      '</span>' +
      '<span style="color:#e8eef6;font-weight:800">' +
      esc(clockUtc(b.at)) +
      '</span>' +
      (b.at
        ? '<span data-bought-at="' +
          toMs(b.at) +
          '" style="color:#6eb6ff;font-size:12px;font-weight:800">' +
          esc(ago(b.at)) +
          '</span>'
        : '') +
      (usd > 0
        ? '<span style="color:#62e3a0;font-weight:900">' + esc(fmtUsd(usd)) + '</span>'
        : +b.sol > 0
          ? '<span style="color:#62e3a0;font-weight:900">' + esc((+b.sol).toFixed(3)) + ' SOL</span>'
          : '') +
      (b.solscan
        ? '<a href="' +
          esc(b.solscan) +
          '" target="_blank" rel="noopener" style="color:#6eb6ff;font-size:12px;font-weight:800">Solscan</a>'
        : '') +
      '</div>'
    );
  }
  function lookupResultHtml(j, solUsd) {
    if (!j || j.ok === false) {
      return '<div style="color:#ff6f7c;font-size:13px;font-weight:800">' + esc((j && j.error) || 'lookup failed') + '</div>';
    }
    const title = (j.symbol || j.name || '').trim() || shortCa(j.mint);
    let html =
      '<div style="font-weight:900;color:#e8eef6">' +
      esc(title) +
      (j.mint ? ' <span style="color:#8491a1;font-weight:700;font-size:11px">' + esc(shortCa(j.mint)) + '</span>' : '') +
      '</div>';
    if (j.mint) {
      html +=
        '<div style="margin-top:4px;display:flex;gap:12px;flex-wrap:wrap">' +
        (j.dexUrl
          ? '<a href="' + esc(j.dexUrl) + '" target="_blank" rel="noopener" style="color:#6eb6ff;font-size:12px;font-weight:800">Dex</a>'
          : '') +
        (j.solscanToken
          ? '<a href="' +
            esc(j.solscanToken) +
            '" target="_blank" rel="noopener" style="color:#6eb6ff;font-size:12px;font-weight:800">Token</a>'
          : '') +
        (j.solscanWallet
          ? '<a href="' +
            esc(j.solscanWallet) +
            '" target="_blank" rel="noopener" style="color:#6eb6ff;font-size:12px;font-weight:800">Wallet</a>'
          : '') +
        '</div>';
    }
    if (!j.found) {
      html +=
        '<div style="margin-top:8px;color:#ffb020;font-size:13px;font-weight:800">' +
        esc(j.error || 'no buy found') +
        '</div>';
      return html;
    }
    html += buyLine('FIRST', j.first, solUsd);
    if (j.last && j.first && j.last.sig !== j.first.sig) html += buyLine('LAST', j.last, solUsd);
    else if (j.last && j.first && j.last.sig === j.first.sig)
      html += '<div style="margin-top:4px;color:#8491a1;font-size:11px;font-weight:800">one buy in scanned txs</div>';
    if (j.truncated)
      html +=
        '<div style="margin-top:4px;color:#ffb020;font-size:11px">token account has many txs — first buy may be older than scanned</div>';
    return html;
  }
  async function runLookup() {
    const wEl = document.getElementById('wt-lookup-wallet');
    const qEl = document.getElementById('wt-lookup-q');
    const out = document.getElementById('wt-lookup-out');
    const go = document.getElementById('wt-lookup-go');
    const wallet = wEl ? wEl.value.trim() : '';
    const q = qEl ? qEl.value.trim() : '';
    lookupState.wallet = wallet;
    lookupState.q = q;
    if (!wallet || !q) {
      lookupState.html = '<div style="color:#ff6f7c;font-size:13px;font-weight:800">wallet and coin required</div>';
      if (out) out.innerHTML = lookupState.html;
      return;
    }
    if (out) out.innerHTML = '<div style="color:#8491a1;font-size:12px">Looking up on Helius\u2026</div>';
    if (go) go.disabled = true;
    try {
      const r = await fetch(
        apiBase() + '/buy-lookup?wallet=' + encodeURIComponent(wallet) + '&q=' + encodeURIComponent(q),
        { cache: 'no-store' }
      );
      const j = await r.json();
      const solUsd = await fetchSolUsd();
      lookupState.html = lookupResultHtml(j, solUsd);
      if (out) out.innerHTML = lookupState.html;
      startAgo();
    } catch (e) {
      lookupState.html = '<div style="color:#ff6f7c;font-size:13px;font-weight:800">' + esc(e.message || e) + '</div>';
      if (out) out.innerHTML = lookupState.html;
    }
    if (go) go.disabled = false;
  }
  function walletCell(c) {
    const handles = c.handles || [];
    const wallets = c.wallets || [];
    const apes = c.apes || [];
    const bits = [];
    const n = Math.max(handles.length, wallets.length, apes.length);
    for (let i = 0; i < n; i++) {
      const h = handles[i] || (apes[i] && apes[i].handle) || '';
      const w = wallets[i] || (apes[i] && apes[i].wallet) || '';
      const ape =
        (w &&
          apes.filter(function (a) {
            return a && a.wallet === w;
          })[0]) ||
        apes[i] ||
        null;
      const dollars = apeUsd(ape, c.solUsd, c.priceUsd);
      const boughtAt = ape && ape.at ? toMs(ape.at) : 0;
      const when = boughtAt ? ago(boughtAt) : '';
      const label = h ? '@' + h : shortCa(w);
      const btn =
        'border:0;background:#1a2430;color:#6eb6ff;border-radius:6px;padding:2px 6px;font-size:10px;font-weight:800;cursor:pointer';
      bits.push(
        '<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px 6px 0;flex-wrap:wrap">' +
          '<span>' +
          esc(label) +
          '</span>' +
          (dollars > 0
            ? '<span style="color:#62e3a0;font-weight:900;font-variant-numeric:tabular-nums">' +
              esc(fmtUsd(dollars)) +
              '</span>'
            : '') +
          (when
            ? '<span data-bought-at="' +
              boughtAt +
              '" title="last buy" style="color:#8491a1;font-size:11px;font-weight:800;font-variant-numeric:tabular-nums">' +
              esc(when) +
              '</span>'
            : '') +
          (h
            ? '<button type="button" data-copy="' +
              esc(h) +
              '" data-copy-label="handle" style="' +
              btn +
              '">handle</button>'
            : '') +
          (w
            ? '<button type="button" data-copy="' +
              esc(w) +
              '" data-copy-label="wallet" style="' +
              btn +
              '">wallet</button>'
            : '') +
          '</span>'
      );
    }
    return bits.join('') || '—';
  }
  const WSOL = 'so11111111111111111111111111111111111111112';
  function coinLabel(c) {
    const n = String(c.symbol || c.name || '').trim();
    if (n && n.length <= 24 && n.indexOf('...') < 0 && !/^[1-9A-HJ-NP-Za-km-z]{20,}/.test(n)) return n;
    return '—';
  }
  function fmtMc(n) {
    n = +n;
    if (!(n > 0)) return '';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 10e6 ? 1 : 2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(n >= 100e3 ? 0 : 1) + 'k';
    return '$' + n.toFixed(0);
  }
  function fmtUsd(n) {
    n = +n;
    if (!(n > 0)) return '';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 10e6 ? 1 : 2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(n >= 100e3 ? 0 : 1) + 'k';
    if (n >= 100) return '$' + Math.round(n);
    if (n >= 10) return '$' + n.toFixed(1);
    return '$' + n.toFixed(2);
  }
  function apeUsd(ape, solPx, tokenPx) {
    if (!ape) return 0;
    const fromSol = (+ape.sol || 0) * (+solPx || 0);
    const fromUsdc = +ape.usdc || 0;
    if (fromSol > 0 || fromUsdc > 0) return fromSol + fromUsdc;
    return (+ape.tokens || 0) * (+tokenPx || 0);
  }
  function coinApeTotal(c) {
    const apes = c.apes || [];
    let s = 0;
    for (let i = 0; i < apes.length; i++) s += apeUsd(apes[i], c.solUsd, c.priceUsd);
    return s;
  }
  async function fetchSolUsd() {
    try {
      const r = await fetch(
        'https://api.dexscreener.com/tokens/v1/solana/So11111111111111111111111111111111111111112',
        { cache: 'no-store' }
      );
      const arr = await r.json();
      const list = Array.isArray(arr) ? arr : [];
      let best = 0;
      for (let i = 0; i < list.length; i++) {
        const px = +(list[i] && list[i].priceUsd) || 0;
        if (px > best) best = px;
      }
      return best;
    } catch (e) {
      return 0;
    }
  }
  function isSolQuote(p) {
    const chain = String(p.chainId || p.chain || '').toLowerCase();
    if (chain && chain !== 'solana') return false;
    const q = ((p.quoteToken && (p.quoteToken.address || p.quoteToken.symbol)) || '').toLowerCase();
    return q === WSOL || q === 'sol';
  }
  async function enrich(coins) {
    const mints = [];
    const seen = {};
    for (let i = 0; i < (coins || []).length; i++) {
      const m = coins[i] && coins[i].mint;
      if (!m || seen[m]) continue;
      seen[m] = 1;
      mints.push(m);
    }
    const meta = {};
    for (let i = 0; i < mints.length; i += 25) {
      const chunk = mints.slice(i, i + 25);
      try {
        const r = await fetch('https://api.dexscreener.com/tokens/v1/solana/' + chunk.join(','), { cache: 'no-store' });
        const arr = await r.json();
        const list = Array.isArray(arr) ? arr : [];
        for (let j = 0; j < list.length; j++) {
          const p = list[j] || {};
          if (!isSolQuote(p)) continue;
          const mint = (p.baseToken && p.baseToken.address) || '';
          if (!mint) continue;
          const mcap = +p.marketCap || +p.fdv || 0;
          const symbol = (p.baseToken && (p.baseToken.symbol || p.baseToken.name)) || '';
          if (!meta[mint] || mcap > (meta[mint].mcap || 0))
            meta[mint] = {
              name: symbol,
              symbol: symbol,
              mcap: mcap,
              priceUsd: +p.priceUsd || 0,
              solPair: true
            };
        }
      } catch (e) {}
    }
    return (coins || []).map(function (c) {
      const x = meta[c.mint] || {};
      return Object.assign({}, c, {
        name: x.name || c.name || '',
        symbol: x.symbol || c.symbol || '',
        mcap: x.mcap || c.mcap || 0,
        priceUsd: x.priceUsd || c.priceUsd || 0,
        solPair: !!x.solPair
      });
    });
  }
  function coinPicked(mint) {
    try {
      return !!JSON.parse(localStorage.getItem('cs_coin_picks_v1') || '{}')[mint];
    } catch (e) {
      return false;
    }
  }
  function rowHtml(c) {
    const n = scoreOf(c);
    const apeTot = coinApeTotal(c);
    const wallets = (c.wallets || []).filter(Boolean);
    const on = coinPicked(c.mint);
    return (
      '<tr>' +
      '<td style="padding:10px 8px;border-bottom:1px solid #243041;font-weight:800;color:#e8eef6;white-space:nowrap">' +
      '<button type="button" data-cs-mint="' +
      esc(c.mint || '') +
      '" data-cs-wallets="' +
      esc(wallets.join(',')) +
      '" data-cs-on="' +
      (on ? '1' : '0') +
      '" style="border:1px solid ' +
      (on ? '#f5a14a' : '#3d4d63') +
      ';background:' +
      (on ? '#2a1c0e' : 'transparent') +
      ';color:' +
      (on ? '#f5a14a' : '#e8eef6') +
      ';border-radius:8px;padding:4px 8px;font-weight:800;font-size:13px;cursor:pointer">' +
      esc(coinLabel(c)) +
      ' · ' +
      (on ? 'added' : 'add') +
      '</button>' +
      (fmtMc(c.mcap) ? '<span style="margin-left:8px;color:#62e3a0;font-size:12px">' + esc(fmtMc(c.mcap)) + '</span>' : '') +
      (c.mint
        ? '<a href="' +
          esc(dexHref(c.mint)) +
          '" target="_blank" rel="noopener" style="margin-left:8px;color:#6eb6ff;font-size:11px;font-weight:800">Dex</a>'
        : '') +
      '</td>' +
      '<td style="padding:10px 8px;border-bottom:1px solid #243041;text-align:center;font-weight:900;color:#e6c878">' +
      n +
      (apeTot > 0
        ? '<div style="font-size:11px;color:#62e3a0;font-weight:800">' + esc(fmtUsd(apeTot)) + '</div>'
        : '') +
      '</td>' +
      '<td style="padding:10px 8px;border-bottom:1px solid #243041;font-size:12px;color:#c5d0dc">' +
      walletCell(c) +
      '</td>' +
      '</tr>'
    );
  }
  async function paint(mode) {
    mode = mode === 'old' ? 'old' : 'coins';
    ensure();
    paintChips(mode);
    const list = document.getElementById('wt-list');
    if (list) list.innerHTML = '<div style="color:#8491a1;font-size:12px">Loading\u2026</div>';
    let j = {};
    try {
      const r = await fetch(apiBase() + '/wallets', { cache: 'no-store' });
      j = await r.json();
    } catch (e) {
      if (list) list.innerHTML = '<div style="color:#ff6f7c">' + esc(e.message || e) + '</div>';
      return;
    }
    if (!list) return;
    let coins;
    if (mode === 'old') {
      coins = await enrich(j.oldCoins || []);
      coins = coins
        .filter(function (c) {
          return c.solPair && +c.mcap >= 1e6;
        })
        .sort(function (a, b) {
          return scoreOf(b) - scoreOf(a);
        });
      if (!coins.length) {
        list.innerHTML =
          '<div style="color:#8491a1;font-size:12px">Old Coins: SOL pairs only, 5+ wallets, MC ≥ $1M.</div>';
        return;
      }
    } else {
      coins = await enrich(j.coins || []);
      coins = coins
        .filter(function (c) {
          return c.solPair && +c.mcap >= 50000;
        })
        .sort(function (a, b) {
          return scoreOf(b) - scoreOf(a);
        });
      if (!coins.length) {
        list.innerHTML =
          lookupBox() +
          '<div style="color:#8491a1;font-size:12px">No SOL-pair overlap coins with MC ≥ $50k yet.</div>';
        return;
      }
    }
    const solPx = await fetchSolUsd();
    coins = coins.map(function (c) {
      return Object.assign({}, c, { solUsd: solPx });
    });
    list.innerHTML =
      (mode === 'coins' ? lookupBox() : '') +
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">' +
      '<thead><tr>' +
      '<th style="text-align:left;padding:8px;color:#8491a1;font-size:11px;letter-spacing:.06em">NAME / MC</th>' +
      '<th style="text-align:center;padding:8px;color:#8491a1;font-size:11px;letter-spacing:.06em">WALLETS / APE</th>' +
      '<th style="text-align:left;padding:8px;color:#8491a1;font-size:11px;letter-spacing:.06em">WALLET · USD APE · AGO</th>' +
      '</tr></thead><tbody>' +
      coins.map(rowHtml).join('') +
      '</tbody></table></div>';
    startAgo();
  }
  window.setWalletInnerCoins = function (mode) {
    paint(mode);
  };
  if (document.getElementById('wallets-panel')) ensure();
})();
