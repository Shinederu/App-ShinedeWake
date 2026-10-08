import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Run after npm run build. All network, cache and browser APIs below are doubles.
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(projectRoot, "dist");
const origin = "https://wake.example.test";
const rootWorkerSource = readFileSync(path.join(dist, "sw.js"), "utf8");
const mobileWorkerSource = readFileSync(path.join(dist, "mobile", "sw.js"), "utf8");
const legacyPaths = ["/mobile", "/mobile/", "/mobile/index.html"];
const registrationSource = stripTypeScriptTypes(readFileSync(path.join(projectRoot, "src", "lib", "pwa.ts"), "utf8"))
  .replace("export function registerPwa", "function registerPwa")
  .replaceAll("import.meta.env.PROD", "IS_PRODUCTION");

function createRegistrationClient({ production = true, supported = true, readyState = "complete", existingActiveWorker = false } = {}) {
  const listeners = new Set();
  const windowListeners = new Map();
  const calls = { register: [], unregister: [], getRegistrations: 0, removedStorage: [] };
  const storage = new Map([
    ["shinedewake.pending-actions.v1", "old transitions"],
    ["shinedewake.mobile.pending-actions.v1", "old mobile transitions"],
    ["unrelated-preference", "keep"],
    ["auth-session", "keep"],
  ]);
  const worker = {
    state: "installing",
    addEventListener(type, listener) { assert.equal(type, "statechange"); listeners.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, "statechange"); listeners.delete(listener); },
  };
  const scopes = ["/", "/mobile/", "/another-app/", "/mobile-other/"];
  const registrations = scopes.map((scope) => ({
    scope: new URL(scope, origin).href,
    async unregister() { calls.unregister.push(scope); return true; },
  }));
  const oldWorker = { state: "activated", addEventListener() {}, removeEventListener() {} };
  const rootRegistration = { ...registrations[0], active: existingActiveWorker ? oldWorker : null, installing: worker, waiting: null };
  const navigator = supported ? {
    serviceWorker: {
      async register(url, options) { calls.register.push({ url, options }); return rootRegistration; },
      async getRegistrations() { calls.getRegistrations += 1; return registrations; },
    },
  } : {};
  const context = vm.createContext({
    IS_PRODUCTION: production,
    navigator,
    URL,
    document: { readyState },
    window: {
      location: { origin },
      localStorage: {
        removeItem(key) { calls.removedStorage.push(key); storage.delete(key); },
      },
      addEventListener(type, listener, options) {
        assert.equal(type, "load");
        assert.equal(options.once, true);
        windowListeners.set(type, listener);
      },
    },
  });
  vm.runInContext(registrationSource, context);
  return {
    calls,
    storage,
    listeners,
    start() { vm.runInContext("registerPwa()", context); },
    loaded() { windowListeners.get("load")?.(); },
    transition(state) {
      worker.state = state;
      for (const listener of [...listeners]) listener();
    },
  };
}

// Flush the registration's asynchronous continuations without using real browser APIs.
const settleRegistration = () => new Promise((resolve) => setImmediate(resolve));

function createWorker(source = rootWorkerSource, options = {}) {
  const handlers = new Map();
  const cacheStores = new Map();
  const calls = { fetch: [], addAll: [], deleted: [], navigated: [], skipWaiting: 0, claim: 0, unregister: 0 };
  let network = async () => new Response("network");
  const keyFor = (value) => new URL(typeof value === "string" ? value : value.url, origin).href;

  function cacheFor(name) {
    if (!cacheStores.has(name)) cacheStores.set(name, new Map());
    const entries = cacheStores.get(name);
    return {
      async addAll(requests) {
        calls.addAll.push(...requests);
        if (options.failPrecache) throw new Error("Precache unavailable");
        for (const request of requests) entries.set(keyFor(request), new Response(`cached:${new URL(request.url).pathname}`));
      },
      async match(request) {
        return entries.get(keyFor(request))?.clone();
      },
    };
  }

  const clients = (options.clientPaths ?? []).map((pathname) => ({
    url: new URL(pathname, origin).href,
    async navigate(to) { calls.navigated.push({ from: this.url, to }); },
  }));
  const context = vm.createContext({
    URL,
    Response,
    Request: class extends Request {
      constructor(input, init) { super(new URL(input, origin), init); }
    },
    fetch: async (request) => {
      calls.fetch.push(request);
      return network(request);
    },
    caches: {
      async open(name) { return cacheFor(name); },
      async keys() { return [...cacheStores.keys()]; },
      async delete(name) { calls.deleted.push(name); return cacheStores.delete(name); },
    },
    self: {
      location: { origin },
      addEventListener(type, handler) { handlers.set(type, handler); },
      async skipWaiting() { calls.skipWaiting += 1; },
      registration: { async unregister() { calls.unregister += 1; return true; } },
      clients: {
        async claim() { calls.claim += 1; },
        async matchAll() { return clients; },
      },
    },
  });
  vm.runInContext(source, context);

  return {
    calls,
    cacheStores,
    constants() { return JSON.parse(vm.runInContext("JSON.stringify({ cacheName: CACHE_NAME, urls: PRECACHE_URLS })", context)); },
    seedCache(name, entries = {}) {
      cacheFor(name);
      for (const [url, body] of Object.entries(entries)) cacheStores.get(name).set(keyFor(url), new Response(body));
    },
    setNetwork(handler) { network = handler; },
    async lifecycle(type) {
      const pending = [];
      handlers.get(type)?.({ waitUntil(promise) { pending.push(promise); } });
      await Promise.all(pending);
    },
    async request(url, { method = "GET", mode = "cors" } = {}) {
      let intercepted = false;
      let result;
      const request = { url: new URL(url, origin).href, method, mode };
      handlers.get("fetch")?.({
        request,
        respondWith(response) { assert.equal(intercepted, false); intercepted = true; result = response; },
      });
      return { intercepted, response: intercepted ? await result : undefined };
    },
  };
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(filename) : [filename];
  });
}

