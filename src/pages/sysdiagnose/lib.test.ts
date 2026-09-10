import * as fs from "fs";
import * as path from "path";
import {
  extractBatteryFromPlist,
  findBatteryPlistEntry,
  inferSysdiagnoseCaptureTime,
  parseBatteryText,
  parseBplist,
  parseLogText,
  parsePlist,
  parseTar,
  parseXmlPlist,
} from "./lib";

// Minimal tar builder for tests: ustar headers, PAX 'x' headers for names
// >100 chars (like Apple's sysdiagnose archives), GNU 'L' on demand.
function buildTar(
  files: Array<{ name: string; data: string; gnuLong?: boolean }>,
): ReturnType<typeof parseTar> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const body = (data: string) => {
    const raw = enc.encode(data);
    const padded = new Uint8Array(Math.ceil(raw.length / 512) * 512 || 0);
    padded.set(raw);
    chunks.push(padded);
  };
  const paxHeader = (name: string, size: number, type: string, prefix = "") => {
    const h = new Uint8Array(512);
    enc.encodeInto(name.slice(0, 100), h.subarray(0, 100));
    enc.encodeInto(prefix.slice(0, 155), h.subarray(345, 500));
    enc.encodeInto(size.toString(8).padStart(11, "0"), h.subarray(124, 135));
    h[156] = type.charCodeAt(0);
    enc.encodeInto("ustar", h.subarray(257, 262));
    chunks.push(h);
  };
  for (const f of files) {
    if (f.gnuLong) {
      paxHeader("././@LongLink", enc.encode(f.name).length + 1, "L");
      body(`${f.name}\0`);
      paxHeader(f.name.slice(0, 100), enc.encode(f.data).length, "0");
      body(f.data);
    } else if (f.name.length > 100) {
      const slash = f.name.lastIndexOf("/", 155);
      if (slash > 0 && f.name.length - slash - 1 <= 100) {
        // Real ustar split: prefix + short name.
        paxHeader(
          f.name.slice(slash + 1),
          enc.encode(f.data).length,
          "0",
          f.name.slice(0, slash),
        );
        body(f.data);
      } else {
        // PAX extended header carrying the full path.
        const kv = `path=${f.name}\n`;
        let rec = `100 ${kv}`;
        for (let i = 0; i < 3; i++) {
          rec = `${enc.encode(rec).length} ${kv}`;
        }
        paxHeader("paxheader", enc.encode(rec).length, "x");
        body(rec);
        paxHeader(f.name.slice(0, 100), enc.encode(f.data).length, "0");
        body(f.data);
      }
    } else {
      paxHeader(f.name, enc.encode(f.data).length, "0");
      body(f.data);
    }
  }
  chunks.push(new Uint8Array(1024)); // end-of-archive zeros
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return parseTar(out);
}

