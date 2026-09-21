/* Overlay — Coins = overlap score. Not a buy signal. */
(function () {
  function apiBase() {
    try {
      if (window.BREAKOUT_API) return String(window.BREAKOUT_API).replace(/\/+$/, '');
    } catch (e) {}
    return 'https://trading-ohlcv.sasipudi.workers.dev';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function shortCa(ca) {
    ca = String(ca || '');
    return ca.length < 12 ? ca : ca.slice(0, 4) + '\u2026' + ca.slice(-4);
  }
  function scoreOf(c) {
    return +c.score || (c.wallets || []).length || 0;
  }
  function ensure() {
    const card = document.querySelector('#wallets-panel .card');
    if (!card) return;
    if (!document.querySelector('.wt-tab[data-wt="coins"]')) {
      const row = card.querySelector('.wt-tab') && card.querySelector('.wt-tab').parentNode;
      if (row) {
        const html =
          '<button type="button" class="wt-tab" data-wt="coins" style="padding:8px 12px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#c5d0dc;font-weight:800;font-size:12px;cursor:pointer">Coins</button>' +
          '<button type="button" class="wt-tab" data-wt="common" style="padding:8px 12px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#c5d0dc;font-weight:800;font-size:12px;cursor:pointer">Common</button>';
        const lead = row.querySelector('.wt-tab[data-wt="leaders"]');
        if (lead) lead.insertAdjacentHTML('afterend', html);
        else row.insertAdjacentHTML('afterbegin', html);
      }
    }
    if (!document.getElementById('wt-common-tabs')) {
      const list = document.getElementById('wt-list');
      const bar = document.createElement('div');
      bar.id = 'wt-common-tabs';
      bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 12px';
      if (list && list.parentNode) list.parentNode.insertBefore(bar, list);
    }
    card.addEventListener('click', onClick);
  }
  function onClick(ev) {
    const b = ev.target && ev.target.closest && ev.target.closest('.wt-tab');
    if (!b) return;
    const wt = b.getAttribute('data-wt');
    if (wt === 'coins' || wt === 'common') {
      ev.preventDefault();
      ev.stopPropagation();
      paint(wt, b.getAttribute('data-wallet') || '');
    } else if (wt === 'obs') {
      ev.preventDefault();
      ev.stopPropagation();
      paint('obs', b.getAttribute('data-wallet') || '');
    }
  }
  function cardCoin(c) {
    const n = scoreOf(c);
    const tag = n >= 3 ? 'CLUSTER' : n >= 2 ? 'OVERLAP' : 'SINGLE';
    return (
      '<div style="padding:14px;border-radius:14px;border:1px solid #243041;background:#0b121a;margin-bottom:10px">' +
      '<div style="font-weight:900;color:#e8eef6">' +
      esc(c.name || shortCa(c.mint)) +
      ' <span style="color:#e6c878;font-size:11px">score ' +
      n +
      ' \u00b7 ' +
      tag +
      '</span></div>' +
      '<div style="margin-top:6px;font-size:12px;color:#c5d0dc">' +
      n +
      ' wallets \u00b7 ' +
      esc((c.handles || []).map(function (h) { return '@' + h; }).join(' ')) +
      '</div>' +
      '<div style="margin-top:6px;font-size:11px;color:#8491a1;word-break:break-all">' +
      esc(c.mint) +
      '</div>' +
      (c.dexUrl
        ? '<div style="margin-top:8px"><a href="' +
          esc(c.dexUrl) +
          '" target="_blank" rel="noopener" style="color:#6eb6ff;font-weight:800;font-size:12px">DexScreener</a></div>'
        : '') +
      '</div>'
    );
  }
  function cardWal(c) {
    return (
      '<div style="padding:14px;border-radius:14px;border:1px solid #243041;background:#0b121a;margin-bottom:10px">' +
      '<div style="font-weight:900;color:#e8eef6">' +
      (c.handle ? '@' + esc(c.handle) : esc(shortCa(c.wallet))) +
      '</div>' +
      '<div style="margin-top:6px;font-size:12px;color:#e6c878">' +
      (c.sharedN || 0) +
      ' overlap coins</div>' +
      '<div style="margin-top:8px;font-size:11px;color:#8491a1;word-break:break-all">' +
      esc(c.wallet) +
      '</div>' +
      '<div style="margin-top:8px;display:flex;gap:12px">' +
      (c.solscan ? '<a href="' + esc(c.solscan) + '" target="_blank" rel="noopener" style="color:#6eb6ff;font-weight:800;font-size:12px">Solscan</a>' : '') +
      (c.gmgnUrl ? '<a href="' + esc(c.gmgnUrl) + '" target="_blank" rel="noopener" style="color:#6eb6ff;font-weight:800;font-size:12px">GMGN</a>' : '') +
      '<button type="button" class="wt-tab" data-wt="obs" data-wallet="' +
      esc(c.wallet) +
      '" style="border:0;background:transparent;color:#e6c878;font-weight:800;font-size:12px;cursor:pointer">Observe</button>' +
      '</div></div>'
    );
  }
  async function paint(mode, wallet) {
    ensure();
    const list = document.getElementById('wt-list');
    const host = document.getElementById('wt-common-tabs');
    if (list) list.innerHTML = '<div style="color:#8491a1;font-size:12px">Loading\u2026</div>';
    let j = {};
    try {
      const r = await fetch(apiBase() + '/wallets', { cache: 'no-store' });
      j = await r.json();
    } catch (e) {
      if (list) list.innerHTML = '<div style="color:#ff6f7c">' + esc(e.message || e) + '</div>';
      return;
    }
    const common = j.common || [];
    if (host) {
      host.innerHTML = common
        .map(function (c) {
          return (
            '<button type="button" class="wt-tab" data-wt="obs" data-wallet="' +
            esc(c.wallet) +
            '" style="padding:8px 12px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#c5d0dc;font-weight:800;font-size:12px;cursor:pointer">@' +
            esc(c.handle || shortCa(c.wallet)) +
            ' \u00b7 ' +
            (c.sharedN || 0) +
            '</button>'
          );
        })
        .join('');
    }
    if (!list) return;
    if (mode === 'common') {
      list.innerHTML = common.length
        ? common.map(cardWal).join('')
        : '<div style="color:#8491a1;font-size:12px">No overlap yet. Point a Helius webhook at /helius. Score = how many FOMO wallets bought the same mint.</div>';
    } else if (mode === 'obs' && wallet) {
      const w = common.find(function (c) { return c.wallet === wallet; });
      const coins = (j.coins || []).filter(function (c) {
        return (c.wallets || []).indexOf(wallet) >= 0;
      });
      list.innerHTML = (w ? cardWal(w) : '') + (coins.length ? coins.map(cardCoin).join('') : '<div style="color:#8491a1;font-size:12px">No overlap coins on this wallet yet.</div>');
    } else {
      const coins = (j.coins || []).slice().sort(function (a, b) {
        return scoreOf(a) - scoreOf(b);
      });
      list.innerHTML = coins.length
        ? coins.map(cardCoin).join('')
        : '<div style="color:#8491a1;font-size:12px">No overlap coins yet. Create a free Helius enhanced webhook (SWAP) to https://trading-ohlcv.sasipudi.workers.dev/helius with the top-100 SOL addresses. Coins appear when 2+ watched wallets buy the same mint. Not a buy list.</div>';
    }
  }
  window.setWalletInnerCoins = function () {
    paint('coins');
  };
  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function () {
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        if (act && act.getAttribute('data-tf') === 'wallets') ensure();
      }, 30);
    });
  }
  if (document.getElementById('wallets-panel')) ensure();
})();
