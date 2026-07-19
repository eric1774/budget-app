// v2: rewritten for the authenticated web app (Phase 2 UAT findings).
// v1 served cached index.html for EVERY navigation (cache-first), which
// ghosted auth pages (/auth/login showed the dashboard shell) and kept dead
// sessions on screen. Navigations are now network-first; auth and API
// traffic is never intercepted. Bumping CACHE_NAME purges v1's poisoned
// cache on every installed device via the activate handler.
const CACHE_NAME = 'olson-finance-v2';
const APP_SHELL = ['/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      // Shell precache is best-effort — never fail the install over it
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle our own origin — browser extensions inject chrome-extension://
  // resources whose scheme Cache.put rejects
  if (url.origin !== self.location.origin) {
    return;
  }

  // Auth flow and API data must always be live — never cached, never faked
  if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/')) {
    return;
  }

  // Navigations: network-first. An authenticated app must never serve a
  // stale shell for a live navigation (it outlives the session and looks
  // broken); the cached shell is only an offline fallback.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets (hashed filenames): cache-first is safe
  if (url.pathname.match(/\.(js|css|png|ico|webmanifest)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});
