/* Weather Pro PWA — service worker */
const VERSION = "wpwa-v1.0.0";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(STATIC_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if(!k.startsWith(VERSION)) return caches.delete(k);
    }));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET
  if(req.method !== "GET") return;

  // Runtime caching for API + tiles
  const isAPI =
    url.hostname.includes("open-meteo.com") ||
    url.hostname.includes("rainviewer.com") ||
    url.hostname.includes("tile.openstreetmap.org") ||
    url.hostname.includes("nominatim.openstreetmap.org");

  if(isAPI){
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Static: cache-first + offline fallback for navigations
  if(req.mode === "navigate"){
    event.respondWith((async () => {
      try{
        const cached = await caches.match("./index.html");
        const fresh = await fetch(req);
        const cache = await caches.open(STATIC_CACHE);
        cache.put("./index.html", fresh.clone());
        return fresh;
      }catch(e){
        const off = await caches.match("./offline.html");
        return off || new Response("Offline", {status:503});
      }
    })());
    return;
  }

  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req){
  const cached = await caches.match(req);
  if(cached) return cached;
  const res = await fetch(req);
  const cache = await caches.open(STATIC_CACHE);
  cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req){
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then((res) => {
    cache.put(req, res.clone());
    return res;
  }).catch(() => null);

  return cached || (await networkPromise) || (await caches.match("./offline.html"));
}
