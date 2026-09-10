import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const golden = JSON.parse(
  readFileSync("e2e/fixtures/sysdiagnose-query-mock.expected.json", "utf8"),
) as {
  appEnergyMWh: Record<string, number>;
  componentEnergyMWh: Record<string, number>;
  componentIntervals: Array<{
    startMs: number;
    endMs: number;
    componentEnergyMWh: Record<string, number>;
  }>;
};

test("sysdiagnose renders Battery UI locally and queries the mock Powerlog archive", async ({
  page,
}) => {
  await page.goto("/sysdiagnose");
  await page
    .locator('input[type="file"]')
    .setInputFiles("e2e/fixtures/sysdiagnose-query-mock.tar.gz");

  const pageTitle = page.getByRole("heading", { name: "Sysdiagnose" });
  await expect(pageTitle).toBeVisible();
  expect((await pageTitle.boundingBox())?.y).toBeGreaterThanOrEqual(0);
  const viewToggle = page.getByRole("group", { name: "Battery view" });
  await expect(viewToggle).toBeVisible();
  expect((await viewToggle.boundingBox())?.width).toBeLessThan(300);
  await expect(
    page.getByRole("button", { name: "Battery overview" }),
  ).toHaveAttribute("aria-pressed", "true");

  await expect(page.getByText("Battery level from Battery UI")).toBeVisible();
  await expect(
    page.locator('svg[aria-label="Battery level from Battery UI plist"] path'),
  ).toBeVisible();
  const batteryChart = page.locator(
    'svg[aria-label="Battery level from Battery UI plist"]',
  );
  const batteryChartBox = await batteryChart.boundingBox();
  expect(batteryChartBox).not.toBeNull();
  if (!batteryChartBox) throw new Error("battery chart is missing");
  await page.mouse.move(
    batteryChartBox.x + batteryChartBox.width * 0.25,
    batteryChartBox.y + batteryChartBox.height * 0.5,
  );
  await expect(page.getByTestId("chart-sample-tooltip")).toContainText(
    /battery/,
  );
  const safari = page.getByRole("row", { name: /Safari/ });
  await expect(safari).toBeVisible();
  await expect(safari.getByRole("cell").nth(1)).toHaveText(
    `${golden.appEnergyMWh["com.apple.mobilesafari"].toFixed(2)} mWh`,
  );
  await safari.getByText("Safari", { exact: true }).hover();
  await expect(page.getByRole("tooltip")).toHaveText("com.apple.mobilesafari");
  await safari.click();
  const appDetail = page.getByRole("dialog");
  await expect(
    appDetail.getByRole("heading", { name: "Safari" }),
  ).toBeVisible();
  await expect(appDetail.getByText("com.apple.mobilesafari")).toBeVisible();
  await expect(
    appDetail.getByText("Direct Powerlog attribution records"),
  ).toBeVisible();
  await appDetail.getByRole("button", { name: "Close" }).click();
  await expect(
    page
      .getByText(/Source: PLAccountingOperator_Aggregate_RootNodeEnergy/)
      .first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Energy overview" }).click();
  const chart = page.locator(
    'svg[aria-label="Powerlog component totals chart"]',
  );
  await expect(chart).toBeVisible();
  await expect(
    page.getByText(/Hourly SUM\(Energy\), grouped by RootNodeID/),
  ).toBeVisible();
  await expect(page.getByText(/Effective source range:/).first()).toBeVisible();
  await expect(chart.locator("rect").first()).toBeVisible();
  const firstInterval = golden.componentIntervals[0];
  const firstBar = chart.locator("g[data-interval-start-ms]").first();
  await expect(firstBar).toHaveAttribute(
    "data-interval-start-ms",
    String(firstInterval.startMs),
  );
  await expect(firstBar).toHaveAttribute(
    "data-interval-end-ms",
    String(firstInterval.endMs),
  );
  const firstBarBox = await firstBar.boundingBox();
  expect(firstBarBox).not.toBeNull();
  if (!firstBarBox) throw new Error("component interval is missing");
  await page.mouse.move(
    firstBarBox.x + firstBarBox.width / 2,
    firstBarBox.y + firstBarBox.height / 2,
  );
  const tooltip = await page.getByTestId("chart-sample-tooltip").textContent();
  for (const [component, energy] of Object.entries(
    firstInterval.componentEnergyMWh,
  )) {
    expect(tooltip).toContain(`${component}: ${energy.toFixed(3)} mWh`);
  }
});

test("a selected Battery UI range returns complete overlapping Powerlog intervals", async ({
  page,
}) => {
  await page.goto("/sysdiagnose");
  await page
    .locator('input[type="file"]')
    .setInputFiles("e2e/fixtures/sysdiagnose-query-mock.tar.gz");
  await expect(page.getByRole("row", { name: /Safari/ })).toBeVisible();
  const chart = page.locator(
    'svg[aria-label="Battery level from Battery UI plist"]',
  );
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("battery chart is missing");
  await page.mouse.move(box.x + box.width * 0.32, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.54, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  const resetRange = page.getByRole("button", { name: "Reset range" });
  await expect(resetRange).toBeEnabled();

  // A click in the chart has always meant "clear this selected range"; it
  // must not leave behind a zero-width selection.
  await chart.click({ position: { x: box.width * 0.7, y: box.height / 2 } });
  await expect(resetRange).toBeDisabled();

  await page.mouse.move(box.x + box.width * 0.32, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.54, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(resetRange).toBeEnabled();
  await resetRange.click();
  await expect(resetRange).toBeDisabled();

  // Select again so this assertion also proves full source intervals expand a
  // non-aligned Battery UI range.
  await page.mouse.move(box.x + box.width * 0.32, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.54, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await page.getByRole("button", { name: "Energy overview" }).click();
  const source = page.getByText(/Effective source range:/).first();
  await expect(source).toBeVisible();
  const requestedStart = Number(
    await source.getAttribute("data-requested-start-ms"),
  );
  const requestedEnd = Number(
    await source.getAttribute("data-requested-end-ms"),
  );
  const effectiveStart = Number(
    await source.getAttribute("data-effective-start-ms"),
  );
  const effectiveEnd = Number(
    await source.getAttribute("data-effective-end-ms"),
  );
  expect(effectiveStart).toBeLessThanOrEqual(requestedStart);
  expect(effectiveEnd).toBeGreaterThanOrEqual(requestedEnd);
  expect(effectiveStart < requestedStart || effectiveEnd > requestedEnd).toBe(
    true,
  );
  await expect(
    page
      .locator('svg[aria-label="Powerlog component totals chart"] rect')
      .first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "logs" }).click();
  await expect(page.getByPlaceholder("Search messages")).toBeVisible();
  await page.getByRole("button", { name: "files" }).click();
  await expect(page.getByText("Archive files")).toBeVisible();
});
