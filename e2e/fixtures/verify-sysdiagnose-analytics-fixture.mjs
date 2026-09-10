import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixtureDirectory = new URL(".", import.meta.url).pathname;
const expectedPath = new URL(
  "./sysdiagnose-query-mock.expected.json",
  import.meta.url,
).pathname;
const generatorPath = new URL(
  "./build-sysdiagnose-analytics-fixture.mjs",
  import.meta.url,
).pathname;
const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "uncommonstash-sysdiagnose-fixture-check-"),
);

try {
  const generatedFixturePath = join(
    temporaryDirectory,
    "sysdiagnose-query-mock.tar.gz",
  );
  const generatedExpectedPath = join(
    temporaryDirectory,
    "sysdiagnose-query-mock.expected.json",
  );
  execFileSync(process.execPath, [generatorPath], {
    env: {
      ...process.env,
      SYSDIAGNOSE_FIXTURE_EXPECTED_OUTPUT: generatedExpectedPath,
      SYSDIAGNOSE_FIXTURE_OUTPUT: generatedFixturePath,
    },
    stdio: "inherit",
  });

  if (readFileSync(generatedFixturePath).byteLength === 0) {
    throw new Error("Sysdiagnose fixture generator produced an empty archive.");
  }

  const expected = readFileSync(expectedPath);
  const generatedExpected = readFileSync(generatedExpectedPath);
  if (!expected.equals(generatedExpected)) {
    throw new Error(
      `Generated golden oracle differs from ${join(fixtureDirectory, "sysdiagnose-query-mock.expected.json")}.`,
    );
  }

  console.log("Sysdiagnose fixture generator: semantic oracle matches.");
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}