test("manifest identity stays stable while both manifests open the full root app", () => {
  const manifest = JSON.parse(readFileSync(path.join(dist, "manifest.json"), "utf8"));
  const compatibilityManifest = JSON.parse(readFileSync(path.join(dist, "mobile", "manifest.json"), "utf8"));
  assert.deepEqual(compatibilityManifest, manifest);
  assert.equal(manifest.id, "/mobile/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith("/icons/"));
    assert.ok(readFileSync(path.join(dist, icon.src.slice(1))).length > 0);
  }
});

test("precache contains exactly the built static shell, never manifests or API data", async () => {
  const worker = createWorker();
  const { cacheName, urls } = worker.constants();
  assert.match(cacheName, /^shinedewake-full-shell-[a-f0-9]{20}$/);
  const assets = listFiles(path.join(dist, "assets")).map((filename) => `/${path.relative(dist, filename).split(path.sep).join("/")}`);
  const expected = ["/index.html", "/favicon.png", "/icons/apple-touch-icon.png", "/icons/pwa-192x192.png", "/icons/pwa-512x512.png", "/icons/maskable-512x512.png", ...assets];
  assert.deepEqual([...urls].sort(), expected.sort());
  assert.equal(new Set(urls).size, urls.length);
  for (const url of urls) assert.ok(readFileSync(path.join(dist, url.slice(1))).length > 0);
  const html = readFileSync(path.join(dist, "index.html"), "utf8");
  for (const [, url] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) assert.ok(urls.includes(url));
  assert.equal(urls.some((url) => url.includes("manifest") || url.startsWith("/mobile/")), false);
  assert.equal(rootWorkerSource.includes("__WAKE_"), false);
  await worker.lifecycle("install");
  assert.deepEqual(worker.calls.addAll.map((request) => new URL(request.url).pathname), urls);
  assert.ok(worker.calls.addAll.every((request) => request.credentials === "omit" && request.cache === "reload"));
  assert.equal(worker.calls.skipWaiting, 1);
  assert.equal(worker.calls.fetch.length, 0);
});

test("incomplete precache cannot activate the replacement worker", async () => {
  const worker = createWorker(rootWorkerSource, { failPrecache: true });
  await assert.rejects(worker.lifecycle("install"), /Precache unavailable/);
  assert.equal(worker.calls.skipWaiting, 0);
});

test("API, manifests, external URLs, commands and unknown files bypass the root worker", async () => {
  const worker = createWorker();
  const paths = ["/wake/?action=listDevices", "/auth/?action=status", "/api/wake/", "/manifest.json", "/mobile/manifest.json", "/private.json", "/unknown", "/mobile/other", `${origin}/assets/not-in-build.js`, "https://api.example.test/wake/?action=status"];
  for (const url of paths) {
    for (const mode of ["cors", "navigate"]) assert.equal((await worker.request(url, { mode })).intercepted, false, `${mode} ${url}`);
  }
  for (const method of ["POST", "PUT", "DELETE", "PATCH", "HEAD"]) {
    for (const url of ["/", "/index.html", "/mobile/", worker.constants().urls[1]]) {
      assert.equal((await worker.request(url, { method, mode: "navigate" })).intercepted, false, `${method} ${url}`);
    }
  }
  const asset = worker.constants().urls.find((url) => url.startsWith("/assets/"));
  assert.equal((await worker.request(`${asset}?private=1`)).intercepted, false);
  assert.equal((await worker.request(`https://other.example.test${asset}`)).intercepted, false);
  assert.equal((await worker.request("/index.html")).intercepted, false);
  assert.equal(worker.calls.fetch.length, 0);
  assert.equal(worker.cacheStores.size, 0);
});

