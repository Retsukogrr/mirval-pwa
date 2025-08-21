const CACHE_VERSION = 'mirval-v5';
const STATIC_ASSETS = [
  './','./index.html','./aventure.html','./manifest.webmanifest','./sw.js','./offline.html',
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
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./aventure.html').then(cached => cached || fetch(req).catch(() => caches.match('./offline.html')))
    );
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