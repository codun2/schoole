/*
 * سكوول — Service Worker (admin app only, scope /app/).
 * Phase 1: offline READING. Strategy is network-first everywhere, with the cache as
 * the offline fallback — so online you always get fresh code/data (safe for a
 * no-build project that deploys often), and offline you get the last seen copy.
 * Writes (non-GET) are never intercepted or cached: they go straight to the network.
 */
const SHELL_CACHE = 'sch-shell-v1';
const API_CACHE = 'sch-api-v1';
const FONT_CACHE = 'sch-fonts-v1';
const KEEP = [SHELL_CACHE, API_CACHE, FONT_CACHE];

const SHELL = [
  '/app/', '/app/index.html',
  '/assets/css/app.css',
  '/assets/js/core.js', '/assets/js/i18n-dict.js', '/assets/js/i18n.js',
  '/assets/js/app/shell.js', '/assets/js/app/offline-db.js', '/assets/js/app/crud.js',
  '/assets/js/app/pages-dashboards.js', '/assets/js/app/pages-school.js', '/assets/js/app/pages-academic.js',
  '/assets/js/app/pages-timetable.js', '/assets/js/app/pages-finance.js', '/assets/js/app/pages-accounting.js',
  '/assets/js/app/pages-hr.js', '/assets/js/app/pages-hr2.js', '/assets/js/app/pages-admin.js',
  '/manifest.webmanifest', '/assets/icons/icon.svg', '/assets/icons/icon-192.png', '/assets/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    // add one by one so a single missing file doesn't abort the whole precache
    await Promise.all(SHELL.map((u) => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

let apiPausedUntil = 0; // after a logout wipe, ignore late in-flight responses for a few seconds
self.addEventListener('message', (e) => {
  if (e.data === 'CLEAR_API') { apiPausedUntil = Date.now() + 5000; e.waitUntil(caches.delete(API_CACHE)); } // on logout: never leak data between accounts
});

const isApi = (url) => url.pathname.startsWith('/api/');
const isFont = (url) => /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // phase 1: writes are online-only
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (isFont(url)) e.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, SHELL_CACHE, '/app/index.html')); return; }
  if (isApi(url)) {
    // only /auth/me among auth endpoints is a cacheable read (needed to boot offline)
    if (url.pathname.startsWith('/api/auth/') && url.pathname !== '/api/auth/me') return;
    e.respondWith(networkFirst(req, API_CACHE));
    return;
  }
  e.respondWith(networkFirst(req, SHELL_CACHE));
});

async function networkFirst(req, cacheName, fallbackPath) {
  try {
    const res = await fetch(req);
    if (res && res.ok && !(cacheName === API_CACHE && Date.now() < apiPausedUntil)) { const c = await caches.open(cacheName); c.put(req, res.clone()).catch(() => {}); }
    return res;
  } catch (err) {
    const c = await caches.open(cacheName);
    const hit = await c.match(req, { ignoreVary: true }) || (fallbackPath ? await c.match(fallbackPath) : null);
    if (hit) return hit;
    if (cacheName === API_CACHE) {
      return new Response(JSON.stringify({ offline: true, message: 'أنت غير متصل بالإنترنت ولا توجد نسخة محفوظة من هذه البيانات على الجهاز.' }), {
        status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
    throw err;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const c = await caches.open(cacheName);
  const cached = await c.match(req);
  const net = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()).catch(() => {}); return r; }).catch(() => null);
  return cached || (await net) || Response.error();
}
