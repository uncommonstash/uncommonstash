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
  const pageTitleBox = await pageTitle.boundingBox();
  expect(pageTitleBox).not.toBeNull();
  if (!pageTitleBox) throw new Error("Sysdiagnose title is missing");
  expect(pageTitleBox.y).toBeGreaterThanOrEqual(0);
  const viewToggle = page.getByRole("group", { name: "Battery view" });
  await expect(viewToggle).toBeVisible();
  const viewToggleBox = await viewToggle.boundingBox();
  expect(viewToggleBox).not.toBeNull();
  if (!viewToggleBox) throw new Error("Battery view control is missing");
  expect(viewToggleBox.width).toBeLessThan(300);
  expect(viewToggleBox.x).toBeGreaterThan(pageTitleBox.x);
  expect(Math.abs(viewToggleBox.y - pageTitleBox.y)).toBeLessThanOrEqual(8);
  await expect(
    viewToggle.getByRole("button", { name: "Battery", exact: true }),
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
  expect(batteryChartBox.height).toBeCloseTo(256, 0);
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
  const appSummary = page.getByRole("table", {
    name: "App energy and runtime",
  });
  const appEnergy = await appSummary
    .getByRole("row")
    .evaluateAll((rows) =>
      rows
        .slice(1)
        .map((row) => Number.parseFloat(row.cells[1]?.textContent ?? "0") || 0),
    );
  expect(appEnergy).toEqual([...appEnergy].sort((left, right) => right - left));
  expect(appEnergy[0]).toBeCloseTo(
    Math.max(...Object.values(golden.appEnergyMWh)),
    2,
  );
  await expect(
    appSummary.getByRole("columnheader", { name: "Energy (mWh)" }),
  ).toHaveAttribute("aria-sort", "descending");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);
  const appTableViewport = page
    .getByTestId("app-table-scroll")
    .locator("[data-radix-scroll-area-viewport]")
    .first();
  await expect
    .poll(() => appTableViewport.evaluate((element) => element.clientHeight))
    .toBeGreaterThan(0);
  await safari.getByText("Safari", { exact: true }).hover();
  await expect(page.getByRole("tooltip")).toHaveText("com.apple.mobilesafari");
  await safari.click();
  const appDetail = page.getByRole("dialog");
  await expect(
    appDetail.getByRole("heading", { name: "Safari" }),
  ).toBeVisible();
  await expect(appDetail.getByText("com.apple.mobilesafari")).toBeVisible();
  await expect(appDetail.getByText("Energy records")).toBeVisible();
  await appDetail.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText(/^Source:/)).toHaveCount(0);

  await page.getByRole("button", { name: "Energy" }).click();
  const chart = page.locator('svg[aria-label="Energy by component chart"]');
  await expect(chart).toBeVisible();
  await expect(page.getByText("Energy by component")).toBeVisible();
  await expect(page.getByText(/Hourly SUM\(Energy\)|RootNodeID/)).toHaveCount(
    0,
  );
  await expect(
    chart.locator("g[data-interval-start-ms] rect").first(),
  ).toBeVisible();
  const chartBox = await chart.boundingBox();
  expect(chartBox).not.toBeNull();
  if (!chartBox) throw new Error("component chart is missing");
  const yAxisLabelLeftEdges = await chart
    .locator("text")
    .evaluateAll((labels) =>
      labels.slice(0, 5).map((label) => label.getBoundingClientRect().left),
    );
  expect(yAxisLabelLeftEdges.every((left) => left >= chartBox.x)).toBe(true);
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

test("a Battery UI selection leaves the component timeline fixed and updates the app table", async ({
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
  const fullStart = await chart.getAttribute("data-selected-start-ms");
  const fullEnd = await chart.getAttribute("data-selected-end-ms");
  expect(fullStart).not.toBeNull();
  expect(fullEnd).not.toBeNull();
  const safari = page.getByRole("row", { name: /Safari/ });
  const fullSafariEnergy = await safari.getByRole("cell").nth(1).textContent();

  await page.mouse.move(box.x + box.width * 0.32, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.54, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(chart).not.toHaveAttribute("data-selected-start-ms", fullStart);
  await expect(chart).not.toHaveAttribute("data-selected-end-ms", fullEnd);
  await expect(page.getByRole("button", { name: "Reset range" })).toHaveCount(
    0,
  );

  // A click in the chart has always meant "clear this selected range"; it
  // must not leave behind a zero-width selection.
  await chart.click({ position: { x: box.width * 0.7, y: box.height / 2 } });
  await expect(chart).toHaveAttribute("data-selected-start-ms", fullStart);
  await expect(chart).toHaveAttribute("data-selected-end-ms", fullEnd);

  // Select again so this assertion also proves full source intervals expand a
  // non-aligned Battery UI range.
  await page.mouse.move(box.x + box.width * 0.32, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.54, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  const selectedStart = await chart.getAttribute("data-selected-start-ms");
  const selectedEnd = await chart.getAttribute("data-selected-end-ms");
  expect(selectedStart).not.toBeNull();
  expect(selectedEnd).not.toBeNull();
  await expect(safari.getByRole("cell").nth(1)).not.toHaveText(
    fullSafariEnergy ?? "",
  );
  const selectedSafariEnergy = await safari
    .getByRole("cell")
    .nth(1)
    .textContent();
  await page.getByRole("button", { name: "Energy" }).click();
  const source = page.locator('svg[aria-label="Energy by component chart"]');
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute("data-selected-start-ms", selectedStart);
  await expect(source).toHaveAttribute("data-selected-end-ms", selectedEnd);
  await expect(safari.getByRole("cell").nth(1)).toHaveText(
    selectedSafariEnergy ?? "",
  );
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
  expect(requestedStart).toBe(Number(fullStart));
  expect(requestedEnd).toBe(Number(fullEnd));
  await expect(source).toHaveAttribute(
    "data-timeline-start-ms",
    String(effectiveStart),
  );
  await expect(source).toHaveAttribute(
    "data-timeline-end-ms",
    String(effectiveEnd),
  );
  await expect(
    page
      .locator('svg[aria-label="Energy by component chart"]')
      .locator("g[data-interval-start-ms] rect")
      .first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "logs" }).click();
  await expect(page.getByPlaceholder("Search messages")).toBeVisible();
  await page.getByRole("button", { name: "files" }).click();
  await expect(page.getByText("Archive files")).toBeVisible();
});
