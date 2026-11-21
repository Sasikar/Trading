self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim().then(function () {
    return caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }).then(function () {
      return self.clients.matchAll({ type: 'window' });
    }).then(function (list) {
      return Promise.all(list.map(function (c) {
        if (!c.url || c.url.indexOf('home.html') !== -1) return null;
        var u = new URL(c.url);
        if (u.pathname.endsWith('/index.html') || u.pathname.endsWith('/')) {
          var dir = u.pathname.endsWith('/') ? u.pathname : u.pathname.replace(/index\.html$/, '');
          return c.navigate(dir + 'home.html?fresh=' + Date.now());
        }
        return null;
      }));
    });
  }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, { cache: 'no-store' }));
});
