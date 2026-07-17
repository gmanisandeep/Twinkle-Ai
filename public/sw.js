const CACHE = 'twinkle-shell-v4';
const SHELL = [
  '/', '/index.html', '/css/main.css', '/css/components.css', '/css/safety-privacy.css', '/css/v2-foundation.css', '/css/v3-shell.css', '/css/landing.css',
  '/js/theme.js', '/js/auth.js', '/js/auth-screen.js', '/js/first-run-router.js', '/js/onboarding.js', '/js/conversations.js', '/js/projects.js', '/js/memory.js', '/js/domains.js',
  '/js/permission.js', '/js/markdown.js', '/js/ui.js', '/js/api.js', '/js/i18n.js', '/js/platform.js', '/js/voice.js',
  '/js/proactive.js', '/js/workspace.js', '/js/command-palette.js', '/js/safety-privacy.js', '/js/landing.js', '/js/app.js',
  '/assets/brand/twinkle-star.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/.netlify/functions/')) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok && response.type === 'basic') caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
