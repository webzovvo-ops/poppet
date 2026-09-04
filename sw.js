// poppet. — service worker
// Caches the static app shell so the interface loads offline.
// Supabase data itself still needs a connection to sync, but
// once cached, the app opens instantly and the chime sounds
// (synthesized locally, no audio files) always work.

const CACHE_NAME = 'poppet-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/sound.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg',
  './assets/sounds/cutesounds.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // add each file independently — if one is missing (e.g. the sound
      // file hasn't been dropped in yet) the rest of the shell still caches
      await Promise.all(SHELL_FILES.map((file) => cache.add(file).catch(() => {})));
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // never intercept Supabase API/storage calls — those need the network
  if (request.url.includes('supabase.co')) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // opportunistically cache same-origin GETs (fonts CDN etc. skipped by default same-origin check)
        if (request.method === 'GET' && response.ok && request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});