/* PWA offline cache: increment CACHE_VERSION for every release. */
'use strict';
const CACHE_VERSION = 'gs1-dm-v6-2';
const APP_FILES = [
  './', './index.html', './style.css', './script.js', './scanner.js',
  './vendor/datamatrix.js', './pwa.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('gs1-dm-') && k !== CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => {
    if (response.ok && response.type === 'basic') {
      const clone = response.clone();
      caches.open(CACHE_VERSION).then(cache => cache.put(req, clone)).catch(() => {});
    }
    return response;
  }).catch(() => req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