test("root navigation prefers network and falls back to the cached shell only when needed", async () => {
  const worker = createWorker();
  const { cacheName } = worker.constants();
  worker.seedCache(cacheName, { "/index.html": "offline shell" });
  for (const pathname of ["/", "/index.html"]) {
    worker.setNetwork(async () => new Response("fresh shell"));
    const online = await worker.request(pathname, { mode: "navigate" });
    assert.equal(online.intercepted, true);
    assert.equal(await online.response.text(), "fresh shell");
    worker.setNetwork(async () => { throw new TypeError("Offline"); });
    assert.equal(await (await worker.request(pathname, { mode: "navigate" })).response.text(), "offline shell");
    worker.setNetwork(async () => new Response("server unavailable", { status: 503 }));
    assert.equal(await (await worker.request(pathname, { mode: "navigate" })).response.text(), "offline shell");
    worker.setNetwork(async () => new Response("denied", { status: 403 }));
    const denied = await worker.request(pathname, { mode: "navigate" });
    assert.equal(denied.response.status, 403);
    assert.equal(await denied.response.text(), "denied");
  }
  assert.equal(worker.calls.fetch.length, 8);
  const emptyWorker = createWorker();
  emptyWorker.setNetwork(async () => { throw new TypeError("Offline"); });
  assert.equal((await emptyWorker.request("/", { mode: "navigate" })).response.type, "error");
});

test("only prelisted static files are cache-first, without storing runtime responses", async () => {
  const worker = createWorker();
  const { cacheName, urls } = worker.constants();
  const asset = urls.find((url) => url.startsWith("/assets/"));
  worker.seedCache(cacheName, { [asset]: "cached asset" });
  assert.equal(await (await worker.request(asset)).response.text(), "cached asset");
  assert.equal(worker.calls.fetch.length, 0);
  worker.setNetwork(async () => new Response("fresh icon"));
  assert.equal(await (await worker.request("/icons/pwa-192x192.png")).response.text(), "fresh icon");
  assert.equal(worker.calls.fetch.length, 1);
  assert.equal(worker.cacheStores.get(cacheName).size, 1);
});

test("root redirects exact legacy entry navigations without network, including offline", async () => {
  const worker = createWorker();
  worker.setNetwork(async () => { throw new Error("Network must not be used"); });
  for (const pathname of legacyPaths) {
    const result = await worker.request(pathname, { mode: "navigate" });
    assert.equal(result.intercepted, true);
    assert.equal(result.response.status, 302);
    assert.equal(result.response.headers.get("location"), `${origin}/`);
    assert.equal((await worker.request(pathname)).intercepted, false);
  }
  for (const pathname of ["/mobile/settings", "/mobile/index.html.bak", "/mobile-elsewhere"])
    assert.equal((await worker.request(pathname, { mode: "navigate" })).intercepted, false);
  assert.equal(worker.calls.fetch.length, 0);
});

test("root activation removes only old Wake caches and navigates only legacy mobile clients", async () => {
  const untouchedPaths = ["/", "/?editing=12", "/index.html", "/mobile/settings", "/another-app/"];
  const worker = createWorker(rootWorkerSource, { clientPaths: [...legacyPaths, ...untouchedPaths] });
  const { cacheName } = worker.constants();
  const obsolete = ["shinedewake-full-shell-old", "shinedewake-mobile-shell-old", "shinedewake-shell-old"];
  const preserved = [cacheName, "unrelated-app-cache", "shinedewake-other-data", "shinedewake-full-shell"];
  for (const name of [...obsolete, ...preserved]) worker.seedCache(name);
  await worker.lifecycle("activate");
  assert.deepEqual([...worker.calls.deleted].sort(), obsolete.sort());
  assert.deepEqual([...worker.cacheStores.keys()].sort(), preserved.sort());
  assert.equal(worker.calls.claim, 1);
  assert.equal(worker.calls.unregister, 0);
  assert.deepEqual(worker.calls.navigated, legacyPaths.map((pathname) => ({ from: `${origin}${pathname}`, to: `${origin}/` })));
});

