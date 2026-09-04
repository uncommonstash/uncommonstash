import { expect, test } from "@playwright/test";

test.describe("Audio Recorder", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["microphone"]);
  });

  test("should record audio", async ({ page }) => {
    await page.goto("/audio/recorder");

    await page.click('button:has-text("Start Recording")');
    await expect(
      page.locator('button:has-text("Stop Recording")'),
    ).toBeVisible();

    await page.click('button:has-text("Stop Recording")');
    await expect(page.locator("audio")).toBeVisible();
  });
});
