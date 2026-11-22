/* GS1 PWA v6.10: network-first HTML, cache-first immutable offline assets. */
'use strict';
const CACHE_VERSION = 'gs1-dm-v6-10';
const APP_FILES = [
  './', './index.html', './style.css', './script.js', './scanner.js',
  './vendor/datamatrix.js', './vendor/zxing/reader.js',
  './vendor/zxing/zxing_reader.wasm', './pwa.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('gs1-dm-') && key !== CACHE_VERSION)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Ignore tracking/query parameters for offline fallback. Always try current HTML.
    event.respondWith(
      fetch(request, { cache: 'no-store' }).then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_VERSION)
            .then(cache => cache.put('./index.html', copy))
            .catch(() => {}));
        }
        return response;
      }).catch(async () => {
        const cache = await caches.open(CACHE_VERSION);
        return (await cache.match('./index.html')) || Response.error();
      })
    );
    return;
  }

  // Other app assets are versioned by CACHE_VERSION and available offline.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cached => cached ||
      fetch(request).then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_VERSION)
            .then(cache => cache.put(request, copy))
            .catch(() => {}));
        }
        return response;
      })
    )
  );
});
