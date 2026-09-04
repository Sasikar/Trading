(()=>{if(document.getElementById('site-nav'))return;
// Unregister stale service workers that pin old HTML
if('serviceWorker' in navigator){
  navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});
  if(window.caches)caches.keys().then(ks=>ks.forEach(k=>caches.delete(k))).catch(()=>{});
}
const primary=[['Overview','index.html',true],['Pulse','pulse.html',true],['Markets','watchlist.html',false],['Memes','memes.html',false],['Portfolio','portfolio.html',false],['Catalysts','market-catalysts.html',false],['Process','pre-entry-checklist.html',false],['Scanner','scanner.html',false],['Tax','tax-qa.html',false],['Goals','goals.html',false],['Health','health.html',false]];
const current=(location.pathname.split('/').pop()||'index.html').toLowerCase();
const isActive=h=>current===h.split('?')[0].toLowerCase();
const style=document.createElement('style');
style.textContent=`html{scroll-padding-top:56px}body{padding-top:56px!important}
#site-nav{position:fixed;top:0;left:0;right:0;z-index:9999;height:52px;display:flex;align-items:center;gap:6px;padding:0 10px 0 12px;background:rgba(8,12,18,.96);backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,.08);font-family:Inter,system-ui,sans-serif;box-sizing:border-box}
#site-nav .site-brand{color:#f4f7fb;text-decoration:none;font-size:14px;font-weight:900;letter-spacing:.12em;flex-shrink:0}
#site-nav .site-brand i{color:#62e3a0;font-style:normal}
#site-nav .site-links{display:flex;align-items:center;gap:2px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}
#site-nav .site-links::-webkit-scrollbar{display:none}
#site-nav .site-link{color:#9aa6b5;text-decoration:none;font-size:13px;font-weight:650;padding:8px 10px;border-radius:9px;white-space:nowrap;flex-shrink:0}
#site-nav .site-link.pri{font-size:15px;font-weight:800;color:#d5dde8;padding:8px 12px}
#site-nav .site-link.active{color:#f4f7fb!important;background:rgba(98,227,160,.14)!important}`;
document.head.appendChild(style);
const nav=document.createElement('nav');nav.id='site-nav';
nav.innerHTML=`<a class="site-brand" href="index.html">TRADING<i>.</i></a><div class="site-links">${primary.map(([l,h,pri])=>`<a class="site-link${pri?' pri':''}${isActive(h)?' active':''}" href="${h}">${l}</a>`).join('')}</div>`;
document.body.insertBefore(nav,document.body.firstChild);
})();
