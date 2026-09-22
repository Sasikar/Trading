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
  function rowHtml(c) {
    const n = scoreOf(c);
    const apeTot = coinApeTotal(c);
    return (
      '<tr>' +
      '<td style="padding:10px 8px;border-bottom:1px solid #243041;font-weight:800;color:#e8eef6;white-space:nowrap">' +
      '<span>' +
      esc(coinLabel(c)) +
      '</span>' +
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
          '<div style="color:#8491a1;font-size:12px">No SOL-pair overlap coins with MC ≥ $50k yet.</div>';
        return;
      }
    }
    const solPx = await fetchSolUsd();
    coins = coins.map(function (c) {
      return Object.assign({}, c, { solUsd: solPx });
    });
    list.innerHTML =
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">' +
      '<thead><tr>' +
      '<th style="text-align:left;padding:8px;color:#8491a1;font-size:11px;letter-spacing:.06em">NAME / MC</th>' +
      '<th style="text-align:center;padding:8px;color:#8491a1;font-size:11px;letter-spacing:.06em">WALLETS / APE</th>' +
      '<th style="text-align:left;padding:8px;color:#8491a1;font-size:11px;letter-spacing:.06em">WALLET · USD APE</th>' +
      '</tr></thead><tbody>' +
      coins.map(rowHtml).join('') +
      '</tbody></table></div>';
  }
  window.setWalletInnerCoins = function (mode) {
    paint(mode);
  };
  if (document.getElementById('wallets-panel')) ensure();
})();
