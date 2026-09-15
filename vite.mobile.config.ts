import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(__dirname, "mobile"),
  envDir: path.resolve(__dirname),
  base: "/mobile/",
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, "dist/mobile"),
    emptyOutDir: false,
    assetsDir: "assets",
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      {
        find: "@shinederu/auth-core",
        replacement: path.resolve(__dirname, "../Module-Auth-Core/src/index.ts"),
      },
      {
        find: "@shinederu/auth-react",
        replacement: path.resolve(__dirname, "../Module-Auth-React/src/index.ts"),
      },
    ],
  },
});
