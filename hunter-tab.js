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
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&', '<': '<', '>': '>', '"': '"' }[c];
    });
  }
  function toolBtn(label, title, url, on, tool, ca) {
    const col = on ? '#06281a' : '#121a24';
    const fg = on ? '#62e3a0' : '#c5d0dc';
    const bd = on ? '#1a9b6c' : '#243041';
    return (
      '<button type="button" class="hu-tool" data-hu-tool="' +
      tool +
      '" data-hu-ca="' +
      esc(ca) +
      '" data-hu-url="' +
      esc(url) +
      '" title="' +
      esc(title) +
      (on ? ' · verified' : '') +
      '" style="width:32px;height:32px;border-radius:9px;border:1px solid ' +
      bd +
      ';background:' +
      col +
      ';color:' +
      fg +
      ';font-weight:900;font-size:10px;letter-spacing:.04em;cursor:pointer">' +
      label +
      '</button>'
    );
  }

  function renderHits(hits) {
    if (!hits || !hits.length) {
      return '<div style="padding:14px;border-radius:12px;border:1px solid #243041;color:#8491a1;font-size:13px">No hunter names right now. Worker looks every ~5 min for organic 5m/1h pops (not Dex Trending). Quiet / low-liq / stretched coins stay hidden.</div>';
    }
    return hits
      .map(function (h) {
        const v = h.verified || {};
        const links = h.links || {};
        const both = v.bubblemaps && v.trench;
        const caShort = h.ca && h.ca.length > 12 ? h.ca.slice(0, 6) + '…' + h.ca.slice(-4) : h.ca || '';
        return (
          '<div style="padding:12px 14px;border-radius:12px;border:1px solid #243041;background:#0b121a">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<div style="font-weight:900;font-size:15px;color:#e8eef6;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          esc(h.name) +
          (both
            ? ' <span title="You verified Bubblemaps + Trench" style="font-size:10px;color:#06281a;background:#62e3a0;font-weight:900;padding:2px 7px;border-radius:999px">OK</span>'
            : '') +
          (h.boosted ? ' <span style="font-size:10px;color:#f0a060;font-weight:800">PAID BOOST</span>' : '') +
          (h.saved ? ' <span style="font-size:10px;color:#62e3a0;font-weight:800">SAVED</span>' : '') +
          '</div>' +
          '<div style="display:flex;gap:6px;align-items:center">' +
          toolBtn('BM', 'Bubblemaps holder clusters', links.bubblemaps, v.bubblemaps, 'bubblemaps', h.ca) +
          toolBtn('TR', 'Trench Radar bundles / clusters', links.trench, v.trench, 'trench', h.ca) +
          toolBtn('RC', 'RugCheck.xyz', links.rugcheck, v.rugcheck, 'rugcheck', h.ca) +
          '</div></div>' +
          '<div style="margin-top:6px;font-size:12px;color:#c5d0dc;line-height:1.45">' +
          'score ' +
          (h.score != null ? h.score : '—') +
          ' · Dex 5m ' +
          (h.m5 >= 0 ? '+' : '') +
          (h.m5 != null ? Number(h.m5).toFixed(1) : '—') +
          '% · 1h ' +
          (h.h1 >= 0 ? '+' : '') +
          (h.h1 != null ? Number(h.h1).toFixed(1) : '—') +
          '% · vol ' +
          (h.volX || '—') +
          'x · liq $' +
          (h.liq ? Math.round(h.liq).toLocaleString() : '—') +
          (h.ageMin != null ? ' · age ' + (h.ageMin < 60 ? h.ageMin + 'm' : Math.round(h.ageMin / 60) + 'h') : '') +
          '</div>' +
          '<div style="margin-top:4px;font-size:11px;color:#8491a1">' +
          caShort +
          ' · click BM / TR / RC to scan — icon turns green after you open it</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
          '<button type="button" class="hu-save" data-hu-ca="' +
          esc(h.ca) +
          '" style="padding:6px 10px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#e6c878;font-weight:700;font-size:11px;cursor:pointer">' +
          (h.saved ? 'On watchlist' : 'Save to Breakout') +
          '</button>' +
          (links.dex
            ? '<a href="' +
              esc(links.dex) +
              '" target="_blank" rel="noopener" style="padding:6px 10px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#6eb6ff;font-weight:700;font-size:11px;text-decoration:none">DexScreener</a>'
            : '') +
          '<a href="scanner.html" target="_blank" rel="noopener" class="hu-scanner" data-hu-ca="' +
          esc(h.ca) +
          '" style="padding:6px 10px;border-radius:8px;border:1px solid #243041;background:#121a24;color:#c5d0dc;font-weight:700;font-size:11px;text-decoration:none">Full scanner</a>' +
          '</div></div>'
        );
      })
      .join('');
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
          localStorage.setItem('scannerChain', 'sol');
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
      if (stEl)
        stEl.textContent =
          hits.length +
          ' names · last scan ' +
          fmtAgo(+j.scannedAt) +
          (j.error ? ' · ' + j.error : '') +
          ' · no phone pings from this tab';
      if (list) list.innerHTML = renderHits(hits);
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
