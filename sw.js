self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim().then(function () {
    return caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }).then(function () {
      return self.clients.matchAll({ type: 'window' });
    }).then(function (list) {
      return Promise.all(list.map(function (c) {
        if (!c.url) return null;
        var u = new URL(c.url);
        if (u.search.indexOf('boot=') !== -1) return null;
        var dir = u.pathname.replace(/[^/]*$/, '');
        return c.navigate(dir + 'home.html?boot=' + Date.now());
      }));
    });
  }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, { cache: 'no-store' }));
});
