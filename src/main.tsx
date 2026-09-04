import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";

// Cross-origin isolation (multithreaded FFmpeg) is a production-only
// concern: it needs real response headers, and the service worker would
// otherwise intercept Vite's dev WebSocket and break HMR.
if (
  import.meta.env.PROD &&
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  !window.crossOriginIsolated &&
  !sessionStorage.getItem("coi-reloaded")
) {
  const script = document.createElement("script");
  script.src = "/coi-serviceworker.js";
  document.head.appendChild(script);
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>,
);
