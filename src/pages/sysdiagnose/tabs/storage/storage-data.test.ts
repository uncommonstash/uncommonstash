import type { ArchiveEntry } from "../../lib";
import {
  extractStorageArtifacts,
  parseApfsStats,
  parseDisksText,
  parseDiskWriteReport,
  parseFileProviderDiagnostics,
  parseFsckLog,
} from "./storage-data";

const encode = new TextEncoder();

function entry(path: string, data: string): ArchiveEntry {
  return {
    path,
    size: data.length,
    mtime: 0,
    kind:
      path.endsWith(".ips") || path.endsWith(".txt") || path.endsWith(".log")
        ? "text"
        : "binary",
    data: encode.encode(data),
  };
}

describe("storage artifact parsers", () => {
  it("parses only valid df-style volume rows", () => {
    const volumes =
      parseDisksText(`Filesystem  Size  Used  Avail Capacity iused ifree %iused Mounted on
/dev/disk3s1  128G  64G  64G  50%  10k  1M  1%  /private/var
broken row\n`);
    expect(volumes).toEqual([
      {
        filesystem: "/dev/disk3s1",
        total: "128G",
        used: "64G",
        available: "64G",
        capacity: "50%",
        mountPoint: "/private/var",
      },
    ]);
    expect(parseDisksText("not a volume table")).toEqual([]);
  });

  it("marks fsck OK only for Apple's exact terminal grammar", () => {
    const runs =
      parseFsckLog(`/dev/disk1s1: fsck_apfs started at Mon Jan 1 00:00:00 2026
/dev/disk1s1: ** The volume /dev/rdisk1s1 appears to be OK.
/dev/disk1s1: fsck_apfs completed at Mon Jan 1 00:00:01 2026

/dev/disk2s1: fsck_apfs started at Tue Jan 2 00:00:00 2026
/dev/disk2s1: another result
/dev/disk2s1: fsck_apfs completed at Tue Jan 2 00:00:01 2026`);
    expect(runs.map((run) => run.status)).toEqual(["ok", "unclassified"]);
    expect(runs[0].resultText).toContain("appears to be OK.");
    expect(runs[1].resultText).toBeNull();
  });

  it("recognizes only validated disk-write resource IPS reports", () => {
    const valid = entry(
      "crashes/Example.diskwrites_resource-2026-09-07-141318.ips",
      `${JSON.stringify({ app_name: "Example", timestamp: "2026-09-07 14:13:18.00 -0700", bug_type: "145" })}\nEvent:            disk writes\nCommand:          Example`,
    );
    expect(parseDiskWriteReport(valid)).toMatchObject({
      process: "Example",
      reportType: "disk writes",
    });
    expect(
      parseDiskWriteReport(
        entry(
          "crashes/Other.diskwrites_resource-2026-09-07-141318.ips",
          '{"bug_type":"145"}\nEvent: cpu usage',
        ),
      ),
    ).toBeNull();
    expect(
      parseDiskWriteReport(entry("crashes/Example.ips", valid.data.toString())),
    ).toBeNull();
  });

  it("keeps APFS counters as grouped raw names and values", () => {
    expect(
      parseApfsStats(`Device: disk0, block size 4096
APFSContainer: disk2
  Metadata: Number of write errors = 0
  mem.current = 0x2750000`),
    ).toEqual([
      {
        name: "APFSContainer: disk2",
        counters: [
          { name: "Metadata: Number of write errors", value: "0" },
          { name: "mem.current", value: "0x2750000" },
        ],
      },
    ]);
  });

  it("summarizes marked File Provider checks and retains raw sources", () => {
    const diagnostics = parseFileProviderDiagnostics([
      entry(
        "FileProvider/com.example.drive/check.log",
        "a-file.pdf: ❌ Left : has_wrong_protection_class\n✅ FSSnapshot succeeded on 2 files.\n❌ disk <-> FSSnapshot failed on 1/2 files.",
      ),
    ]);
    expect(diagnostics.providers).toEqual(["com.example.drive"]);
    expect(diagnostics.findings.map((finding) => finding.status)).toEqual([
      "pass",
      "fail",
    ]);
    expect(diagnostics.findings.map((finding) => finding.text)).not.toContain(
      expect.stringContaining("has_wrong_protection_class"),
    );
    expect(diagnostics.sources[0].raw).toContain("FSSnapshot");
  });

  it("extracts all storage artifact families without inventing absent values", () => {
    const artifacts = extractStorageArtifacts([
      entry(
        "sysdiagnose_2026.09.07_17-42-39-0700_iPhone/disks.txt",
        "Filesystem  Size  Used  Avail Capacity iused ifree %iused Mounted on\n/dev/disk3s1  128G  64G  64G  50%  10k  1M  1%  /",
      ),
    ]);
    expect(artifacts.volumes).toHaveLength(1);
    expect(artifacts.fsck.raw).toBeNull();
    expect(artifacts.apfs.raw).toBeNull();
    expect(artifacts.writeEvents).toEqual([]);
  });
});
