/* Hunter tab — display only. Dex scan + ranking live on the Cloudflare worker. */
(function () {
  function apiBase() {
    try {
      if (window.BREAKOUT_API) return String(window.BREAKOUT_API).replace(/\/+$/, '');
    } catch (e) {}
    const h = location.hostname;
    if (h === 'sasikar.github.io' || /\.github\.io$/.test(h)) return 'https://trading-ohlcv.sasipudi.workers.dev';
    if (h === 'trading.sasipudi.workers.dev' || h === 'trading-ohlcv.sasipudi.workers.dev')
      return 'https://trading-ohlcv.sasipudi.workers.dev';
    return location.origin + '/api';
  }
  const $ = (id) => document.getElementById(id);
  let timer = null;
  let busy = false;

  function fmtAgo(ms) {
    const n = Number(ms);
    if (!n) return '—';
    const s = Math.round((Date.now() - n) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return s + 's ago';
    const m = Math.round(s / 60);
    if (m < 60) return m + 'm ago';
    return Math.round(m / 60) + 'h ago';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      if (c === '&') return '&' + 'amp;';
      if (c === '<') return '&' + 'lt;';
      if (c === '>') return '&' + 'gt;';
      return '&' + 'quot;';
    });
  }
  function money(n) {
    n = +n || 0;
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
    return '$' + Math.round(n);
  }
  function volM(n) {
    n = +n || 0;
    if (!(n > 0)) return '';
    const m = n / 1e6;
    const s = m >= 100 ? m.toFixed(0) : m >= 10 ? m.toFixed(1) : m.toFixed(2);
    return '$' + s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1') + 'M';
  }
  const TOOLS_SOL = [
    { id: 'bubblemaps', title: 'Bubblemaps', domain: 'bubblemaps.io' },
    { id: 'trench', title: 'Trench Radar', domain: 'trench.bot' },
    { id: 'rugcheck', title: 'RugCheck', domain: 'rugcheck.xyz' },
    { id: 'defade', title: 'DeFade', domain: 'defade.org' },
    { id: 'solsniffer', title: 'SolSniffer', domain: 'solsniffer.com' }
  ];
  const TOOLS_ETH = [
    { id: 'bubblemaps', title: 'Bubblemaps', domain: 'bubblemaps.io' },
    { id: 'honeypot', title: 'Honeypot.is', domain: 'honeypot.is' },
    { id: 'goplus', title: 'GoPlus', domain: 'gopluslabs.io' }
  ];
  const TOOLS_RH = [
    { id: 'bubblemaps', title: 'Bubblemaps', domain: 'bubblemaps.io' },
    { id: 'tokensniffer', title: 'Token Sniffer', domain: 'tokensniffer.com' },
    { id: 'dex', title: 'DexScreener', domain: 'dexscreener.com' }
  ];
  function chainKind(chain) {
    const c = String(chain || '').toLowerCase();
    if (c === 'ethereum' || c === 'eth') return 'eth';
    if (c === 'robinhood' || c === 'hood' || c === 'rh') return 'rh';
    return 'sol';
  }
  function isSol(chain) {
    return chainKind(chain) === 'sol';
  }
  function chainBadge(chain) {
    const kind = chainKind(chain);
    const src =
      kind === 'eth'
        ? 'https://cdn.dexscreener.com/cms/chain/ethereum.png'
        : kind === 'rh'
          ? 'https://cdn.dexscreener.com/cms/chain/robinhood.png'
          : 'https://cdn.dexscreener.com/cms/chain/solana.png';
    const label = kind === 'eth' ? 'ETH' : kind === 'rh' ? 'HOOD' : 'SOL';
    return (
      '<img src="' +
      src +
      '" alt="' +
      label +
      '" title="' +
      label +
      '" width="16" height="16" style="width:16px;height:16px;border-radius:50%;flex-shrink:0;background:#121a24" />'
    );
  }
  function toolBtn(tool, url, on, ca) {
    const bd = on ? '#1a9b6c' : '#243041';
    const bg = on ? '#06281a' : '#121a24';
    const icon =
      'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(tool.domain) + '&sz=64';
    return (
      '<button type="button" class="hu-tool" data-hu-tool="' +
      tool.id +
      '" data-hu-ca="' +
      esc(ca) +
      '" data-hu-url="' +
      esc(url) +
      '" title="' +
      esc(tool.title) +
      (on ? ' · verified' : ' · open scan') +
      '" style="width:36px;height:36px;padding:0;border-radius:10px;border:2px solid ' +
      bd +
      ';background:' +
      bg +
      ';cursor:pointer;display:inline-flex;align-items:center;justify-content:center">' +
      '<img src="' +
      icon +
      '" alt="' +
      esc(tool.title) +
      '" width="20" height="20" style="border-radius:4px;display:block" />' +
      '</button>'
    );
  }
  const BANDS = [
    { id: 'micro', label: 'Micro', range: '$20k–$100k liq' },
    { id: 'small', label: 'Small', range: '$100k–$1M liq' },
    { id: 'mid', label: 'Mid', range: '$1M–$10M liq' },
    { id: 'large', label: 'Large', range: '$10M–$100M liq' }
  ];

  function renderCard(h) {
    const v = h.verified || {};
    const links = h.links || {};
    const kind = chainKind(h.chain);
    const both =
      kind === 'sol' ? v.bubblemaps && v.trench : kind === 'rh' ? v.bubblemaps : v.bubblemaps && v.honeypot;
    const tools = kind === 'sol' ? TOOLS_SOL : kind === 'rh' ? TOOLS_RH : TOOLS_ETH;
    const caShort = h.ca && h.ca.length > 12 ? h.ca.slice(0, 6) + '…' + h.ca.slice(-4) : h.ca || '';
    return (
      '<div style="padding:12px 14px;border-radius:12px;border:1px solid #243041;background:#0b121a">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<div style="font-weight:900;font-size:15px;color:#e8eef6;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      chainBadge(h.chain) +
      esc(h.name) +
      (both
        ? ' <span title="You verified the chain scanners" style="font-size:10px;color:#06281a;background:#62e3a0;font-weight:900;padding:2px 7px;border-radius:999px">OK</span>'
        : '') +
      ((h.highVol || (h.vol24h && h.liq && h.vol24h >= 0.12 * h.liq)) ? ' <span title="24h volume" style="font-size:11px;color:#f8fbff;background:#10263a;font-weight:900;padding:3px 8px;border-radius:999px;letter-spacing:.03em;border:1px solid #3d7ab8">V ' + esc(volM(h.vol24h) || '—') + '</span>' : '') +
      (h.boosted ? ' <span style="font-size:10px;color:#f0a060;font-weight:800">PAID BOOST</span>' : '') +
      (h.saved ? ' <span style="font-size:10px;color:#62e3a0;font-weight:800">HUNTER WATCH</span>' : '') +
      (h.onBreakout ? ' <span style="font-size:10px;color:#8491a1;font-weight:800">SAVED CA</span>' : '') +
      '</div>' +
      '<div style="display:flex;gap:6px;align-items:center">' +
      tools.map(function (t) {
        return toolBtn(t, links[t.id], v[t.id], h.ca);
      }).join('') +
      '</div></div>' +
      '<div style="margin-top:6px;font-size:12px;color:#c5d0dc;line-height:1.45">' +
      'Dex 5m ' +
      (h.m5 >= 0 ? '+' : '') +
      (h.m5 != null ? Number(h.m5).toFixed(1) : '—') +
      '% · 1h ' +
      (h.h1 >= 0 ? '+' : '') +
      (h.h1 != null ? Number(h.h1).toFixed(1) : '—') +
      '% · liq ' +
      money(h.liq) +
      (h.vol24h ? ' · vol 24h ' + money(h.vol24h) : '') +
      (h.mcap ? ' · mcap ' + money(h.mcap) : '') +
      (h.ageMin != null ? ' · age ' + (h.ageMin < 60 ? h.ageMin + 'm' : Math.round(h.ageMin / 60) + 'h') : '') +
      '</div>' +
      '<div style="margin-top:4px;font-size:11px;color:#8491a1">' +
      caShort +
      ' · tap a site icon to scan — green ring after you open it</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
      '<button type="button" class="hu-save" data-hu-ca="' +
      esc(h.ca) +
      '" style="padding:6px 10px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#e6c878;font-weight:700;font-size:11px;cursor:pointer">' +
      (h.saved ? 'Unwatch' : 'Hunter watch') +
      '</button>' +
      (links.dex
        ? '<a href="' +
          esc(links.dex) +
          '" target="_blank" rel="noopener" style="padding:6px 10px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#6eb6ff;font-weight:700;font-size:11px;text-decoration:none">DexScreener</a>'
        : '') +
      '<a href="scanner.html" target="_blank" rel="noopener" class="hu-scanner" data-hu-ca="' +
      esc(h.ca) +
      '" data-hu-chain="' +
      (kind === 'sol' ? 'sol' : kind === 'rh' ? 'robinhood' : '1') +
      '" style="padding:6px 10px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#c5d0dc;font-weight:700;font-size:11px;text-decoration:none">Full scanner</a>' +
      '</div></div>'
    );
  }

  function renderWatch(list) {
    const rows = list || [];
    if (!rows.length) {
      return (
        '<div style="padding:10px 12px;border-radius:10px;border:1px dashed #243041;color:#8491a1;font-size:12px">Nothing on Hunter watch. This list is not your saved CAs and does not run in Breakout.</div>'
      );
    }
    return rows.map(renderCard).join('');
  }

  function renderHits(hits) {
    const by = { micro: [], small: [], mid: [], large: [] };
    (hits || []).forEach(function (h) {
      const b = h.band || '';
      if (by[b]) by[b].push(h);
    });
    return BANDS.map(function (band) {
      const rows = by[band.id] || [];
      const body = rows.length
        ? rows.map(renderCard).join('')
        : '<div style="padding:10px 12px;border-radius:10px;border:1px dashed #243041;color:#8491a1;font-size:12px">None moving in this band right now.</div>';
      return (
        '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">' +
        '<div style="font-size:13px;font-weight:900;color:#e8eef6">' +
        band.label +
        '</div>' +
        '<div style="font-size:11px;color:#8491a1">' +
        band.range +
        ' · ' +
        rows.length +
        ' · V $xM = 24h volume</div></div>' +
        body +
        '</div>'
      );
    }).join('');
  }

  async function api(path, opt) {
    const r = await fetch(apiBase() + path, Object.assign({ cache: 'no-store' }, opt || {}));
    const text = await r.text();
    let j = null;
    try {
      j = JSON.parse(text);
    } catch (e) {
      throw new Error(r.ok ? 'bad JSON' : 'HTTP ' + r.status);
    }
    if (!r.ok) throw new Error((j && (j.error || j.message)) || 'HTTP ' + r.status);
    return j;
  }

  function bind() {
    document.querySelectorAll('.hu-tool').forEach(function (b) {
      b.onclick = async function () {
        const ca = b.getAttribute('data-hu-ca');
        const tool = b.getAttribute('data-hu-tool');
        const url = b.getAttribute('data-hu-url');
        if (url) window.open(url, '_blank', 'noopener');
        try {
          await api('/hunter/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ca: ca, tool: tool })
          });
        } catch (e) {}
        load(true);
      };
    });
    document.querySelectorAll('.hu-save').forEach(function (b) {
      b.onclick = async function () {
        try {
          await api('/hunter/save', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ca: b.getAttribute('data-hu-ca') })
          });
          load(true);
        } catch (e) {
          alert(e.message || e);
        }
      };
    });
    document.querySelectorAll('.hu-scanner').forEach(function (a) {
      a.onclick = function () {
        try {
          localStorage.setItem('scannerCA', a.getAttribute('data-hu-ca') || '');
          localStorage.setItem('scannerChain', a.getAttribute('data-hu-chain') || 'sol');
        } catch (e) {}
      };
    });
  }

  async function load(quiet) {
    if (busy) return;
    const list = $('hu-list');
    const stEl = $('hu-status');
    busy = true;
    if (list && !quiet) list.innerHTML = '<div style="color:#8491a1;font-size:12px">Reading hunter API…</div>';
    try {
      const j = await api('/hunter');
      const hits = j.hits || [];
      const watched = j.watch || [];
      if (stEl)
        stEl.textContent =
          hits.length +
          ' names · ' +
          watched.length +
          ' hunter-watch · last scan ' +
          fmtAgo(+j.scannedAt) +
          ' · next auto ~20 min' +
          (j.error ? ' · ' + j.error : '') +
          ' · no phone pings from this tab';
      if (list)
        list.innerHTML =
          '<div style="font-size:13px;font-weight:900;color:#e8eef6">Hunter watch</div>' +
          '<div style="font-size:11px;color:#8491a1;margin-top:-4px">Separate from CA recents. No breakout engine, no 1m tape, no alerts.</div>' +
          renderWatch(watched) +
          '<div style="height:8px"></div>' +
          renderHits(hits);
      bind();
    } catch (e) {
      if (stEl) stEl.textContent = String(e.message || e);
      if (list)
        list.innerHTML =
          '<div style="color:#ff6f7c;font-size:13px">Hunter API failed: ' + esc(e.message || e) + '</div>';
    }
    busy = false;
  }

  function showHunter(on) {
    const p = $('hunter-panel');
    const panels = $('tf-panels'),
      trend = $('trend-panel'),
      sp = $('struct-panel'),
      mp = $('macro-panel'),
      sg = $('signal-panel');
    const mg = $('memegate-panel'),
      cp = $('coin-panel'),
      af = $('antifomo-panel');
    if (on) {
      try {
        window.showBreakoutMemes(false);
      } catch (e) {}
      try {
        window.showVerdict(false);
      } catch (e) {}
      try {
        window.showHolders(false);
      } catch (e) {}
      try {
        window.showFailures(false);
      } catch (e) {}
      try {
        window.showInMemory(false);
      } catch (e) {}
      try {
        window.showSentiment(false);
      } catch (e) {}
      try {
        window.showKeep(false);
      } catch (e) {}
      if (panels) {
        panels.classList.add('hidden');
        panels.style.display = 'none';
      }
      [trend, sp, mp, sg].forEach(function (el) {
        if (el) {
          el.style.display = 'none';
          el.classList.remove('on');
        }
      });
      if (mg) mg.style.display = 'none';
      if (cp) {
        cp.style.display = 'none';
        cp.classList.remove('on');
      }
      if (af) af.style.display = 'none';
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      load(false);
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        const onp = $('hunter-panel');
        if (!onp || onp.style.display === 'none') return;
        load(true);
      }, 20000);
    } else {
      if (p) {
        p.style.display = 'none';
        p.classList.remove('on');
      }
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
  }

  window.showHunter = showHunter;
  window.refreshHunterTab = function () {
    return api('/hunter', { method: 'POST' }).then(function () {
      return load(false);
    });
  };

  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf !== 'hunter') showHunter(false);
      }, 0);
    });
  }
})();
