// Compatibility worker for already-installed simplified PWAs. Keep this URL.
const LEGACY_ENTRIES = new Set(["/mobile", "/mobile/", "/mobile/index.html"]);
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("shinedewake-mobile-shell-"))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.allSettled(clients.filter((client) => LEGACY_ENTRIES.has(new URL(client.url).pathname))
      .map((client) => client.navigate(new URL("/", self.location.origin).href)));
  })());
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "GET" && event.request.mode === "navigate" &&
      url.origin === self.location.origin && LEGACY_ENTRIES.has(url.pathname)) {
    event.respondWith(Response.redirect(new URL("/", self.location.origin).href, 302));
  }
});
