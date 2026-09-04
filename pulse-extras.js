(() => {
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 2) =>
    n == null || !isFinite(n)
      ? '—'
      : n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

  async function yahooMeta(symbol) {
    const r = await fetch('/api/yf?symbol=' + encodeURIComponent(symbol), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j;
  }

  
  function biasVix(price){
    if(price==null||!isFinite(price)) return {label:'—', color:'#7f8791'};
    if(price < 12) return {label:'EXTREME BULLISH', color:'#62e3a0'};
    if(price < 15) return {label:'BULLISH', color:'#62e3a0'};
    if(price < 20) return {label:'NEUTRAL', color:'#e6c878'};
    if(price < 25) return {label:'CAUTION', color:'#e6a050'};
    if(price < 30) return {label:'BEARISH', color:'#ff6f7c'};
    return {label:'EXTREME BEARISH', color:'#ff6f7c'};
  }
  function biasDxy(pct){
    if(pct==null||!isFinite(pct)) return {label:'—', color:'#7f8791'};
    // rising DXY often risk-off for crypto
    if(pct >= 0.4) return {label:'BEARISH (for crypto)', color:'#ff6f7c'};
    if(pct >= 0.15) return {label:'MILD BEARISH', color:'#e6a050'};
    if(pct <= -0.4) return {label:'BULLISH (for crypto)', color:'#62e3a0'};
    if(pct <= -0.15) return {label:'MILD BULLISH', color:'#62e3a0'};
    return {label:'NEUTRAL', color:'#e6c878'};
  }
  function biasTnx(pct){
    if(pct==null||!isFinite(pct)) return {label:'—', color:'#7f8791'};
    if(pct >= 0.05) return {label:'RISK-OFF lean', color:'#e6a050'};
    if(pct <= -0.05) return {label:'RISK-ON lean', color:'#62e3a0'};
    return {label:'NEUTRAL', color:'#e6c878'};
  }

  async function loadRiskStrip() {
    const el = $('risk-strip-body');
    if (!el) return;
    const specs = [
      { id: 'dxy', label: 'DXY', symbol: 'DX-Y.NYB', alt: 'DX=F' },
      { id: 'vix', label: 'VIX', symbol: '^VIX' },
      { id: 'tnx', label: 'US10Y', symbol: '^TNX' },
    ];
    let snap = null;
    try {
      const r = await fetch('./macro-strip.json?v=' + Date.now(), { cache: 'no-store' });
      if (r.ok) snap = await r.json();
    } catch (e) {}
    try {
      const results = await Promise.all(
        specs.map(async (s) => {
          try {
            return { ...s, ...(await yahooMeta(s.symbol)), src: 'LIVE' };
          } catch (e) {
            if (s.alt) {
              try {
                return { ...s, ...(await yahooMeta(s.alt)), src: 'LIVE' };
              } catch (_) {}
            }
            if (snap && snap[s.id] && snap[s.id].price != null) {
              return { ...s, price: snap[s.id].price, pct: snap[s.id].pct || 0, src: 'SNAPSHOT' };
            }
            return { ...s, price: null, pct: 0, src: '' };
          }
        })
      );
      el.innerHTML = results
        .map((r) => {
          const up = (r.pct || 0) >= 0;
          const col = r.price == null ? '#7f8791' : up ? '#35d98a' : '#ef3f4f';
          const arrow = r.price == null ? '' : up ? '▲' : '▼';
          const tag = r.src === 'LIVE' ? 'LIVE' : r.src === 'SNAPSHOT' ? 'SNAP' : '';
          const bias = r.id==='vix' ? biasVix(r.price) : r.id==='dxy' ? biasDxy(r.pct) : biasTnx(r.pct);
          return `<div class="risk-item">
            <div class="risk-label">${r.label}${tag ? ' · '+tag : ''}</div>
            <div class="risk-price" style="color:${col}">${r.price == null ? '—' : fmt(r.price, r.id === 'tnx' ? 3 : 2)}</div>
            <div class="risk-chg" style="color:${col}">${r.price == null ? '' : arrow + ' ' + Math.abs(r.pct || 0).toFixed(2) + '%'}</div>
            <div class="risk-bias" style="color:${bias.color};font-size:11px;font-weight:900;margin-top:8px;letter-spacing:.04em">${bias.label}</div>
          </div>`;
        })
        .join('');
    } catch (e) {
      el.innerHTML = '<div class="risk-item"><div class="risk-label">Macro</div><div class="risk-price">—</div></div>';
    }
  }

  async function loadFunding() {
    const el = $('funding-body');
    const badge = $('funding-badge');
    if (!el) return;
    try {
      const [btc, eth] = await Promise.all([
        fetch('/api/funding?symbol=BTCUSDT', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/funding?symbol=ETHUSDT', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      const rows = [
        { sym: 'BTC', rate: parseFloat(btc.lastFundingRate) * 100 },
        { sym: 'ETH', rate: parseFloat(eth.lastFundingRate) * 100 },
      ];
      let extreme = false;
      el.innerHTML = rows
        .map((r) => {
          const abs = Math.abs(r.rate);
          const isExt = abs >= 0.05;
          if (isExt) extreme = true;
          const col = r.rate >= 0 ? '#35d98a' : '#ef3f4f';
          const tag = isExt ? '<span class="ext-flag">EXTREME</span>' : '';
          return `<div class="fund-row">
            <span class="fund-sym">${r.sym}</span>
            <span class="fund-rate" style="color:${col}">${r.rate >= 0 ? '+' : ''}${fmt(r.rate, 4)}%</span>
            ${tag}
            <span class="fund-hint">${r.rate > 0 ? 'Longs pay shorts' : 'Shorts pay longs'}</span>
          </div>`;
        })
        .join('');
      if (badge) {
        badge.textContent = extreme ? 'EXTREME' : 'OK';
        badge.className = 'badge' + (extreme ? '' : ' zero');
        if (extreme) badge.style.background = '#ef3f4f';
      }
      window.__pulseFunding = rows;
    } catch (e) {
      el.innerHTML = '<div class="zero">Funding data unavailable.</div>';
      if (badge) {
        badge.textContent = '—';
        badge.className = 'badge zero';
      }
    }
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  async function loadCalendar() {
    const el = $('cal-list');
    if (!el) return;
    const today = startOfDay(new Date());
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    try {
      const j = await fetch('./data/calendar-7d.json?v=' + Date.now(), { cache: 'no-store' }).then((r) =>
        r.json()
      );
      const events = (j.events || [])
        .map((e) => ({ ...e, _d: startOfDay(e.date + 'T00:00:00') }))
        .filter((e) => e._d >= today && e._d < end)
        .sort((a, b) => a._d - b._d || a.title.localeCompare(b.title));
      if (!events.length) {
        el.innerHTML =
          '<div class="zero">No dated events in the next 7 days. Update data/calendar-7d.json.</div>';
        return;
      }
      el.innerHTML = events
        .map((e) => {
          const day = e._d.toLocaleDateString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          });
          const impact = (e.impact || 'med').toLowerCase();
          return `<div class="cal-row impact-${impact}">
            <div class="cal-day">${day}</div>
            <div class="cal-main">
              <div class="cal-title">${escapeHtml(e.title)}</div>
              <div class="cal-meta">${escapeHtml(e.type || '')} · ${escapeHtml(e.time || '')} · ${impact.toUpperCase()}</div>
            </div>
          </div>`;
        })
        .join('');
    } catch (e) {
      el.innerHTML = '<div class="zero">Could not load calendar.</div>';
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  const NOTES_KEY = 'pulse_why_moved_v1';
  function readNotes() {
    try {
      return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
    } catch {
      return [];
    }
  }
  function writeNotes(list) {
    localStorage.setItem(NOTES_KEY, JSON.stringify(list.slice(0, 50)));
  }
  function renderNotes() {
    const el = $('why-list');
    if (!el) return;
    const list = readNotes();
    if (!list.length) {
      el.innerHTML = '<div class="zero">No notes yet. Log big moves so you remember the cause.</div>';
      return;
    }
    el.innerHTML = list
      .map(
        (n, i) => `<div class="why-row">
        <div class="why-top"><b>${escapeHtml(n.asset)}</b> · ${escapeHtml(n.date)}
          <button type="button" data-del="${i}" class="why-del">✕</button></div>
        <div class="why-text">${escapeHtml(n.note)}</div>
      </div>`
      )
      .join('');
    el.querySelectorAll('[data-del]').forEach((btn) => {
      btn.onclick = () => {
        const list = readNotes();
        list.splice(+btn.dataset.del, 1);
        writeNotes(list);
        renderNotes();
      };
    });
  }
  function setupNotesForm() {
    const form = $('why-form');
    if (!form) return;
    form.onsubmit = (e) => {
      e.preventDefault();
      const asset = $('why-asset').value.trim() || 'BTC';
      const note = $('why-note').value.trim();
      if (!note) return;
      const list = readNotes();
      list.unshift({
        asset,
        note,
        date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
      });
      writeNotes(list);
      $('why-note').value = '';
      renderNotes();
    };
  }

  const ALERTS_KEY = 'pulse_alert_rules_v1';
  const defaultRules = {
    fundingExtreme: true,
    vixHigh: true,
    vixThreshold: 25,
    notify: false,
  };
  function readRules() {
    try {
      return { ...defaultRules, ...JSON.parse(localStorage.getItem(ALERTS_KEY) || '{}') };
    } catch {
      return { ...defaultRules };
    }
  }
  function writeRules(r) {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(r));
  }
  function setupAlertsUI() {
    const rules = readRules();
    const fund = $('rule-funding');
    const vix = $('rule-vix');
    const notify = $('rule-notify');
    if (fund) fund.checked = !!rules.fundingExtreme;
    if (vix) vix.checked = !!rules.vixHigh;
    if (notify) notify.checked = !!rules.notify;
    const save = () => {
      const next = {
        fundingExtreme: fund ? fund.checked : true,
        vixHigh: vix ? vix.checked : true,
        vixThreshold: 25,
        notify: notify ? notify.checked : false,
      };
      writeRules(next);
      if (next.notify && Notification && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      runAlerts();
    };
    [fund, vix, notify].forEach((el) => el && el.addEventListener('change', save));
  }

  async function runAlerts() {
    const box = $('alert-status');
    if (!box) return;
    const rules = readRules();
    const msgs = [];
    if (rules.fundingExtreme && window.__pulseFunding) {
      window.__pulseFunding.forEach((r) => {
        if (Math.abs(r.rate) >= 0.05) {
          msgs.push(`${r.sym} funding extreme: ${r.rate.toFixed(4)}%`);
        }
      });
    }
    try {
      const v = await yahooMeta('^VIX');
      if (rules.vixHigh && v.price >= (rules.vixThreshold || 25)) {
        msgs.push(`VIX elevated: ${v.price.toFixed(2)} (≥ ${rules.vixThreshold})`);
      }
      window.__pulseVix = v.price;
    } catch (_) {}

    if (!msgs.length) {
      box.innerHTML = '<div class="zero">No active alerts. Rules are watching while Pulse is open.</div>';
      return;
    }
    box.innerHTML = msgs.map((m) => `<div class="alert-msg">⚠ ${escapeHtml(m)}</div>`).join('');
    if (rules.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      msgs.forEach((m) => {
        try {
          new Notification('Trading Pulse', { body: m });
        } catch (_) {}
      });
    }
  }

  function boot() {
    loadRiskStrip();
    loadFunding().then(() => runAlerts());
    loadCalendar();
    setupNotesForm();
    renderNotes();
    setupAlertsUI();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
