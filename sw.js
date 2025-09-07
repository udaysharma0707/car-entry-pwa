// sw.js - use relative paths (./) so GitHub Pages subpath works correctly
const CACHE_NAME = 'car-entry-cache-v1';
const FILES_TO_CACHE = [
  './',
  'index.html',
  'app.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', (evt) => {
  console.log('[SW] install - caching files', FILES_TO_CACHE);
  evt.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.addAll(FILES_TO_CACHE);
        console.log('[SW] all files cached');
      } catch (err) {
        console.error('[SW] cache.addAll() failed:', err);
        // If caching fails, still allow activation (so page JS can load)
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  console.log('[SW] activate');
  evt.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => { if (k !== CACHE_NAME) return caches.delete(k); })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') return;
  evt.respondWith(
    caches.match(evt.request).then(resp => {
      return resp || fetch(evt.request).catch(() => caches.match('index.html'));
    })
  );
});
