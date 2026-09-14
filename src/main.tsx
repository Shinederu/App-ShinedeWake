import { createRoot } from "react-dom/client";
import { AuthProvider } from "@shinederu/auth-react";
import App from "./App";
import { authClient } from "./lib/authClient";
import "./index.css";

createRoot(document.getElementById("app")!).render(
  <AuthProvider client={authClient} autoRefreshOnMount={false}>
    <App />
  </AuthProvider>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch(() => undefined);
  });
}
