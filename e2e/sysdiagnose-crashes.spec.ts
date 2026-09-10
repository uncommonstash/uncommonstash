import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";

function crashFixture(): Buffer {
  const crash = (time: string) =>
    `${JSON.stringify({ app_name: "Example", bundleID: "com.example.app", timestamp: time })}\n${JSON.stringify(
      {
        captureTime: time,
        procName: "Example",
        procPath: "/private/var/mobile/Example.app/Example",
        bundleInfo: { CFBundleIdentifier: "com.example.app" },
        exception: { type: "EXC_BREAKPOINT", signal: "SIGTRAP" },
        termination: { namespace: "SIGNAL", code: 5, indicator: "Trace trap" },
      },
    )}`;
  const files = [
    {
      name: "sample/crashes_and_spins/Example-2026-09-07-110815.ips",
      body: crash("2026-09-07 11:08:15.00 -0700"),
    },
    {
      name: "sample/crashes_and_spins/Example-2026-09-07-120815.ips",
      body: crash("2026-09-07 12:08:15.00 -0700"),
    },
    {
      name: "sample/crashes_and_spins/JetsamEvent-2026-09-07-163554.ips",
      body: `${JSON.stringify({ bug_type: "298", timestamp: "2026-09-07 16:35:54.00 -0700" })}\n${JSON.stringify(
        {
          date: "2026-09-07 16:35:54.22 -0700",
          memoryStatus: { pageSize: 16384 },
          largestProcess: "News",
          processes: [{ name: "Example", reason: "highwater", rpages: 100 }],
        },
      )}`,
    },
    {
      name: "sample/crashes_and_spins/Example.cpu_resource-2026-09-07-122155.ips",
      body: `${JSON.stringify({ app_name: "Example", timestamp: "2026-09-07 12:21:55.00 -0700" })}\nCommand: Example\nIdentifier: com.example.app`,
    },
  ];
  const blocks: Buffer[] = [];
  for (const file of files) {
    const body = Buffer.from(file.body);
    const header = Buffer.alloc(512);
    header.write(file.name);
    header.write(body.length.toString(8).padStart(11, "0"), 124);
    header[156] = "0".charCodeAt(0);
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

test("Sysdiagnose Crashes keeps reports local, groups recurrences, and redacts raw reports", async ({
  page,
}) => {
  await page.goto("/sysdiagnose");
  await page.locator('input[type="file"]').setInputFiles({
    name: "sysdiagnose-crashes.tar.gz",
    mimeType: "application/gzip",
    buffer: crashFixture(),
  });
  await page.getByRole("button", { name: "Crashes" }).click();

  await expect(page.getByTestId("crashes-tab")).toContainText("4 reports");
  await expect(
    page.getByText("No captured kernel panic report in this archive"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Jetsam 1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Panic 0/ })).toBeVisible();
  const eventRows = page
    .getByRole("table", { name: "Crash events" })
    .getByRole("row");
  await expect(eventRows.nth(1)).toContainText("Jetsam");

  await eventRows.nth(3).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Raw report")).toBeVisible();
  await expect(sheet.locator("pre")).toContainText("[redacted-path]");
  await sheet.getByRole("switch", { name: "Redact filesystem paths" }).click();
  await expect(sheet.locator("pre")).toContainText(
    "/private/var/mobile/Example.app/Example",
  );
  await sheet.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Groups" }).click();
  const groups = page.getByRole("table", { name: "Crash recurrence groups" });
  await expect(groups.getByRole("row", { name: /App crash.*2/ })).toBeVisible();
  await groups.getByRole("row", { name: /App crash.*2/ }).click();
  await expect(page.getByText("Recurrence group · 2 reports")).toBeVisible();
  await expect(
    page.getByText("All original reports remain available below."),
  ).toBeVisible();
});
