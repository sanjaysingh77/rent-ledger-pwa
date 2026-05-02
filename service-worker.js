const cacheName = "rent-ledger-v8";
const filesToCache = [
  "./",
  "./index.html",
  "./styles.css?v=8",
  "./app.js?v=8",
  "./manifest.json?v=8",
  "./icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(filesToCache)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "notify") return;
  self.registration.showNotification(event.data.title, {
    body: event.data.body,
    icon: "./icons/icon.svg",
    badge: "./icons/icon.svg"
  });
});
