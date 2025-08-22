// sw.js — Mirval PWA (force update)
const CACHE_VERSION = 'mirval-v10'; // ⬅︎ change à chaque release
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const PRECACHE = [
  '/',            // si ta page d’accueil redirige vers play.html
  '/mirval-pwa/', // garde si ton site est dans /mirval-pwa/
  '/mirval-pwa/play.html',
  '/mirval-pwa/game.js?v=10',          // ⬅︎ versionné
  '/mirval-pwa/manifest.webmanifest',
  '/mirval-pwa/offline.html',
  '/mirval-pwa/icons/icon-192.png',
  '/mirval-pwa/icons/icon-512.png',
];

// Installe et pré-cache
self.addEventListener('install', (event) => {
  self.skipWaiting(); // ⬅︎ prend la main de suite
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE)));
});

// Active et nettoie les vieux caches
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== STATIC_CACHE ? caches.delete(k) : null)));
    await self.clients.claim(); // ⬅︎ contrôle immédiat des pages
  })());
});

// Stratégie: Network-First pour HTML (toujours vérifier s’il y a une maj)
// Cache-First pour le reste
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const isHTML = req.headers.get('accept')?.includes('text/html');

  if (isHTML) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(STATIC_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || caches.match('/mirval-pwa/offline.html');
      }
    })());
    return;
  }

  // Cache-First pour JS/CSS/images
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(STATIC_CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      return cached; // dernier recours
    }
  })());
});
