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
