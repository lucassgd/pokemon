// Service worker: la app funciona sin conexión y los sprites ya vistos se guardan en caché.
const SHELL = 'dexnum-shell-v1';
const SPRITES = 'dexnum-sprites-v1';
const FILES = ['./', 'index.html', 'css/style.css', 'js/data.js', 'js/app.js', 'manifest.json', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== SPRITES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'raw.githubusercontent.com') {
    // Sprites: caché primero (no cambian nunca).
    e.respondWith(caches.open(SPRITES).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }));
  } else if (url.origin === location.origin) {
    // App: red primero (para recibir actualizaciones), caché si no hay conexión.
    e.respondWith(fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(SHELL).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
