// Filee service worker: makes the page installable (phone home screen, desktop app window), keeps the page shell
// for quick starts, and receives files from the system "Share" sheet (manifest share_target).
const SHELL = 'filee-shell-v1';
const FILES = ['/', '/index.html', '/app.css', '/app.js', '/manifest.webmanifest', '/icons/filee.svg', '/icons/filee.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('filee-shell') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // Shared files: keep them until the page picks them up, then open the page.
  if (event.request.method === 'POST' && url.pathname === '/share') {
    event.respondWith((async () => {
      const form = await event.request.formData();
      const cache = await caches.open('filee-share');
      let n = 0;
      for (const file of form.getAll('files')) {
        if (!(file instanceof File)) continue;
        await cache.put(`/shared/${Date.now()}-${n++}`, new Response(file, {
          headers: { 'content-type': file.type || 'application/octet-stream', 'x-name': encodeURIComponent(file.name) },
        }));
      }
      return Response.redirect('/?share=1', 303);
    })());
    return;
  }

  // The API is always live; the page shell is network first, the cached copy when the network fails.
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && FILES.includes(url.pathname)) {
      const copy = response.clone();
      caches.open(SHELL).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then(hit => hit || caches.match('/'))));
});
