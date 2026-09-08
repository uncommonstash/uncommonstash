import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const SW_PATH = path.resolve("dist/coi-serviceworker.js");

// Only isolation-related failures fail these tests; unrelated console noise
// (React DevTools hints, etc.) is ignored.
const ISOLATION_ERROR = /COEP|COOP|CORS|SharedArrayBuffer|isolat/i;

async function isolationState(page) {
  return page.evaluate(() => ({
    isolated: window.crossOriginIsolated,
    sab: typeof SharedArrayBuffer !== "undefined",
    controller: navigator.serviceWorker?.controller?.scriptURL ?? null,
  }));
}

test.describe("cross-origin isolation service worker", () => {
  test("fresh install engages isolation with no COEP errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(String(error)));

    await page.goto("/", { waitUntil: "load" });
    // First visit installs the worker and reloads once; poll for isolation.
    await expect
      .poll(() => page.evaluate(() => window.crossOriginIsolated), {
        timeout: 30000,
      })
      .toBe(true);

    const state = await isolationState(page);
    expect(state.isolated).toBe(true);
    expect(state.sab).toBe(true);
    expect(state.controller).toMatch(/coi-serviceworker\.js$/);
    expect(
      consoleErrors.filter((text) => ISOLATION_ERROR.test(text)),
      `isolation console errors: ${JSON.stringify(consoleErrors.slice(0, 5))}`,
    ).toEqual([]);
  });

  test("worker update replaces the active version without losing isolation", async ({
    page,
  }) => {
    test.setTimeout(180000);
    const original = fs.readFileSync(SW_PATH, "utf8");
    const marker = `\n// e2e-update-probe\n`;
    try {
      await page.goto("/", { waitUntil: "load" });
      await expect
        .poll(() => page.evaluate(() => window.crossOriginIsolated), {
          timeout: 30000,
        })
        .toBe(true);

      // Ship a "new version": any byte change triggers install of v2.
      fs.writeFileSync(SW_PATH, original + marker);

      // Ask the browser to pick it up. The controllerchange listener MUST
      // be attached before update(): install+claim on localhost resolves
      // in milliseconds, and an event fired before listening is lost.
      await page.evaluate(async () => {
        const changed = new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => resolve(),
            { once: true },
          ),
        );
        await navigator.serviceWorker
          .getRegistration()
          .then((reg) => reg?.update());
        await changed;
      });

      // v2 active, still isolated, app healthy on a fresh navigation.
      const state = await isolationState(page);
      expect(state.controller).toMatch(/coi-serviceworker\.js$/);
      await page.goto("/blog", { waitUntil: "load" });
      await expect(page.locator("h1")).toContainText("Blog", {
        timeout: 15000,
      });
      expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
    } finally {
      fs.writeFileSync(SW_PATH, original);
    }
  });
});
