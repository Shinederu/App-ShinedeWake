import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [".."],
    },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: "@", replacement: path.resolve(import.meta.dirname, "src") },
      { find: "@shinederu/auth-core", replacement: path.resolve(import.meta.dirname, "../Module-Auth-Core/src/index.ts") },
      { find: "@shinederu/auth-react", replacement: path.resolve(import.meta.dirname, "../Module-Auth-React/src/index.ts") },
    ],
  },
});
