/* Pumpfun Movers. Inline loader in index.html owns the tab when present. */
(function () {
  if (window.__pfInline) return;

  function apiBase() {
    try {
      if (window.BREAKOUT_API) return String(window.BREAKOUT_API).replace(/\/+$/, '');
    } catch (e) {}
    return 'https://trading-ohlcv.sasipudi.workers.dev';
  }
  const $ = (id) => document.getElementById(id);
  let timer = null;
  let rows = [];
  let note = '';
  const f = { maxMc: 150000, maxAge: 60, twitter: true, social: true, sort: 'mc' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&', '<': '<', '>': '>', '"': '"' })[c];
    });
  }
  function usd(n) {
    n = +n;
    if (!(n > 0)) return '—';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 10e6 ? 1 : 2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(n >= 100e3 ? 0 : 1) + 'k';
    return '$' + Math.round(n);
  }
  function ageMin(created) {
    const m = (Date.now() - (+created || 0)) / 60000;
    if (!(m >= 0)) return '';
    if (m < 1) return Math.max(1, Math.round(m * 60)) + 's';
    if (m < 60) return Math.round(m) + 'm';
    return Math.round(m / 60) + 'h';
  }
  function pass(c) {
    const age = (Date.now() - (+c.created || 0)) / 60000;
    if (!(age >= 0) || age > f.maxAge) return false;
    const mc = +c.mc || 0;
    const cap = +f.maxMc || 150000;
    const floor = Math.min(10000, cap);
    if (mc < floor || mc > cap) return false;
    if (f.twitter && !c.twitter) return false;
    const socials = [c.twitter, c.telegram, c.website].filter(Boolean).length;
    if (f.social && socials < 1) return false;
    return true;
  }
  function mult(mc) {
    const x = (+mc || 0) / 4500;
    if (!(x > 0)) return '';
    if (x < 1.05) return '';
    return x.toFixed(x >= 10 ? 0 : 1) + 'x';
  }
  function hideOthers() {
    [
      'showBreakoutMemes',
      'showHunter',
      'showKeep',
      'showHolders',
      'showSentiment',
      'showFailures',
      'showInMemory',
      'showVerdict',
      'showEntryWindow',
      'showPositionMonitor',
      'showWowDip',
      'showOmg',
      'showPitfalls',
      'showStrategy',
      'showDecisionCheck',
      'showGmgn',
      'showWallets'
    ].forEach(function (fn) {
      try {
        window[fn](false);
      } catch (e) {}
    });
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
      'inmemory-panel',
      'sentiment-panel',
      'keep-panel',
      'verdict-panel',
      'entrywindow-panel',
      'position-panel',
      'wowdip-panel',
      'omg-panel',
      'pitfalls-panel',
      'strategy-panel',
      'decision-panel',
      'gmgn-panel',
      'wallets-panel'
    ].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
  }
  function controls() {
    return (
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-bottom:10px">' +
      '<label style="font-size:11px;color:#8491a1;font-weight:800">MAX MC<br>' +
      '<input id="pf-mc" type="number" min="1000" step="1000" value="' +
      esc(f.maxMc) +
      '" style="margin-top:4px;width:110px;padding:8px;border-radius:8px;border:1px solid #243041;background:#0b121a;color:#e8eef6;font-weight:800">' +
      '</label>' +
      '<label style="font-size:11px;color:#8491a1;font-weight:800">MAX AGE MIN<br>' +
      '<input id="pf-age" type="number" min="1" step="1" value="' +
      esc(f.maxAge) +
      '" style="margin-top:4px;width:90px;padding:8px;border-radius:8px;border:1px solid #243041;background:#0b121a;color:#e8eef6;font-weight:800">' +
      '</label>' +
      '<label style="font-size:12px;color:#c5d0dc;font-weight:800;display:flex;gap:6px;align-items:center;padding-bottom:8px">' +
      '<input id="pf-tw" type="checkbox"' +
      (f.twitter ? ' checked' : '') +
      '> Twitter</label>' +
      '<label style="font-size:12px;color:#c5d0dc;font-weight:800;display:flex;gap:6px;align-items:center;padding-bottom:8px">' +
      '<input id="pf-soc" type="checkbox"' +
      (f.social ? ' checked' : '') +
      '> A social</label>' +
      '<button type="button" id="pf-sort" style="border:0;background:#121a24;color:#e8eef6;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer">' +
      (f.sort === 'new' ? 'Sort: newest' : 'Sort: MC') +
      '</button>' +
      '<button type="button" id="pf-go" style="border:0;background:#1a9b6c;color:#fff;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:900;cursor:pointer">Apply</button>' +
      '</div>'
    );
  }
  function card(c) {
    const x = mult(c.mc);
    const img = c.image && String(c.image).indexOf('https://') === 0
      ? '<img src="' +
        esc(c.image) +
        '" alt="" width="42" height="42" style="width:42px;height:42px;border-radius:10px;object-fit:cover;background:#121a24" referrerpolicy="no-referrer" loading="lazy">'
      : '<div style="width:42px;height:42px;border-radius:10px;background:#1a2430;color:#62e3a0;font-weight:900;display:flex;align-items:center;justify-content:center">' +
        esc(String(c.symbol || c.name || '?').slice(0, 1)) +
        '</div>';
    return (
      '<div style="display:flex;gap:10px;align-items:center;padding:10px 4px;border-bottom:1px solid #243041">' +
      img +
      '<div style="flex:1;min-width:0">' +
      '<div style="display:flex;justify-content:space-between;gap:8px">' +
      '<div style="font-weight:900;color:#e8eef6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
      esc(c.name || c.symbol || '—') +
      '</div>' +
      '<div style="font-weight:900;color:#e8eef6">' +
      esc(usd(c.mc)) +
      '</div></div>' +
      '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:2px;font-size:12px;color:#8491a1">' +
      '<span>' +
      esc(c.symbol || '') +
      ' · ' +
      esc(ageMin(c.created)) +
      (c.complete ? ' · bonded' : '') +
      '</span>' +
      '<span style="color:#62e3a0;font-weight:800">' +
      (x ? esc(x) : '') +
      '</span></div>' +
      '<div style="margin-top:4px;display:flex;gap:10px;flex-wrap:wrap">' +
      '<a href="https://pump.fun/coin/' +
      esc(c.mint) +
      '" target="_blank" rel="noopener" style="color:#6eb6ff;font-size:12px;font-weight:800">Pump</a>' +
      '<a href="https://dexscreener.com/solana/' +
      esc(c.mint) +
      '" target="_blank" rel="noopener" style="color:#6eb6ff;font-size:12px;font-weight:800">Dex</a>' +
      (c.twitter
        ? '<a href="' + esc(c.twitter) + '" target="_blank" rel="noopener" style="color:#6eb6ff;font-size:12px;font-weight:800">X</a>'
        : '') +
      '</div></div></div>'
    );
  }
  function paint() {
    const list = $('pump-list');
    if (!list) return;
    const hit = rows.filter(pass);
    hit.sort(function (a, b) {
      if (f.sort === 'new') return (+b.created || 0) - (+a.created || 0);
      return (+b.mc || 0) - (+a.mc || 0);
    });
    list.innerHTML =
      controls() +
      '<div style="font-size:12px;color:#8491a1;margin-bottom:8px">' +
      hit.length +
      ' match · scanned ' +
      rows.length +
      '</div>' +
      (hit.length
        ? hit.map(card).join('')
        : '<div style="color:#8491a1;font-size:13px">Nothing in this window. New coins land every few seconds — hit Apply again.</div>');
  }
  function readForm() {
    const mc = $('pf-mc');
    const age = $('pf-age');
    const tw = $('pf-tw');
    const soc = $('pf-soc');
    if (mc) f.maxMc = Math.max(1000, +mc.value || 150000);
    if (age) f.maxAge = Math.max(1, +age.value || 60);
    if (tw) f.twitter = !!tw.checked;
    if (soc) f.social = !!soc.checked;
  }
  async function load() {
    const st = $('pump-status');
    const list = $('pump-list');
    if (st) st.textContent = 'loading';
    if (list && !rows.length) list.innerHTML = '<div style="color:#e8eef6;font-size:13px;font-weight:800">Loading coins…</div>';
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const killer = ctrl ? setTimeout(function () { ctrl.abort(); }, 12000) : null;
    try {
      const r = await fetch(apiBase() + '/pumpfun', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
      const j = await r.json();
      rows = j.coins || [];
      note = j.note || j.err || j.error || '';
      if (!r.ok && !rows.length) throw new Error('HTTP ' + r.status);
      if (st) st.textContent = rows.length ? rows.length + ' fresh' : (j.err || j.error || 'empty');
      paint();
      if (!rows.length && (j.err || j.error)) {
        if (list) list.innerHTML = '<div style="color:#ff6f7c;font-weight:800">' + esc(j.err || j.error) + '</div>';
      }
    } catch (e) {
      const msg = e && e.name === 'AbortError' ? 'Timed out reaching the feed' : (e.message || e);
      if (st) st.textContent = 'error';
      if (list) list.innerHTML = '<div style="color:#ff6f7c;font-size:13px;font-weight:800">' + esc(msg) + '</div>';
    }
    if (killer) clearTimeout(killer);
  }
  function onClick(ev) {
    const go = ev.target && ev.target.closest && ev.target.closest('#pf-go');
    const sort = ev.target && ev.target.closest && ev.target.closest('#pf-sort');
    if (!go && !sort) return;
    ev.preventDefault();
    readForm();
    if (sort) f.sort = f.sort === 'mc' ? 'new' : 'mc';
    paint();
  }
  function showPumpfun(on) {
    const p = $('pumpfun-panel');
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      const card = p && p.querySelector('.card');
      if (card && !card.getAttribute('data-pf')) {
        card.setAttribute('data-pf', '1');
        card.addEventListener('click', onClick);
      }
      load();
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        const onp = $('pumpfun-panel');
        if (!onp || onp.style.display === 'none') return;
        load();
      }, 25000);
    } else if (p) {
      p.style.display = 'none';
      p.classList.remove('on');
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
  }
  window.showPumpfun = showPumpfun;
  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf === 'pumpfun') showPumpfun(true);
        else showPumpfun(false);
      }, 0);
    });
  }
  setTimeout(function () {
    const act = document.querySelector('#tf-tabs .tab.active');
    if (act && act.getAttribute('data-tf') === 'pumpfun') showPumpfun(true);
  }, 0);
})();
