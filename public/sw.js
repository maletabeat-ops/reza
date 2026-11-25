// Reza service worker: makes the app installable and shows the last loaded page when offline.
// Always network first, so an update is visible right away.
const CACHE = "reza-shell-v1";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.add("/")).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || r.mode !== "navigate") return; // API calls and files go straight to the network
  e.respondWith(fetch(r).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {}); return res; })
    .catch(() => caches.match("/").then((m) => m || Response.error())));
});
