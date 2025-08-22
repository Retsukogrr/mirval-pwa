const CACHE_VERSION = 'mirval-v9';
const STATIC_ASSETS = [
  './','./index.html','./play.html','./manifest.webmanifest','./sw.js','./offline.html',
  './icons/icon-192.png','./icons/icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k!==CACHE_VERSION ? caches.delete(k):null))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    e.respondWith((async () => {
      try { // network-first
        const fresh = await fetch(req);
        const copy = fresh.clone();
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, copy);
        return fresh;
      } catch (err) {
        const cached = await caches.match('./play.html');
        return cached || caches.match('./offline.html');
      }
    })());
    return;
  }
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then(c => c.put(req, copy));
      return res;
    }).catch(() => cached))
  );
});
