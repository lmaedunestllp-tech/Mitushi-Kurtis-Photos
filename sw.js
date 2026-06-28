/* Mitushi Fashion - Service Worker */
const BASE = '/Mitushi-Kurtis-Photos/';
const VERSION = 'mf-v1';
const SHELL_CACHE = 'mf-shell-' + VERSION;
const SHARE_CACHE = 'mf-shared-photos';

const SHELL = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => {
        if (k !== SHELL_CACHE && k !== SHARE_CACHE) return caches.delete(k);
      }))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Photos shared from WhatsApp (or any app) land here as a POST
  if (req.method === 'POST' && url.pathname === BASE + 'share') {
    event.respondWith(handleShare(event));
    return;
  }

  // 2. App pages: network-first (so updates show immediately), cache fallback offline
  if (req.method === 'GET' && req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(BASE + 'index.html'))
    );
    return;
  }

  // 3. Static assets: cache-first, then network
  if (req.method === 'GET') {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req))
    );
  }
});

async function handleShare(event) {
  try {
    const formData = await event.request.formData();
    const files = formData.getAll('photos');
    const cache = await caches.open(SHARE_CACHE);

    // clear any previous batch
    const old = await cache.keys();
    await Promise.all(old.map((k) => cache.delete(k)));

    const names = [];
    let i = 0;
    for (const file of files) {
      if (!file || typeof file.arrayBuffer !== 'function') continue;
      const headers = { 'Content-Type': file.type || 'image/jpeg' };
      await cache.put(BASE + '__shared__/' + i, new Response(file, { headers }));
      names.push(file.name || ('photo_' + i + '.jpg'));
      i++;
    }
    await cache.put(
      BASE + '__shared__/meta',
      new Response(JSON.stringify({ count: i, names: names }),
        { headers: { 'Content-Type': 'application/json' } })
    );
  } catch (e) {
    // fall through to redirect; app will show "no photos"
  }
  return Response.redirect(BASE + '?share=1', 303);
}
