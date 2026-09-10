import type { ArchiveEntry } from "../../lib";
import {
  buildCrashRecords,
  groupCrashRecords,
  redactCrashRaw,
} from "./crash-model";

const encoder = new TextEncoder();

function entry(path: string, data: string, mtime = 0): ArchiveEntry {
  return {
    path: `sysdiagnose_2026.09.07_17-42-39-0700_iPhone-OS_iPhone_23G83/${path}`,
    data: encoder.encode(data),
    size: data.length,
    mtime,
    kind: "text",
  };
}

const appCrash = (timestamp: string, suffix: string) =>
  entry(
    `crashes_and_spins/Example-${suffix}.ips`,
    `${JSON.stringify({ app_name: "Example", bundleID: "com.example.app", timestamp })}\n${JSON.stringify(
      {
        captureTime: timestamp,
        procName: "Example",
        bundleInfo: { CFBundleIdentifier: "com.example.app" },
        exception: { type: "EXC_BREAKPOINT", signal: "SIGTRAP" },
        termination: { namespace: "SIGNAL", code: 5, indicator: "Trace trap" },
      },
    )}`,
  );

describe("crash report model", () => {
  it("parses a two-JSON-object app crash and keeps the structured cause", () => {
    const [report] = buildCrashRecords([
      appCrash("2026-09-07 11:08:15.00 -0700", "2026-09-07-110815"),
    ]);
    expect(report.reportClass).toBe("app-crash");
    expect(report.process).toBe("Example");
    expect(report.bundleId).toBe("com.example.app");
    expect(report.condition).toContain("EXC_BREAKPOINT");
    expect(report.condition).toContain("SIGNAL: Trace trap");
  });

  it("uses the jettisoned process and memory fields from a Jetsam report", () => {
    const [report] = buildCrashRecords([
      entry(
        "crashes_and_spins/JetsamEvent-2026-09-07-163554.ips",
        `${JSON.stringify({ bug_type: "298", timestamp: "2026-09-07 16:35:54.00 -0700" })}\n${JSON.stringify(
          {
            date: "2026-09-07 16:35:54.22 -0700",
            memoryStatus: { pageSize: 16384 },
            largestProcess: "News",
            processes: [
              { name: "Other", rpages: 1 },
              { name: "Health", reason: "highwater", rpages: 100 },
            ],
          },
        )}`,
      ),
    ]);
    expect(report.reportClass).toBe("jetsam");
    expect(report.process).toBe("Health");
    expect(report.condition).toBe("highwater");
    expect(report.jetsam).toEqual({
      largestProcess: "News",
      pageSize: 16384,
      victimPages: 100,
    });
  });

  it("uses resource filename families and translated-text labels", () => {
    const reports = buildCrashRecords([
      entry(
        "crashes_and_spins/CoreRoutine.cpu_resource-2026-09-07-122155.ips",
        `${JSON.stringify({ app_name: "CoreRoutine", timestamp: "2026-09-07 12:21:55.00 -0700" })}\nDate/Time: 2026-09-07 12:20:04.061 -0700\nCommand: CoreRoutine\nIdentifier: com.apple.core`,
      ),
      entry(
        "crashes_and_spins/Instagram.diskwrites_resource-2026-09-07-141318.ips",
        `${JSON.stringify({ app_name: "Instagram", timestamp: "2026-09-07 14:13:18.00 -0700" })}\nCommand: Instagram\nIdentifier: com.example.instagram`,
      ),
    ]);
    expect(reports.map((report) => report.reportClass)).toEqual([
      "disk-write-resource",
      "cpu-resource",
    ]);
    expect(reports[1].bundleId).toBe("com.apple.core");
  });

  it("retains malformed stack captures as unclassified and falls back to filename time", () => {
    const [report] = buildCrashRecords([
      entry(
        "crashes_and_spins/stacks-2026-09-07-174339.ips",
        "not JSON\nstackshot via sysdiagnose",
      ),
    ]);
    expect(report.reportClass).toBe("unclassified");
    expect(report.subtype).toBe("Diagnostic stack capture");
    expect(report.sourceLabel).toBe("stacks");
    expect(report.incidentTime).toBe(Date.parse("2026-09-07T17:43:39"));
  });

  it("uses the source artifact stem when a telemetry report has no process", () => {
    const [report] = buildCrashRecords([
      entry(
        "crashes_and_spins/SiriSearchFeedback-2026-09-06-182219.ips",
        `${JSON.stringify({ bug_type: "226", timestamp: "2026-09-06 18:22:19.00 -0700" })}\n${JSON.stringify({ events: [] })}`,
      ),
    ]);
    expect(report.process).toBeUndefined();
    expect(report.sourceLabel).toBe("SiriSearchFeedback");
  });

  it("detects panic reports and excludes IPS files outside crashes_and_spins", () => {
    const reports = buildCrashRecords([
      entry("crashes_and_spins/panic-2026-09-07-170000.ips", "{}\n{}"),
      entry("logs/not-a-crash.ips", "{}\n{}"),
    ]);
    expect(reports).toHaveLength(1);
    expect(reports[0].reportClass).toBe("panic");
  });

  it("groups recurrence fingerprints without removing original reports", () => {
    const reports = buildCrashRecords([
      appCrash("2026-09-07 11:08:15.00 -0700", "2026-09-07-110815"),
      appCrash("2026-09-07 12:08:15.00 -0700", "2026-09-07-120815"),
    ]);
    const [group] = groupCrashRecords(reports);
    expect(group.reports).toHaveLength(2);
    expect(group.explanation).toContain("EXC_BREAKPOINT");
    expect(group.latestIncidentTime).toBe(reports[0].incidentTime);
  });

  it("redacts identifiers and paths independently", () => {
    const raw =
      "incident 123e4567-e89b-12d3-a456-426614174000 email a@b.com path /private/var/mobile/test";
    expect(redactCrashRaw(raw, { identifiers: true, paths: false })).toContain(
      "[redacted-identifier]",
    );
    expect(redactCrashRaw(raw, { identifiers: true, paths: false })).toContain(
      "/private/var/mobile/test",
    );
    expect(redactCrashRaw(raw, { identifiers: false, paths: true })).toContain(
      "[redacted-path]",
    );
    expect(redactCrashRaw(raw, { identifiers: false, paths: true })).toContain(
      "123e4567-e89b-12d3-a456-426614174000",
    );
  });
});
