/* G-Trade Notes — one Keep link. No Google APIs. Opens Keep. */
(function () {
  const DEFAULT_URL = 'https://keep.google.com/';
  const STORE = 'trading.keepUrl';

  function $(id) {
    return document.getElementById(id);
  }

  function readUrl() {
    try {
      const v = (localStorage.getItem(STORE) || '').trim();
      if (/^https:\/\/keep\.google\.com\b/i.test(v)) return v;
    } catch (e) {}
    return DEFAULT_URL;
  }

  function writeUrl(u) {
    const s = String(u || '').trim();
    if (!/^https:\/\/keep\.google\.com\b/i.test(s)) return false;
    try {
      localStorage.setItem(STORE, s);
    } catch (e) {}
    return true;
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
      'inmemory-panel',
      'sentiment-panel'
    ].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
    [
      'showBreakoutMemes',
      'showHunter',
      'showHolders',
      'showFailures',
      'showVerdict',
      'showSentiment',
      'showInMemory'
    ].forEach(function (fn) {
      try {
        window[fn](false);
      } catch (e) {}
    });
  }

  function fill() {
    const inp = $('keep-url');
    if (inp && !inp.dataset.dirty) inp.value = readUrl();
  }

  function openKeep(url) {
    const dest = url || readUrl();
    const a = document.createElement('a');
    a.href = dest;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function saveLink() {
    const inp = $('keep-url');
    const btn = $('keep-save');
    const raw = inp ? inp.value.trim() : '';
    if (!writeUrl(raw)) {
      if (btn) {
        btn.textContent = 'keep.google.com only';
        setTimeout(function () {
          btn.textContent = 'Save link';
        }, 1600);
      }
      return;
    }
    if (inp) inp.dataset.dirty = '';
    fill();
    if (btn) {
      btn.textContent = 'Saved';
      setTimeout(function () {
        btn.textContent = 'Save link';
      }, 1400);
    }
  }

  function showKeep(on) {
    const p = $('keep-panel');
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

  window.showKeep = showKeep;
  window.openKeepLink = function () {
    openKeep();
  };
  window.saveKeepLink = saveLink;

  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf !== 'keep') showKeep(false);
      }, 0);
    });
  }

  const inp = $('keep-url');
  if (inp) {
    inp.addEventListener('input', function () {
      inp.dataset.dirty = '1';
    });
  }
})();
