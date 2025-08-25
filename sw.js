/* sw.js — Aventurier de Mirval v10
   Objectif: éviter que d’anciennes versions de game.js restent en cache.
   Stratégies:
   - HTML/JS/CSS : Network-first (toujours tenter la version en ligne, sinon cache)
   - Images/icônes : Cache-first (performances)
   - Outils: CLEAR_CACHE manuel + SKIP_WAITING
*/

const CACHE_VERSION = 'v10.8';           // <- INCRÉMENTE à chaque release
const RUNTIME_CACHE = `mirval-runtime-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  // Met seulement le strict minimum. Évite de pré-cacher game.js pour ne pas figer une vieille version.
  './',
  './index.html',        // si tu as une page d’accueil
  './play.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.addAll(PRECACHE_URLS.map(u => new Request(u, {cache:'reload'})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map(k => (k !== RUNTIME_CACHE) ? caches.delete(k) : Promise.resolve())
    );
    self.clients.claim();
  })());
});

/* Helper: détermine le type de ressource */
function isHTML(req){ return req.mode === 'navigate' || (req.headers.get('accept')||'').includes('text/html'); }
function isJS(req){ return req.destination === 'script' || req.url.endsWith('.js'); }
function isCSS(req){ return req.destination === 'style' || req.url.endsWith('.css'); }
function isAsset(req){ return ['image','font'].includes(req.destination); }

/* Network-first pour HTML/JS/CSS (évite les vieilles versions)
   Cache-first pour images/fonts (perf)
*/
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // On ne gère que même origine
  if (url.origin !== location.origin) return;

  // Network-first pour HTML/JS/CSS
  if (isHTML(req) || isJS(req) || isCSS(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, {cache:'no-store'});
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        const cached = await caches.match(req);
        if (cached) return cached;
        // fallback minimal sur la home si rien
        return caches.match('./play.html') || Response.error();
      }
    })());
    return;
  }

  // Cache-first pour images & polices
  if (isAsset(req)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Par défaut: network-first léger
  event.respondWith((async () => {
    try {
      return await fetch(req, {cache:'no-store'});
    } catch (_) {
      return (await caches.match(req)) || Response.error();
    }
  })());
});

/* Messages utilitaires depuis la page:
   - SKIP_WAITING : activer immédiatement la nouvelle version
   - CLEAR_CACHE  : purger tout le cache
*/
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (msg.type === 'CLEAR_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    })());
  }
});