test("mobile tombstone unregisters only itself, purges only mobile caches and redirects targeted clients", async () => {
  const worker = createWorker(mobileWorkerSource, { clientPaths: [...legacyPaths, "/", "/?editing=12", "/mobile/settings", "/another-app/"] });
  const obsolete = ["shinedewake-mobile-shell-old", "shinedewake-mobile-shell-newer"];
  const preserved = ["shinedewake-full-shell-current", "shinedewake-shell-old", "unrelated-cache"];
  for (const name of [...obsolete, ...preserved]) worker.seedCache(name);
  await worker.lifecycle("install");
  await worker.lifecycle("activate");
  assert.equal(worker.calls.skipWaiting, 1);
  assert.equal(worker.calls.claim, 1);
  assert.equal(worker.calls.unregister, 1);
  assert.deepEqual([...worker.calls.deleted].sort(), obsolete.sort());
  assert.deepEqual([...worker.cacheStores.keys()].sort(), preserved.sort());
  assert.deepEqual(worker.calls.navigated, legacyPaths.map((pathname) => ({ from: `${origin}${pathname}`, to: `${origin}/` })));
  for (const pathname of legacyPaths) {
    const result = await worker.request(pathname, { mode: "navigate" });
    assert.equal(result.response.status, 302);
    assert.equal(result.response.headers.get("location"), `${origin}/`);
    assert.equal((await worker.request(pathname, { method: "POST", mode: "navigate" })).intercepted, false);
  }
  for (const url of ["/", "/mobile/settings", "/mobile/manifest.json", "https://other.example.test/mobile/"])
    assert.equal((await worker.request(url, { mode: "navigate" })).intercepted, false);
  assert.equal(worker.calls.fetch.length, 0);
});

test("registration keeps the legacy worker until the complete root worker activates", async () => {
  const client = createRegistrationClient();
  client.start();
  await settleRegistration();
  assert.deepEqual(JSON.parse(JSON.stringify(client.calls.register)), [{ url: "/sw.js", options: { scope: "/", updateViaCache: "none" } }]);
  assert.equal(client.listeners.size, 1);
  assert.equal(client.calls.getRegistrations, 0);
  assert.deepEqual(client.calls.unregister, []);
  client.transition("installed");
  await settleRegistration();
  assert.deepEqual(client.calls.unregister, []);
  client.transition("activating");
  await settleRegistration();
  assert.deepEqual(client.calls.unregister, []);
  client.transition("activated");
  await settleRegistration();
  assert.equal(client.calls.getRegistrations, 1);
  assert.deepEqual(client.calls.unregister, ["/mobile/"]);
  assert.equal(client.listeners.size, 0);
  assert.deepEqual(client.calls.removedStorage, ["shinedewake.pending-actions.v1", "shinedewake.mobile.pending-actions.v1"]);
  assert.deepEqual([...client.storage.entries()], [["unrelated-preference", "keep"], ["auth-session", "keep"]]);
});

test("failed replacement installation leaves all existing worker registrations intact", async () => {
  const client = createRegistrationClient();
  client.start();
  await settleRegistration();
  client.transition("redundant");
  await settleRegistration();
  assert.equal(client.calls.getRegistrations, 0);
  assert.deepEqual(client.calls.unregister, []);
  assert.equal(client.listeners.size, 0);
});

test("an old active root worker does not permit cleanup while its replacement is installing", async () => {
  const client = createRegistrationClient({ existingActiveWorker: true });
  client.start();
  await settleRegistration();
  assert.equal(client.listeners.size, 1);
  assert.equal(client.calls.getRegistrations, 0);
  assert.deepEqual(client.calls.unregister, []);
  client.transition("activated");
  await settleRegistration();
  assert.deepEqual(client.calls.unregister, ["/mobile/"]);
});

test("registration is skipped in development or without service-worker support", async () => {
  for (const options of [{ production: false }, { supported: false }]) {
    const client = createRegistrationClient(options);
    client.start();
    client.loaded();
    await settleRegistration();
    assert.deepEqual(client.calls.register, []);
    assert.deepEqual(client.calls.unregister, []);
    assert.deepEqual(client.calls.removedStorage, []);
    assert.equal(client.listeners.size, 0);
  }
});

test("registration waits for the page load before starting an installation", async () => {
  const client = createRegistrationClient({ readyState: "loading" });
  client.start();
  await settleRegistration();
  assert.deepEqual(client.calls.register, []);
  client.loaded();
  await settleRegistration();
  assert.equal(client.calls.register.length, 1);
  assert.deepEqual(client.calls.unregister, []);
  client.transition("activated");
  await settleRegistration();
  assert.deepEqual(client.calls.unregister, ["/mobile/"]);
});
