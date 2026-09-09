import { expect, test } from "@playwright/test";

test("sysdiagnose battery graph renders from PAX archive", async ({ page }) => {
  await page.goto("/sysdiagnose");
  const fixture = "e2e/fixtures/sysdiagnose-sample.tar.gz";
  // Hidden file input; Playwright can target it directly.
  await page.locator('input[type="file"]').setInputFiles(fixture);

  // Battery curve: 6 valid samples, -1 gaps skipped.
  await expect(page.getByText("Battery level over time")).toBeVisible();
  const svgPath = page
    .locator('svg[aria-label="Battery level over time"] path')
    .last();
  await expect(svgPath).toBeVisible();
  expect(((await svgPath.getAttribute("d")) ?? "").length).toBeGreaterThan(10);
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await expect(page.getByText("Energy (mWh)", { exact: true })).toBeVisible();

  // Per-app table from the real plist schema.
  await expect(page.getByText("App", { exact: true }).first()).toBeVisible();
  const safariRow = page.getByRole("row", { name: /Safari/ });
  await safariRow.scrollIntoViewIfNeeded();
  await expect(safariRow).toBeVisible();
  await expect(safariRow.getByText("logs")).toHaveCount(0);

  // Logs view picks up the bundled log file.
  await page.locator("aside button", { hasText: "Logs" }).click();
  await expect(page.getByPlaceholder("Search messages")).toBeVisible();
  await expect(page.getByText("simulated hang").first()).toBeVisible();
});

test("sysdiagnose extracts randomized Powerlog app activity for a selected range", async ({
  page,
}) => {
  await page.goto("/sysdiagnose");
  await page
    .locator('input[type="file"]')
    .setInputFiles("e2e/fixtures/sysdiagnose-analytics-range.tar.gz");

  const safariRow = page.getByRole("row", { name: /Safari/ });
  await expect(safariRow).toBeVisible();
  const safariEnergy = safariRow.getByRole("cell").nth(1);
  await expect(safariEnergy).toHaveText("500 mWh");

  // Drag a six-hour interior range. This is deliberately away from the
  // Battery UI / Powerlog edge so Powerlog is the sole source of the result.
  const chart = page.locator('svg[aria-label="Battery level over time"]');
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("battery chart has no bounding box");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, y, { steps: 8 });
  await page.mouse.up();

  // The worker must replace the plist's 24h total with a nonzero selected
  // Powerlog share, rather than clearing the table or retaining the summary.
  await expect(page.getByText("No app activity in this range.")).toHaveCount(0);
  await expect(safariEnergy).not.toHaveText("500 mWh");
  await expect(safariEnergy).toHaveText(/^[1-4]\d\d mWh$/);

  // Root-node components are extracted from the same selected Powerlog range.
  // The fixture's joined node table deliberately also has `timestamp`, matching
  // the real archive and guarding against ambiguous unqualified SQL columns.
  await page.getByRole("button", { name: "Energy" }).click();
  await expect(
    page.locator('svg[aria-label="Energy by component over time"]'),
  ).toBeVisible();
});

test("sysdiagnose renders the Powerlog overlap when a selected range extends past coverage", async ({
  page,
}) => {
  await page.goto("/sysdiagnose");
  await page
    .locator('input[type="file"]')
    .setInputFiles("e2e/fixtures/sysdiagnose-analytics-range.tar.gz");
  await expect(page.getByRole("row", { name: /Safari/ })).toBeVisible();

  const chart = page.locator('svg[aria-label="Battery level over time"]');
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("battery chart has no bounding box");
  const y = box.y + box.height / 2;
  // The mock Powerlog ends at 5:42 PM; this range ends shortly after it.
  await page.mouse.move(box.x + box.width * 0.01, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, y, { steps: 8 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Energy" }).click();
  await expect(
    page.locator('svg[aria-label="Energy by component over time"]'),
  ).toBeVisible();
  await expect(
    page.getByText("Energy component timeline is unavailable for this range."),
  ).toHaveCount(0);
});
