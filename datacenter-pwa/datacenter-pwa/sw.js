/* ================================================================
   sw.js — Service Worker
   Data Center Manager PWA
   Estrategia: Cache-first para assets estáticos,
               Network-first para datos (localStorage no necesita SW)
================================================================ */

const CACHE_NAME  = 'dcm-cache-v1';
const CACHE_URLS  = [
  './index.html',
  './styles.css',
  './db.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ── INSTALL: pre-cache todos los assets ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CACHE_URLS);
    })
  );
  // Activa el SW de inmediato sin esperar recarga
  self.skipWaiting();
});

// ── ACTIVATE: elimina cachés viejos ──────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  // Toma control de todas las pestañas abiertas inmediatamente
  self.clients.claim();
});

// ── FETCH: Cache-first con fallback a red ────────────────────────
self.addEventListener('fetch', event => {
  // Solo interceptamos peticiones GET del mismo origen
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Actualiza el cache en background (stale-while-revalidate)
        const networkFetch = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {}); // silencia errores de red en background
        return cached;
      }
      // No está en cache → ir a la red
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Sin red y sin cache: devuelve una página de error offline simple
        return new Response(
          '<html><body style="font-family:monospace;background:#0b0e14;color:#e8eef6;padding:40px">' +
          '<h2>⬛ DC Manager</h2><p>Sin conexión. Los datos guardados siguen disponibles al volver online.</p>' +
          '</body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        );
      });
    })
  );
});
