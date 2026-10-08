function waitForActivation(registration: ServiceWorkerRegistration): Promise<void> {
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) {
    return Promise.reject(new Error("No PWA worker available"));
  }
  return new Promise((resolve, reject) => {
    const checkState = () => {
      if (worker.state === "activated" || worker.state === "redundant") {
        worker.removeEventListener("statechange", checkState);
        if (worker.state === "activated") resolve();
        else reject(new Error("PWA installation failed"));
      }
    };
    worker.addEventListener("statechange", checkState);
    checkState();
  });
}

export function registerPwa(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  const register = async () => {
    try {
      window.localStorage.removeItem("shinedewake.pending-actions.v1");
      window.localStorage.removeItem("shinedewake.mobile.pending-actions.v1");
    } catch {
      // Storage is optional.
    }

    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      // Keep the legacy registration if precaching the replacement fails.
      await waitForActivation(registration);

      // Do not unregister the root worker: it now serves the complete app.
      const mobileScope = new URL("/mobile/", window.location.origin).href;
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(
        registrations
          .filter((registration) => registration.scope === mobileScope)
          .map((registration) => registration.unregister())
      );
    } catch {
      // Installation is optional; the complete online site remains usable.
    }
  };

  if (document.readyState === "complete") {
    void register();
  } else {
    window.addEventListener("load", () => void register(), { once: true });
  }
}
