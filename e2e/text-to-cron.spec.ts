import { expect, test } from "@playwright/test";

test("Cronformer converts text to a cron expression in the browser", async ({
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
  await expect(page.getByRole("status")).toBeHidden();
});
