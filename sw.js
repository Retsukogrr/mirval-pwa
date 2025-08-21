// Basic offline-first Service Worker
const CACHE_VERSION = 'mirval-v1';
const STATIC_ASSETS = [
  './',
  './aventure.html',
  './manifest.webmanifest',
  './sw.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => k !== CACHE_VERSION ? caches.delete(k) : Promise.resolve())
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Navigation requests: serve app shell
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./aventure.html').then(cached => cached || fetch(req).catch(() => caches.match('./offline.html')))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then(cache => cache.put(req, copy));
      return res;
    }).catch(() => cached))
  );
});
