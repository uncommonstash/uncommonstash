import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const golden = JSON.parse(readFileSync("e2e/fixtures/sysdiagnose-query-mock.expected.json", "utf8")) as {
  appEnergyMWh: Record<string, number>;
  componentEnergyMWh: Record<string, number>;
};

test("sysdiagnose renders Battery UI locally and queries the mock Powerlog archive", async ({ page }) => {
  await page.goto("/sysdiagnose");
  await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/sysdiagnose-query-mock.tar.gz");

  await expect(page.getByText("Battery level from Battery UI")).toBeVisible();
  await expect(page.locator('svg[aria-label="Battery level from Battery UI plist"] path')).toBeVisible();
  const safari = page.getByRole("row", { name: /Safari/ });
  await expect(safari).toBeVisible();
  await expect(safari.getByRole("cell").nth(1)).toHaveText(`${golden.appEnergyMWh["com.apple.mobilesafari"].toFixed(2)} mWh`);
  await expect(page.getByText(/Source: PLAccountingOperator_Aggregate_RootNodeEnergy/).first()).toBeVisible();

  await page.getByRole("button", { name: "Energy overview" }).click();
  const chart = page.locator('svg[aria-label="Powerlog component totals chart"]');
  await expect(chart).toBeVisible();
  await expect(page.getByText(/Hourly SUM\(Energy\), grouped by RootNodeID/)).toBeVisible();
  await expect(page.getByText(/Effective source range:/).first()).toBeVisible();
  await expect(chart.locator("rect").first()).toBeVisible();
});

test("a selected Battery UI range returns complete overlapping Powerlog intervals", async ({ page }) => {
  await page.goto("/sysdiagnose");
  await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/sysdiagnose-query-mock.tar.gz");
  await expect(page.getByRole("row", { name: /Safari/ })).toBeVisible();
  const chart = page.locator('svg[aria-label="Battery level from Battery UI plist"]');
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("battery chart is missing");
  await page.mouse.move(box.x + box.width * 0.32, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.54, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Energy overview" }).click();
  await expect(page.getByText(/Effective source range:/).first()).toBeVisible();
  await expect(page.locator('svg[aria-label="Powerlog component totals chart"] rect').first()).toBeVisible();

  await page.getByRole("button", { name: "logs" }).click();
  await expect(page.getByPlaceholder("Search messages")).toBeVisible();
  await page.getByRole("button", { name: "files" }).click();
  await expect(page.getByText("Archive files")).toBeVisible();
});
