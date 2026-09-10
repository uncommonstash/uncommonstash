import type { ArchiveEntry } from "@/pages/sysdiagnose/lib";
import { analyzeWifiEntries, parseWifiCsv, parseWifiDate } from "./analysis";

function tarMember(name: string, body: string): Uint8Array {
  const encoder = new TextEncoder();
  const data = encoder.encode(body);
  const header = new Uint8Array(512);
  encoder.encodeInto(name, header.subarray(0, 100));
  encoder.encodeInto(
    data.length.toString(8).padStart(11, "0"),
    header.subarray(124, 135),
  );
  header[156] = "0".charCodeAt(0);
  const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
  padded.set(data);
  const out = new Uint8Array(512 + padded.length + 1024);
  out.set(header);
  out.set(padded, 512);
  return out;
}

function entry(path: string, data: Uint8Array | string): ArchiveEntry {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  return { path, size: bytes.length, mtime: 0, kind: "binary", data: bytes };
}

describe("WiFi analysis", () => {
  it("parses quoted CSV values without splitting embedded commas or lines", () => {
    expect(
      parseWifiCsv(
        '"date","status"\n"2026-09-07_17:42:00.000","a, b"\n"2026-09-07_17:43:00.000","one\ntwo"\n',
      ),
    ).toEqual([
      { row: 2, fields: { date: "2026-09-07_17:42:00.000", status: "a, b" } },
      {
        row: 3,
        fields: { date: "2026-09-07_17:43:00.000", status: "one\ntwo" },
      },
    ]);
  });

  it("anchors timezone-free sample dates to the archive offset and selects CF time", () => {
    const capture = Date.parse("2026-09-07T17:42:39-07:00");
    expect(parseWifiDate("2026-09-07_17:42:00.000", capture, "-07:00")).toBe(
      Date.parse("2026-09-07T17:42:00-07:00"),
    );
    expect(parseWifiDate("2026-09-07_17:42:00.000-0700", capture, null)).toBe(
      Date.parse("2026-09-07T17:42:00-07:00"),
    );
    const cfSeconds = (capture - 978307200000) / 1000;
    expect(parseWifiDate(String(cfSeconds), capture, "-07:00")).toBe(capture);
    expect(parseWifiDate("100", capture, "-07:00")).toBeNull();
  });

  it("derives an evidence-backed finding from nested analytics records", async () => {
    const root =
      "sysdiagnose_2026.09.07_17-42-39-0700_iPhone-OS_iPhone_23G83/WiFi/";
    const leave = [
      '"date","network","bss","reason"',
      '"2026-09-07_17:30:00.000","network-a","bss-a","TriggerDisconnect"',
      '"2026-09-07_17:33:00.000","network-a","bss-a","TriggerDisconnect"',
      '"2026-09-07_17:36:00.000","network-a","bss-a","TriggerDisconnect"',
    ].join("\n");
    const result = await analyzeWifiEntries([
      entry(
        `${root}wifi_status.txt`,
        "Interface Name : en0\nSSID : Example\nRSSI : -50\n",
      ),
      entry(
        `${root}Entity_2026-09-07_17:43:09.515_Leave.csv.tgz`,
        tarMember("Leave.csv", leave),
      ),
    ]);
    expect(result.eventRange).toEqual({
      startMs: Date.parse("2026-09-07T17:30:00-07:00"),
      endMs: Date.parse("2026-09-07T17:36:00-07:00"),
    });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "flapping",
          evidence: expect.arrayContaining([
            expect.objectContaining({
              row: 2,
              source: expect.stringContaining("Leave.csv.tgz"),
            }),
          ]),
        }),
      ]),
    );
  });
});
