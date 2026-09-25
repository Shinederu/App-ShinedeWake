import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(import.meta.dirname, "mobile"),
  envDir: path.resolve(import.meta.dirname),
  base: "/mobile/",
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/mobile"),
    emptyOutDir: false,
    assetsDir: "assets",
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: "@", replacement: path.resolve(import.meta.dirname, "src") },
      {
        find: "@shinederu/auth-core",
        replacement: path.resolve(import.meta.dirname, "../Module-Auth-Core/src/index.ts"),
      },
      {
        find: "@shinederu/auth-react",
        replacement: path.resolve(import.meta.dirname, "../Module-Auth-React/src/index.ts"),
      },
    ],
  },
});
