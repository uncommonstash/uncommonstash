import { expect, test } from "@playwright/test";

test("Cronformer downloads and runs locally in the browser", async ({
  page,
}) => {
  await page.goto("/text-to-cron");
  await page
    .getByPlaceholder("e.g. every last day of the month at 2pm")
    .fill("every weekday at 9am");

  const suggestions = page.locator("button:has(div.font-mono)");
  await expect(suggestions).toHaveCount(1, { timeout: 90000 });
  await expect(suggestions).toContainText(/^\S+(?:\s+\S+){4}/);
});
