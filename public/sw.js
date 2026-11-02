// The server replaces the version on every deploy, so the browser installs a fresh copy of the app.
const VERSION = '__APP_VERSION__';
const SHELL_CACHE = 'reparti-shell-' + VERSION;
const DATA_CACHE = 'reparti-data';
const FONT_CACHE = 'reparti-fonts';
const SHELL = ['/', '/app.css', '/app.js', '/util.js', '/map3d.js', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png'];
const NETWORK_TIMEOUT = 5000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
        if (res.ok && !res.redirected) await cache.put(url, res);
      } catch { /* cached on next visit */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL_CACHE, DATA_CACHE, FONT_CACHE];
    for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

// Network first (so data is fresh and an expired login surfaces), cached copy when offline or slow.
async function apiData(request) {
  const cache = await caches.open(DATA_CACHE);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put('/api/data', res.clone());
    return res;
  });
  try {
    return await Promise.race([network, timeout(NETWORK_TIMEOUT)]);
  } catch {
    const hit = await cache.match('/api/data');
    if (!hit) return network.catch(() => new Response('{"error":"offline"}', { status: 503, headers: { 'content-type': 'application/json' } }));
    const headers = new Headers(hit.headers);
    headers.set('x-from-cache', '1');
    return new Response(await hit.blob(), { status: 200, headers });
  }
}

async function navigate(request) {
  try {
    return await Promise.race([fetch(request), timeout(NETWORK_TIMEOUT)]);
  } catch {
    return (await caches.match('/', { cacheName: SHELL_CACHE })) || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const hit = await caches.match(request, { cacheName, ignoreSearch: cacheName === SHELL_CACHE });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') (await caches.open(cacheName)).put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/oauth2/')) return;
    if (url.pathname === '/api/data') return event.respondWith(apiData(request));
    if (url.pathname.startsWith('/api/')) return;
    if (request.mode === 'navigate') return event.respondWith(navigate(request));
    return event.respondWith(cacheFirst(request, SHELL_CACHE));
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONT_CACHE));
  }
});
