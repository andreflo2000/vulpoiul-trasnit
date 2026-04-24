// Service Worker — Vulpoiul Trasnit
const CACHE = "vulpoi-v1";
const ASSETS = [
  "/", "/index.html", "/style.css", "/script.js", "/config.js",
  "/manifest.json", "/gicu_placeholder.svg",
  "/data/translations.js", "/data/questions.js",
  "/data/characters.js", "/data/remarks.js", "/data/facts.js",
  "/sounds/click.mp3.mp3", "/sounds/win.mp3.mp3", "/sounds/lose.mp3.mp3"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // Wikipedia API — network first
  if (e.request.url.includes("wikipedia.org")) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // Firebase — network only
  if (e.request.url.includes("firebase") || e.request.url.includes("firestore")) return;
  // Restul — cache first
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
    const clone = resp.clone();
    caches.open(CACHE).then(c => c.put(e.request, clone));
    return resp;
  })));
});
