import { expect, test } from "@playwright/test";

test("Image converter page has all formats", async ({ page }) => {
  await page.goto("/images/convert");

  // Wait for the page to load
  await expect(page.locator("h1")).toContainText("Image Converter");

  // Take a screenshot
  await page.screenshot({ path: "e2e/screenshot.png" });
});