describe("sysdiagnose lib", () => {
  it("parses battery csv", () => {
    const pts = parseBatteryText(
      "2024-05-01T10:00:00Z,92,com.a.app,5\n2024-05-01T10:10:00Z,88,com.a.app,9\n",
    );
    expect(pts).toHaveLength(2);
    expect(pts[0].level).toBe(92);
  });
  it("parses logs", () => {
    const lines = parseLogText(
      "a.log",
      "2024-05-01T10:00:01Z [Error] SpringBoard[12]: boom\nhello",
    );
    expect(lines.length).toBe(2);
    expect(lines[0].level).toBe("error");
  });
  it("parseTar round-trips a minimal archive", () => {
    const entries = buildTar([{ name: "a.txt", data: "hello" }]);
    expect(entries[0].path).toBe("a.txt");
    expect(new TextDecoder().decode(entries[0].data)).toBe("hello");
  });
  it("prefers the canonical BatteryUI plist path", () => {
    const entry = (path: string) => ({
      path,
      size: 0,
      mtime: 0,
      kind: "plist" as const,
      data: new Uint8Array(),
    });
    expect(
      findBatteryPlistEntry([
        entry("other/BatteryUISysdiagnose.plist"),
        entry("logs/BatteryUIPlist/BatteryUISysdiagnose.plist"),
      ])?.path,
    ).toBe("logs/BatteryUIPlist/BatteryUISysdiagnose.plist");
  });
  it("anchors Powerlog to the sysdiagnose capture timestamp", () => {
    const path =
      "sysdiagnose_2026.09.07_17-42-39-0700_iPhone-OS_iPhone_23G83/logs/powerlogs/powerlog.PLSQL";
    expect(inferSysdiagnoseCaptureTime([{ path }], 0)).toBe(
      Date.parse("2026-09-07T17:42:39-0700"),
    );
    expect(
      inferSysdiagnoseCaptureTime([{ path: "logs/powerlog.PLSQL" }], 42),
    ).toBe(42);
  });
  it("parseTar reports continuous scan progress", () => {
    const files = Array.from({ length: 300 }, (_, i) => ({
      name: `f${i}.txt`,
      data: "x",
    }));
    // buildTar returns entries; rebuild raw bytes to pass a callback.
    const enc = new TextEncoder();
    const chunks: Uint8Array[] = [];
    for (const f of files) {
      const h = new Uint8Array(512);
      enc.encodeInto(f.name, h.subarray(0, 100));
      enc.encodeInto("1".padStart(11, "0"), h.subarray(124, 135));
      h[156] = "0".charCodeAt(0);
      const body = new Uint8Array(512);
      body.set(enc.encode(f.data));
      chunks.push(h, body);
    }
    chunks.push(new Uint8Array(1024));
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const raw = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      raw.set(c, at);
      at += c.length;
    }
    const seen: Array<[number, number, number]> = [];
    const entries = parseTar(raw, (off, t, n) => seen.push([off, t, n]));
    expect(entries).toHaveLength(300);
    expect(seen.length).toBeGreaterThan(0);
    // Monotonic offsets, constant total, live file counts.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i][0]).toBeGreaterThanOrEqual(seen[i - 1][0]);
      expect(seen[i][1]).toBe(total);
      expect(seen[i][2]).toBeGreaterThanOrEqual(seen[i - 1][2]);
    }
    expect(seen[seen.length - 1][2]).toBe(300);
  });
  it("ingestFile reports real progress stages", async () => {
    const tarBytes = (() => {
      const enc = new TextEncoder();
      const h = new Uint8Array(512);
      enc.encodeInto("a.txt", h.subarray(0, 100));
      enc.encodeInto("5".padStart(11, "0"), h.subarray(124, 135));
      const body = new Uint8Array(512);
      body.set(enc.encode("hello"));
      const out = new Uint8Array(512 + 512 + 1024);
      out.set(h, 0);
      out.set(body, 512);
      return out;
    })();
    const seen: string[] = [];
    let last = -1;
    const { ingestFile } = await import("./lib");
    // jsdom Blob lacks stream()/arrayBuffer(); stub a minimal file.
    const stub = {
      size: tarBytes.length,
      arrayBuffer: async () =>
        tarBytes.buffer.slice(
          tarBytes.byteOffset,
          tarBytes.byteOffset + tarBytes.byteLength,
        ),
    };
    const entries = await ingestFile(stub as unknown as Blob, (p) => {
      seen.push(p.stage);
      expect(p.fraction).toBeGreaterThanOrEqual(last);
      last = p.fraction;
    });
    expect(entries).toHaveLength(1);
    expect(seen).toContain("reading");
    expect(seen).toContain("indexing");
    expect(seen[seen.length - 1]).toBe("done");
  });
  it("parseTar resolves ustar prefix, PAX path, and GNU longname", () => {
    const prefixName = `${"d/".repeat(40)}batteryuisysdiagnose.plist`;
    const paxName = `${"z".repeat(120)}.plist`;
    const gnuName = `${"g/".repeat(60)}long.plist`;
    const entries = buildTar([
      { name: "short.txt", data: "s" },
      { name: prefixName, data: "prefix" },
      { name: paxName, data: "pax" },
      { name: gnuName, data: "gnu", gnuLong: true },
    ]);
    expect(entries.map((e) => e.path)).toEqual([
      "short.txt",
      prefixName,
      paxName,
      gnuName,
    ]);
    // PAX header and LongLink entries are consumed, never emitted.
    expect(entries).toHaveLength(4);
  });
  it("rejects non-battery numeric CSV rows", () => {
    const pts = parseBatteryText(
      "<key>PLBatteryUIAppEnergyUsedKey</key>,474.55\n2024-05-01T10:00:00Z,999\n2024-05-01T10:10:00Z,88\n",
    );
    expect(pts).toHaveLength(1);
    expect(pts[0].level).toBe(88);
  });
  it("extracts curve + apps from BatteryUI plist object", () => {
    const data = extractBatteryFromPlist({
      Graph: {
        PLBatteryUIGraph24hrs: {
          PLBatteryUIBatteryLevelsKey: [
            [80, 0],
            [79, 0],
            [-1, 1],
          ],
          PLBatteryUIChargingStateIntervalsDictKey: {
            PLBatteryUIChargingIntervalsKey: [[100, 200]],
          },
        },
      },
      endOfDay: 1788850800,
      Breakdown: {
        PLBatteryUIQueryRangeDayKey: {
          PLBatteryUIAppArrayKey: [
            {
              PLBatteryUIAppNameKey: "Safari",
              PLBatteryUIAppBundleIDKey: "com.apple.mobilesafari",
              PLBatteryUIAppEnergyUsedKey: 100.5,
              PLBatteryUIAppForegroundRuntimeKey: 60,
              PLBatteryUIAppBackgroundRuntimeKey: 30,
              CPU: 12.5,
              DisplayDynamic: 30,
              NeuralEngine: 4,
              PLBatteryUIMetadataVersion: 99,
              InternalCounter: 1000,
              "Foreground-CPU": 3,
            },
          ],
        },
      },
    });
    expect(data?.points).toHaveLength(2);
    expect(data?.points[0].level).toBe(80);
    expect(data?.charging).toHaveLength(1);
    expect(data?.apps[0].name).toBe("Safari");
    expect(data?.apps[0].components).toEqual({
      CPU: 12.5,
      DisplayDynamic: 30,
      NeuralEngine: 4,
      "Foreground-CPU": 3,
    });
  });
  it("parses XML and binary plists", () => {
    const xml = new TextEncoder().encode(
      '<?xml version="1.0"?><plist version="1.0"><dict><key>a</key><integer>3</integer><key>b</key><array><string>x</string></array></dict></plist>',
    );
    expect(parseXmlPlist(xml)).toEqual({ a: 3, b: ["x"] });
    const bin = new Uint8Array(
      fs.readFileSync(path.join(__dirname, "fixtures-battery-sample.bplist")),
    );
    const obj = parseBplist(bin) as Record<string, unknown>;
    expect(obj["endOfDay"] as number).toBe(1788850800);
    // auto-detect entry point works for both encodings
    expect((parsePlist(bin) as Record<string, unknown>)["endOfDay"]).toBe(
      1788850800,
    );
    expect(extractBatteryFromPlist(parsePlist(bin))?.apps[0].bundleId).toBe(
      "com.apple.mobilesafari",
    );
  });
});
