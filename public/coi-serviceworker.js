/**
 * Minimal cross-origin-isolation service worker (vendored).
 *
 * GitHub Pages can't set response headers, but SharedArrayBuffer (needed for
 * multithreaded FFmpeg) requires COOP/COEP. This file plays both roles:
 *  - loaded as a classic script (injected production-only from main.tsx),
 *    it registers itself as the worker;
 *  - loaded as the worker, it re-serves same-origin GET responses with the
 *    isolation headers appended.
 *
 * First visit: page loads unisolated, worker installs, page reloads once.
 * Later visits: worker serves the document with headers, no reload.
 * If isolation never engages, the app keeps working on the single-thread core.
 */
const COOP = "same-origin";
const COEP = "require-corp";

if (typeof window === "undefined") {
  // ---- Service worker scope ----
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) =>
    event.waitUntil(self.clients.claim()),
  );
  self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;
    if (new URL(request.url).origin !== self.location.origin) return;
    event.respondWith(
      fetch(request).then((response) => {
        const headers = new Headers(response.headers);
        headers.set("Cross-Origin-Opener-Policy", COOP);
        headers.set("Cross-Origin-Embedder-Policy", COEP);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }),
    );
  });
} else {
  // ---- Page scope: register early from <head> ----
  // The reload decision keys off crossOriginIsolated itself, NOT controller
  // presence: clients.claim() can set a controller on a document that was
  // fetched WITHOUT the headers, so "has controller" does not imply
  // "isolated". One guarded reload is enough; the flag prevents loops.
  (async () => {
    try {
      if (
        window.crossOriginIsolated ||
        !("serviceWorker" in navigator) ||
        sessionStorage.getItem("coi-reloaded")
      ) {
        return;
      }
      await navigator.serviceWorker.register("/coi-serviceworker.js");
      await navigator.serviceWorker.ready;
      sessionStorage.setItem("coi-reloaded", "1");
      window.location.reload();
    } catch {
      // Isolation unavailable — app falls back to the single-thread core.
    }
  })();
}
