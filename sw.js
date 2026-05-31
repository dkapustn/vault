// Vault service worker — offline app shell caching.
// Bump CACHE when shell files change to force an update.
const CACHE = 'vault-v5';
const SHELL = ['./', './index.html', './styles.css', './app.js', './config.js', './cloud.js', './manifest.json', './icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  e.respondWith(
    caches.match(req).then(cached => {
      // Stale-while-revalidate: отдаём из кэша сразу, обновляем в фоне.
      const network = fetch(req).then(res => {
        if (res && res.ok && req.url.startsWith(self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => null);

      if (cached) { network; return cached; }

      return network.then(res => res || caches.match('./index.html'));
    })
  );
});
