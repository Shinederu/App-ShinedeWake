const CACHE_NAME = "shinedewake-full-shell-__WAKE_CACHE_VERSION__";
const PRECACHE_URLS = /*__WAKE_PRECACHE__*/ [];
const SHELL_URL = "/index.html";
const LEGACY_ENTRIES = new Set(["/mobile", "/mobile/", "/mobile/index.html"]);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // One complete build only: never mix an HTML version with older bundles.
    await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, {
      cache: "reload",
      credentials: "omit",
    })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE_NAME && (
      name.startsWith("shinedewake-full-shell-") ||
      name.startsWith("shinedewake-mobile-shell-") ||
      name.startsWith("shinedewake-shell-")
    )).map((name) => caches.delete(name)));
    await self.clients.claim();

    // Migrate an open simplified app, without reloading root tabs or their forms.
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.allSettled(clients.filter((client) => LEGACY_ENTRIES.has(new URL(client.url).pathname))
      .map((client) => client.navigate(new URL("/", self.location.origin).href)));
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    if (LEGACY_ENTRIES.has(url.pathname)) {
      event.respondWith(Response.redirect(new URL("/", self.location.origin).href, 302));
    } else if (url.pathname === "/" || url.pathname === SHELL_URL) {
      event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const response = await fetch(request);
          return response.status < 500 ? response : (await cache.match(SHELL_URL)) ?? response;
        } catch {
          return (await cache.match(SHELL_URL)) ?? Response.error();
        }
      })());
    }
    return;
  }

  // Exact, build-generated public file allowlist. API/auth responses, manifests,
  // external resources and commands are never cached and never replayed.
  if (!url.search && PRECACHE_URLS.includes(url.pathname) && url.pathname !== SHELL_URL) {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) =>
      (await cache.match(url.pathname)) ?? fetch(request)
    ));
  }
});
