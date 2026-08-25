(() => {
  if (document.getElementById('site-nav')) return;

  const links = [
    ['Overview', 'index.html'],
    ['Markets', 'watchlist.html'],
    ['Pulse', 'pulse.html'],
    ['Catalysts', 'market-catalysts.html'],
    ['Process', 'pre-entry-checklist.html'],
    ['Research', 'upload.html']
  ];

  const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  const style = document.createElement('style');
  style.textContent = `
    #site-nav{position:sticky;top:0;z-index:9999;width:100%;height:72px;background:rgba(7,10,15,.94);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;gap:24px;padding:0 24px;box-sizing:border-box;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
    #site-nav .site-brand{flex:0 0 auto;color:#f4f7fb;text-decoration:none;font-size:14px;font-weight:900;letter-spacing:.18em;white-space:nowrap}
    #site-nav .site-brand i{color:#62e3a0;font-style:normal}
    #site-nav .site-links{display:flex;align-items:center;gap:4px;min-width:0;overflow-x:auto;scrollbar-width:none}
    #site-nav .site-links::-webkit-scrollbar{display:none}
    #site-nav .site-link{color:#7f8b9b;text-decoration:none;font-size:13px;font-weight:650;padding:11px 13px;border-radius:10px;white-space:nowrap;transition:.15s ease}
    #site-nav .site-link:hover{color:#f4f7fb;background:rgba(255,255,255,.06)}
    #site-nav .site-link.active{color:#f4f7fb;background:rgba(98,227,160,.10);box-shadow:inset 0 0 0 1px rgba(98,227,160,.18)}
    @media(max-width:700px){#site-nav{height:64px;padding:0 14px;gap:12px}#site-nav .site-brand{font-size:12px}#site-nav .site-link{font-size:12px;padding:9px 10px}}
  `;
  document.head.appendChild(style);

  const nav = document.createElement('nav');
  nav.id = 'site-nav';
  nav.setAttribute('aria-label', 'Trading navigation');
  nav.innerHTML = `<a class="site-brand" href="index.html">TRADING<i>.</i></a><div class="site-links">${links.map(([label, href]) => `<a class="site-link ${current === href ? 'active' : ''}" href="${href}">${label}</a>`).join('')}</div>`;

  const existing = document.querySelector('nav.nav');
  if (existing) existing.replaceWith(nav);
  else document.body.insertBefore(nav, document.body.firstChild);
})();
