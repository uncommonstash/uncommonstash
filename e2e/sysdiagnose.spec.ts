import { expect, test } from "@playwright/test";

test("sysdiagnose battery graph renders from PAX archive", async ({ page }) => {
  await page.goto("/sysdiagnose");
  const fixture = "e2e/fixtures/sysdiagnose-sample.tar.gz";
  // Hidden file input; Playwright can target it directly.
  await page.locator('input[type="file"]').setInputFiles(fixture);

  // Battery curve: 6 valid samples, -1 gaps skipped.
  await expect(page.getByText("Battery level over time")).toBeVisible();
  const svgPath = page.locator(
    'svg[aria-label="Battery level over time"] path',
  );
  await expect(svgPath).toBeVisible();
  expect(((await svgPath.getAttribute("d")) ?? "").length).toBeGreaterThan(10);
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await expect(page.getByText("Energy (mWh)", { exact: true })).toBeVisible();

  // Per-app table from the real plist schema.
  await expect(page.getByText("Per-app energy (24h)")).toBeVisible();
  const safariRow = page.getByRole("row", { name: /Safari/ });
  await safariRow.scrollIntoViewIfNeeded();
  await expect(safariRow).toBeVisible();
  await expect(safariRow.getByText("logs")).toHaveCount(0);

  // Logs view picks up the bundled log file.
  await page.locator("aside button", { hasText: "Logs" }).click();
  await expect(page.getByPlaceholder("Search messages")).toBeVisible();
  await expect(page.getByText("simulated hang").first()).toBeVisible();
});
