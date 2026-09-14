import { expect, test } from "@playwright/test";
import { CronExpressionParser } from "cron-parser";

test("Cronformer converts the first request on a fresh page load", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/text-to-cron");
  await page
    .getByPlaceholder("e.g. every last day of the month at 2pm")
    .fill("every day 1 pm");

  const suggestions = page.locator("button:has(div.font-mono)");
  await expect(suggestions).toHaveCount(1, { timeout: 90000 });
  await expect(suggestions).toContainText(/^\S+(?:\s+\S+){4}/);
  await expect(
    page.getByText("Cronformer could not start. Try again in a moment."),
  ).toHaveCount(0);
  const cron = await suggestions.locator("div.font-mono").textContent();
  expect(cron).not.toBeNull();
  expect(() => CronExpressionParser.parse(cron ?? "")).not.toThrow();
  await expect(page.getByRole("status")).toBeHidden();
});
