import { test, expect } from "@playwright/test";
import fs from "fs";

test.setTimeout(120000);

test("should cut an audio file", async ({ page }) => {
  await page.goto("/audio/cut");

  await page.setInputFiles(
    'input[type="file"]',
    "e2e/fixtures/file_example_MP3_700KB.mp3",
  );

  await page.click("text=Cut Audio");

  const downloadLink = await page.waitForSelector("a[download='output.mp3']");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadLink.click(),
  ]);

  const path = await download.path();
  expect(path).toBeTruthy();
  const stats = fs.statSync(path as string);
  expect(stats.size).toBeGreaterThan(0);
});
