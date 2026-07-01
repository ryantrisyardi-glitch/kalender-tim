/* Kalender Tim — Service Worker
   Menyimpan app-shell (HTML/manifest/icons) agar aplikasi bisa dibuka (installable, PWA)
   dan tetap menampilkan tampilan terakhir saat offline. Data event/tugas tetap
   realtime lewat Firestore ketika online — permintaan ke domain lain (Firebase, Google
   Fonts, CDN) TIDAK dicache agresif, cukup diteruskan ke jaringan seperti biasa
   supaya data selalu yang terbaru. */

const CACHE_VERSION = 'kalender-tim-v1';
const APP_SHELL = [
  './index.html',
  './kalender.html',
  './admin.html',
  './privacy.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // jangan cache write/POST

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigasi antar halaman HTML: network-first, fallback ke cache saat offline
  if (req.mode === 'navigate' || (sameOrigin && req.headers.get('accept') && req.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const resClone = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Aset statis same-origin (manifest, icon): cache-first, update di background
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then(cached => {
        const fetchPromise = fetch(req).then(res => {
          const resClone = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(req, resClone));
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Lintas domain (Firebase Firestore/Auth, dsb): selalu ke jaringan, tidak dicache
  // supaya data event/tugas rutin selalu realtime.
});
