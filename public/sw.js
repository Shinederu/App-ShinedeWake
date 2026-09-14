const CACHE_NAME = "shinedewake-shell-v2";
const STATIC_SHELL = [
  "/manifest.webmanifest",
  "/favicon.png",
  "/icons/apple-touch-icon.png",
  "/icons/pwa-192x192.png",
  "/icons/pwa-512x512.png",
  "/icons/maskable-512x512.png",
];

const cacheBuiltShell = async (indexResponse, includeStaticShell = false) => {
  const cache = await caches.open(CACHE_NAME);
  const indexHtml = await indexResponse.clone().text();
  const builtAssets = Array.from(indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)).map(
    (match) => match[1]
  );
  const currentAssetUrls = new Set(builtAssets.map((asset) => new URL(asset, self.location.origin).href));

  await cache.addAll([...(includeStaticShell ? STATIC_SHELL : []), ...builtAssets]);
  await cache.put("/", indexResponse.clone());

  const cachedRequests = await cache.keys();
  await Promise.all(
    cachedRequests
      .filter((request) => new URL(request.url).pathname.startsWith("/assets/") && !currentAssetUrls.has(request.url))
      .map((request) => cache.delete(request))
  );
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const indexResponse = await fetch("/", { cache: "reload" });
      if (!indexResponse.ok) {
        throw new Error("Unable to cache the application shell.");
      }

      await cacheBuiltShell(indexResponse, true);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith("shinedewake-shell-") && cacheName !== CACHE_NAME
            )
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    const networkResponse = fetch(request);

    event.waitUntil(
      networkResponse
        .then((response) => (response.ok ? cacheBuiltShell(response.clone()) : undefined))
        .catch(() => undefined)
    );

    event.respondWith(
      networkResponse.catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("/")) ?? Response.error();
      })
    );
    return;
  }

  if (["font", "image", "manifest", "script", "style"].includes(request.destination)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
        }

        return response;
      })
    );
  }
});
