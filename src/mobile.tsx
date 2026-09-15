import { createRoot } from "react-dom/client";
import { AuthProvider } from "@shinederu/auth-react";
import MobileApp from "./MobileApp";
import { authClient } from "./lib/authClient";
import "./mobile.css";

createRoot(document.getElementById("app")!).render(
  <AuthProvider client={authClient} autoRefreshOnMount={false}>
    <MobileApp />
  </AuthProvider>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void (async () => {
      const rootScope = `${window.location.origin}/`;
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(
          registrations
            .filter((registration) => registration.scope === rootScope)
            .map((registration) => registration.unregister())
        );
      } catch {
        // Legacy cleanup is best-effort and must not block the mobile worker.
      }

      if ("caches" in window) {
        try {
          const cacheNames = await window.caches.keys();
          await Promise.allSettled(
            cacheNames
              .filter((cacheName) => cacheName.startsWith("shinedewake-shell-"))
              .map((cacheName) => window.caches.delete(cacheName))
          );
        } catch {
          // CacheStorage can be unavailable in hardened browser contexts.
        }
      }

      try {
        await navigator.serviceWorker.register("/mobile/sw.js", {
          scope: "/mobile/",
          updateViaCache: "none",
        });
      } catch {
        // The online app remains usable when PWA installation is unavailable.
      }
    })();
  });
}
