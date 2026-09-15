/* Sentiment tab — X posts from the phone + Binance listings. No CoinGecko. */
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
  let selected = '';
  let lock = false;
  const steps = [];
  const BULL = /\b(moon|pump|bullish|breakout|listing|listed|send it|cook|cooking|gem|accumulate|ath|break ?out|going up|momentum feels real)\b/i;
  const BEAR = /\b(rug|dump|scam|dead|exit|jeet|fake|honeypot|sell[- ]off|going to zero)\b/i;
  const SPAM = /pump-voting|netlify\.app\/vote|claim airdrop|free mint|connect wallet to claim/i;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      if (c === '&') return '&' + 'amp;';
      if (c === '<') return '&' + 'lt;';
      if (c === '>') return '&' + 'gt;';
      return '&' + 'quot;';
    });
  }
  function logStep(line) {
    steps.push(String(line || ''));
    const el = $('st-log');
    if (!el) return;
    el.innerHTML = steps
      .map(function (s, i) {
        return '<div><b>' + (i + 1) + '.</b> ' + esc(s) + '</div>';
      })
      .join('');
  }
  function startLog(name) {
    steps.length = 0;
    logStep('You picked ' + (name || '—') + ' on this phone.');
    logStep('Cloudflare does not call X (search is logged-in) and does not call CoinGecko.');
  }
  function fillSelect(sel, rows, label) {
    if (!sel) return;
    const list = rows || [];
    if (sel.dataset.len === String(list.length) && sel.options.length > 1) {
      return;
    }
    sel.innerHTML =
      '<option value="">' +
      esc(label) +
      '</option>' +
      list
        .map(function (r) {
          return '<option value="' + esc(r.ca) + '">' + esc(r.name || r.ca.slice(0, 6)) + '</option>';
        })
        .join('');
    sel.dataset.len = String(list.length);
  }
  function scorePosts(posts, name) {
    let bull = 0,
      bear = 0,
      spam = 0,
      real = 0;
    (posts || []).forEach(function (p) {
      const t = String(p.text || '');
      if (SPAM.test(t)) {
        spam++;
        p.kind = 'spam';
        return;
      }
      real++;
      const b = BULL.test(t);
      const s = BEAR.test(t);
      if (b && !s) {
        bull++;
        p.kind = 'bull';
      } else if (s && !b) {
        bear++;
        p.kind = 'bear';
      } else p.kind = 'neu';
    });
    let label = 'QUIET';
    let why = 'Not enough readable posts to call a tone.';
    if (spam && spam >= Math.max(2, (posts || []).length * 0.6)) {
      label = 'SPAM-HEAVY';
      why = spam + ' of ' + posts.length + ' posts look like vote-farm / claim links, not organic talk.';
    } else if (real >= 2 && bull > bear * 1.5) {
      label = 'BULLISH';
      why = bull + ' bullish vs ' + bear + ' bearish among non-spam posts.';
    } else if (real >= 2 && bear > bull * 1.5) {
      label = 'BEARISH';
      why = bear + ' bearish vs ' + bull + ' bullish among non-spam posts.';
    } else if (real >= 2) {
      label = 'MIXED';
      why = 'Split tone · bull ' + bull + ' · bear ' + bear + ' · spam ' + spam + '.';
    } else if (posts && posts.length) {
      label = 'NOISY';
      why = 'Posts found but almost all filtered as spam or too short.';
    }
    return { label, why, bull, bear, spam, n: (posts || []).length };
  }
  function parseJina(md, name) {
    const needle = String(name || '').replace(/^\$/, '');
    const blocks = String(md || '')
      .split(/\n{2,}/)
      .map(function (b) {
        return b.replace(/\s+/g, ' ').trim();
      })
      .filter(function (b) {
        if (b.length < 24 || b.length > 420) return false;
        if (/log in|sign up|javascript|cookie|privacy policy|just a moment/i.test(b)) return false;
        if (needle && needle.length >= 3 && !new RegExp(needle, 'i').test(b) && !/\$/.test(b)) return false;
        return true;
      });
    const out = [];
    const seen = {};
    blocks.forEach(function (b) {
      const key = b.slice(0, 80);
      if (seen[key]) return;
      seen[key] = 1;
      const m = b.match(/@([A-Za-z0-9_]{2,15})/);
      out.push({ user: m ? m[1] : '', text: b });
    });
    return out.slice(0, 10);
  }
  async function fetchX(r) {
    const name = r.symbol || r.name || '';
    const q = r.xQuery || '$' + name;
    const inner = r.xUrl || 'https://x.com/search?q=' + encodeURIComponent(q) + '&f=live';
    const key = 'st_x_' + String(r.ca || name).toLowerCase();
    try {
      const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (cached && Date.now() - cached.at < 10 * 60e3) return cached;
    } catch (e) {}
    const urls = ['https://r.jina.ai/' + inner, 'https://r.jina.ai/http://x.com/search?q=' + encodeURIComponent(q) + '&f=live'];
    let err = '';
    for (let i = 0; i < urls.length; i++) {
      try {
        const res = await fetch(urls[i], { headers: { Accept: 'text/plain' } });
        const text = await res.text();
        if (/AuthenticationRequiredError|bad IP reputation|Just a moment/i.test(text)) {
          err = 'X/Jina blocked this IP';
          continue;
        }
        if (!res.ok) {
          err = 'HTTP ' + res.status;
          continue;
        }
        const posts = parseJina(text, name);
        const sc = scorePosts(posts, name);
        const out = { posts, score: sc, err: '', at: Date.now() };
        try {
          sessionStorage.setItem(key, JSON.stringify(out));
        } catch (e2) {}
        return out;
      } catch (e) {
        err = String(e && e.message ? e.message : e);
      }
    }
    return { posts: [], score: scorePosts([], name), err: err || 'could not read X', at: Date.now() };
  }

  function paint(j, x) {
    const box = $('st-board');
    const stEl = $('st-status');
    fillSelect($('st-saved'), j.saved, 'Saved CAs — pick one');
    fillSelect($('st-hunter'), j.hunter, 'Hunter CAs — pick one');
    lock = true;
    const saved = $('st-saved');
    const hunter = $('st-hunter');
    const inSaved = (j.saved || []).some(function (r) {
      return selected && r.ca.toLowerCase() === selected.toLowerCase();
    });
    if (saved) saved.value = inSaved ? selected : '';
    if (hunter) hunter.value = selected && !inSaved ? selected : '';
    lock = false;
    const r = j.report;
    if (stEl)
      stEl.textContent =
        (j.saved || []).length +
        ' saved · ' +
        (j.hunter || []).length +
        ' hunter' +
        (x && x.score ? ' · X ' + x.score.label : '');
    if (j.error && !r) {
      box.innerHTML = '<div class="st-find">' + esc(j.error) + '</div>';
      return;
    }
    if (!r) {
      box.innerHTML = '<div class="st-note">Pick a saved CA or a hunter CA. We read live X search on your phone and score the post text. CoinGecko is not used.</div>';
      return;
    }
    const sc = (x && x.score) || {};
    const col =
      sc.label === 'BULLISH' ? '#62e3a0' : sc.label === 'BEARISH' ? '#ff6f7c' : sc.label === 'SPAM-HEAVY' ? '#f0a060' : '#e6c878';
    const vote =
      '<div class="st-vote"><b style="color:' +
      col +
      '">' +
      esc(sc.label || 'READING X…') +
      '</b><span>' +
      esc(sc.why || (x && x.err) || 'Fetching posts') +
      '</span></div>';
    const xfind = [];
    if (x && x.err && !(x.posts || []).length) {
      xfind.push('Could not pull X HTML here (' + x.err + '). Open Live search and read it yourself — we do not invent a score.');
    } else if (x && x.score) {
      xfind.push(x.score.why);
      if (x.score.spam) xfind.push(x.score.spam + ' spam/vote-farm posts were not counted as hype.');
    }
    const findings =
      '<div class="st-h">FINDINGS</div><ul class="st-ul">' +
      xfind.concat(r.findings || [])
        .map(function (f) {
          return '<li>' + esc(f) + '</li>';
        })
        .join('') +
      '</ul>';
    const posts = (x && x.posts) || [];
    const postHtml =
      '<div class="st-h">X POSTS</div>' +
      (posts.length
        ? posts
            .map(function (p) {
              const kcol = p.kind === 'bull' ? '#62e3a0' : p.kind === 'bear' ? '#ff6f7c' : p.kind === 'spam' ? '#f0a060' : '#8491a1';
              return (
                '<div class="st-row"><b style="color:' +
                kcol +
                '">' +
                esc(p.kind || '') +
                (p.user ? ' @' + p.user : '') +
                '</b><span>' +
                esc(p.text) +
                '</span></div>'
              );
            })
            .join('')
        : '<div class="st-note">No post text parsed yet.</div>') +
      '<a class="st-row" href="' +
      esc(r.xUrl) +
      '" target="_blank" rel="noopener"><b>Open live X</b><span>' +
      esc(r.xQuery || '') +
      '</span></a>';
    const up =
      '<div class="st-h">UPCOMING / BINANCE DESK</div>' +
      (r.upcoming && r.upcoming.length
        ? r.upcoming
            .map(function (a) {
              return (
                '<a class="st-row" href="' +
                esc(a.url) +
                '" target="_blank" rel="noopener"><b>Binance</b><span>' +
                esc(a.title) +
                '</span></a>'
              );
            })
            .join('')
        : '<div class="st-note">No Binance New Listing title matched this ticker in the latest 20 posts.</div>');
    box.innerHTML =
      '<div class="st-head"><div class="st-name">' +
      esc(r.name) +
      '</div><div class="st-meta">' +
      esc(r.xQuery || r.ca) +
      '</div></div>' +
      vote +
      findings +
      postHtml +
      up +
      '<div class="st-note">' +
      esc(r.source) +
      (r.fetchError ? ' · ' + r.fetchError : '') +
      '</div>';
  }

  async function load(force) {
    const box = $('st-board');
    const stEl = $('st-status');
    try {
      if (!steps.length) startLog(selected ? selected.slice(0, 8) : 'lists only');
      if (stEl) stEl.textContent = selected ? 'Running…' : 'Loading lists…';
      logStep(selected ? 'Ask worker for Binance listing match on this CA.' : 'Ask worker for saved + hunter dropdowns only.');
      const q = selected
        ? '/sentiment?ca=' + encodeURIComponent(selected) + (force ? '&force=1' : '')
        : '/sentiment';
      const res = await fetch(apiBase() + q, { cache: 'no-store' });
      const j = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) j.error = j.error || 'HTTP ' + res.status;
      if (j.error && !j.report) logStep('Worker error: ' + j.error);
      else if (j.report) {
        logStep(
          'Worker ok · ' +
            (j.report.name || '') +
            ' · X query ' +
            (j.report.xQuery || '') +
            ' · Binance matches ' +
            ((j.report.upcoming || []).length)
        );
      } else logStep('Dropdowns loaded. Pick a coin — nothing scored yet.');
      paint(j, null);
      if (j.report && j.report.xUrl) {
        logStep('This phone reads X live search (not the worker).');
        const x = await fetchX(j.report);
        if (x.err && !(x.posts || []).length) logStep('X read failed: ' + x.err + ' · tap Open live X.');
        else {
          logStep(
            'Parsed ' +
              ((x.posts || []).length) +
              ' posts · ' +
              ((x.score && x.score.label) || '?') +
              ' · ' +
              ((x.score && x.score.why) || '')
          );
        }
        paint(j, x);
      }
      if (stEl) stEl.textContent = selected ? 'Done' : (j.saved || []).length + ' saved';
    } catch (e) {
      logStep('Failed: ' + (e && e.message ? e.message : e));
      if (stEl) stEl.textContent = 'load failed';
      if (box) box.innerHTML = '<div class="st-find">' + esc(e && e.message ? e.message : e) + '</div>';
    }
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
      'inmemory-panel',
      'verdict-panel'
    ].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.style.display = 'none';
      el.classList.remove('on');
      if (id === 'tf-panels') el.classList.add('hidden');
    });
    ['showBreakoutMemes', 'showHunter', 'showHolders', 'showFailures', 'showInMemory', 'showVerdict'].forEach(
      function (fn) {
        try {
          window[fn](false);
        } catch (e) {}
      }
    );
  }
  function showSentiment(on) {
    const p = $('sentiment-panel');
    if (on) {
      hideOthers();
      if (p) {
        p.style.display = 'block';
        p.classList.add('on');
      }
      load(false);
    } else if (p) {
      p.style.display = 'none';
      p.classList.remove('on');
    }
  }
  window.showSentiment = showSentiment;
  window.refreshSentimentTab = function () {
    return load(true);
  };
  function bind() {
    const saved = $('st-saved');
    const hunter = $('st-hunter');
    function pick(from, other, listLabel) {
      if (lock) return;
      selected = from.value || '';
      const name = from.options[from.selectedIndex] ? from.options[from.selectedIndex].text : selected;
      lock = true;
      if (other) other.value = '';
      lock = false;
      startLog(name + ' (' + listLabel + ')');
      load(false);
    }
    if (saved)
      saved.onchange = function () {
        pick(saved, hunter, 'saved CA');
      };
    if (hunter)
      hunter.onchange = function () {
        pick(hunter, saved, 'hunter CA');
      };
  }
  const tabs = document.getElementById('tf-tabs');
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('[data-tf]');
      if (!b) return;
      setTimeout(function () {
        const act = document.querySelector('#tf-tabs .tab.active');
        const tf = act && act.getAttribute('data-tf');
        if (tf !== 'sentiment') showSentiment(false);
      }, 0);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
