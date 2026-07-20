// Service worker : cache l'app shell pour un fonctionnement hors-ligne
const CACHE_NAME = "my-home-v11";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./icons/icon.svg",
  "./js/app.js",
  "./js/router.js",
  "./js/state.js",
  "./js/utils.js",
  "./js/firebase.js",
  "./js/firebase-config.js",
  "./js/components/toast.js",
  "./js/components/userMenu.js",
  "./js/services/authService.js",
  "./js/services/profileService.js",
  "./js/services/productService.js",
  "./js/services/billService.js",
  "./js/services/meetingService.js",
  "./js/services/noteService.js",
  "./js/services/activityService.js",
  "./js/pages/login.js",
  "./js/pages/profiles.js",
  "./js/pages/dashboard.js",
  "./js/pages/courses.js",
  "./js/pages/factures.js",
  "./js/pages/rendezvous.js",
  "./js/pages/notes.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return; // Laisse passer Firebase/Firestore et les requetes non-GET
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => cached);
    })
  );
});
