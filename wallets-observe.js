/* Overlay — Coin selection = overlap score. Not a buy signal. */
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
  function dexHref(mint) {
    mint = String(mint || '').trim();
    const web = 'https://dexscreener.com/solana/' + mint;
    if (/android/i.test(navigator.userAgent || '')) {
      return (
        'intent://dexscreener.com/solana/' +
        mint +
        '#Intent;scheme=https;package=com.dexscreener;S.browser_fallback_url=' +
        encodeURIComponent(web) +
        ';end'
      );
    }
    return web;
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
    if (!document.querySelector('#wallets-panel .wt-tab[data-wt="coins"]')) {
      const row = card.querySelector('.wt-tab') && card.querySelector('.wt-tab').parentNode;
      if (row) {
        const html =
          '<button type="button" class="wt-tab" data-wt="coins" style="padding:8px 12px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#c5d0dc;font-weight:800;font-size:12px;cursor:pointer">Coin selection</button>';
        const lead = row.querySelector('.wt-tab[data-wt="leaders"]');
        if (lead) lead.insertAdjacentHTML('afterend', html);
        else row.insertAdjacentHTML('afterbegin', html);
      }
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
    if (wt === 'coins') {
      ev.preventDefault();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      ev.stopPropagation();
      if (window.setWalletInner) window.setWalletInner('coins');
      else paint();
    }
  }
  function walletCell(c) {
    const handles = c.handles || [];
    const wallets = c.wallets || [];
    const bits = [];
    const n = Math.max(handles.length, wallets.length);
    for (let i = 0; i < n; i++) {
      const h = handles[i] || '';
      const w = wallets[i] || '';
      const label = h ? '@' + h : shortCa(w);
      const copyVal = w || h;
      bits.push(
        '<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0">' +
          '<span>' +
          esc(label) +
          '</span>' +
          (copyVal
            ? '<button type="button" data-copy="' +
              esc(copyVal) +
              '" data-copy-label="copy" style="border:0;background:#1a2430;color:#6eb6ff;border-radius:6px;padding:2px 6px;font-size:10px;font-weight:800;cursor:pointer">copy</button>'
            : '') +
          '</span>'
      );
    }
    return bits.join('') || '—';
  }
  function rowHtml(c) {
    const n = scoreOf(c);
    return (
      '<tr>' +
      '<td style="padding:10px 8px;border-bottom:1px solid #243041;font-weight:800;color:#e8eef6;word-break:break-word">' +
      esc(c.name || shortCa(c.mint)) +
      (c.mint
        ? '<div><a href="' +
          esc(dexHref(c.mint)) +
          '" style="color:#6eb6ff;font-size:11px">Dex app</a></div>'
        : '') +
      '</td>' +
      '<td style="padding:10px 8px;border-bottom:1px solid #243041;text-align:center;font-weight:900;color:#e6c878">' +
      n +
      '</td>' +
      '<td style="padding:10px 8px;border-bottom:1px solid #243041;font-size:12px;color:#c5d0dc">' +
      walletCell(c) +
      '</td>' +
      '</tr>'
    );
  }
  async function paint() {
    ensure();
    paintChips('coins');
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
    const coins = (j.coins || []).slice().sort(function (a, b) {
      return scoreOf(b) - scoreOf(a);
    });
    if (!coins.length) {
      list.innerHTML =
        '<div style="color:#8491a1;font-size:12px">No overlap coins yet. A mint shows when 2+ watched wallets buy it.</div>';
      return;
    }
    list.innerHTML =
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">' +
      '<thead><tr>' +
      '<th style="text-align:left;padding:8px;color:#8491a1;font-size:11px;letter-spacing:.06em">NAME</th>' +
      '<th style="text-align:center;padding:8px;color:#8491a1;font-size:11px;letter-spacing:.06em">WALLETS</th>' +
      '<th style="text-align:left;padding:8px;color:#8491a1;font-size:11px;letter-spacing:.06em">WALLETS / COPY</th>' +
      '</tr></thead><tbody>' +
      coins.map(rowHtml).join('') +
      '</tbody></table></div>';
  }
  window.setWalletInnerCoins = function () {
    paint();
  };
  if (document.getElementById('wallets-panel')) ensure();
})();
