import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const analyticsGolden = JSON.parse(
  readFileSync(
    "e2e/fixtures/sysdiagnose-analytics-range.expected.json",
    "utf8",
  ),
) as { appEnergyMWh: Record<string, number> };

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
  // The golden file is produced independently by the seeded archive builder.
  // This verifies direct RootNodeEnergy uWh -> mWh extraction, not a Battery
  // UI allocation ratio.
  await expect(safariEnergy).toHaveText(
    `${analyticsGolden.appEnergyMWh["com.apple.mobilesafari"].toFixed(0)} mWh`,
  );

  // Drag a six-hour interior range. This is deliberately away from the
  // Battery UI / Powerlog edge so Powerlog is the sole source of the result.
  const chart = page.locator('svg[aria-label="Battery level over time"]');
  const fullRangeStart = Number(
    await chart
      .locator('g[data-chart-axis="time"] text')
      .first()
      .getAttribute("data-timestamp"),
  );
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("battery chart has no bounding box");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, y, { steps: 8 });
  await page.mouse.up();

  // A partial drag expands to complete source aggregates and remains direct.
  await expect(page.getByText("No app activity in this range.")).toHaveCount(0);
  await expect(safariEnergy).not.toHaveText(
    `${analyticsGolden.appEnergyMWh["com.apple.mobilesafari"].toFixed(0)} mWh`,
  );
  await expect(safariEnergy).toHaveText(/^\d+(?:\.\d)? mWh$/);

  // Root-node components are extracted from the same selected Powerlog range.
  // The fixture's joined node table deliberately also has `timestamp`, matching
  // the real archive and guarding against ambiguous unqualified SQL columns.
  await page.getByRole("button", { name: "Energy" }).click();
  await expect(
    page.locator('svg[aria-label="Energy by component over time"]'),
  ).toBeVisible();
  const energyChart = page.locator(
    'svg[aria-label="Energy by component over time"]',
  );
  // Energy is a result for the drag range, so its time axis must zoom to that
  // interval instead of retaining the full Battery UI day.
  expect(
    Number(
      await energyChart
        .locator('g[data-chart-axis="time"] text')
        .first()
        .getAttribute("data-timestamp"),
    ),
  ).toBeGreaterThan(fullRangeStart);

  // Energy units must remain inside the SVG viewport rather than losing their
  // leading digit to the left edge.
  const chartBox = await energyChart.boundingBox();
  const yLabelBox = await energyChart
    .locator('g[data-chart-axis="energy"] text')
    .first()
    .boundingBox();
  expect(chartBox).not.toBeNull();
  expect(yLabelBox).not.toBeNull();
  if (!chartBox || !yLabelBox) throw new Error("energy chart label is missing");
  expect(yLabelBox.x).toBeGreaterThanOrEqual(chartBox.x);

  // Hourly Powerlog aggregates occupy a span. Hover guidance must target the
  // middle of that span, not its timestamp/start edge.
  const firstBar = energyChart.locator('rect[stroke="#1d1d1f"]').first();
  const firstBarBox = await firstBar.boundingBox();
  expect(firstBarBox).not.toBeNull();
  if (!firstBarBox) throw new Error("energy bar is missing");
  await page.mouse.move(
    firstBarBox.x + firstBarBox.width / 2,
    firstBarBox.y + firstBarBox.height / 2,
  );
  const hoverGuide = energyChart.locator('line[stroke-dasharray="3 3"]');
  const guideX = Number(await hoverGuide.getAttribute("x1"));
  const barX = Number(await firstBar.getAttribute("x"));
  const barWidth = Number(await firstBar.getAttribute("width"));
  expect(Math.abs(guideX - (barX + barWidth / 2))).toBeLessThan(0.01);
  await expect(page.getByRole("tooltip").getByText(/^CPU:/)).toBeVisible();
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
