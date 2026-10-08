import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

export function completeAppPwa(): Plugin {
  let outputDirectory = "";

  return {
    name: "wake-complete-app-pwa",
    apply: "build",
    configResolved(config) {
      outputDirectory = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const assets = readdirSync(path.join(outputDirectory, "assets"), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => "/" + path.relative(outputDirectory, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
        .sort();
      const files = [
        "/index.html",
        "/favicon.png",
        "/icons/apple-touch-icon.png",
        "/icons/pwa-192x192.png",
        "/icons/pwa-512x512.png",
        "/icons/maskable-512x512.png",
        ...assets,
      ];
      const workerPath = path.join(outputDirectory, "sw.js");
      const worker = readFileSync(workerPath, "utf8");
      const hash = createHash("sha256").update(worker);
      for (const file of files) {
        hash.update(file).update(readFileSync(path.join(outputDirectory, file.slice(1))));
      }
      if (!worker.includes("__WAKE_CACHE_VERSION__") || !worker.includes("/*__WAKE_PRECACHE__*/ []")) {
        throw new Error("The Wake service worker template is missing its build markers.");
      }
      writeFileSync(workerPath, worker
        .replace("__WAKE_CACHE_VERSION__", hash.digest("hex").slice(0, 20))
        .replace("/*__WAKE_PRECACHE__*/ []", JSON.stringify(files)));
    },
  };
}
