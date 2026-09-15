const CACHE_PREFIX = "shinedewake-shell-";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX))
          .map((cacheName) => caches.delete(cacheName))
      );

      await self.registration.unregister();

      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      await Promise.allSettled(windowClients.map((client) => client.navigate(client.url)));
    })()
  );
});
