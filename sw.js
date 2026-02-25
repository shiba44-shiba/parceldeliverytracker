/**
 * sw.js - Minimal Service Worker
 *
 * Provides offline caching for the app shell so the tracker
 * continues to work even with intermittent connectivity.
 */

const CACHE_NAME = 'parcel-tracker-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/tracker.js',
  '/js/notifications.js',
  '/js/email.js',
  '/js/app.js',
  '/manifest.json',
];

// Install – pre-cache app shell
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing – caching app shell…');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate – clean old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating – cleaning old caches…');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch – network-first, fall back to cache
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        console.log('[ServiceWorker] Network unavailable – serving from cache:', event.request.url);
        return caches.match(event.request);
      })
  );
});
