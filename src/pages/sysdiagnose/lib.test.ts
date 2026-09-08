import * as fs from "fs";
import * as path from "path";
import {
  extractBatteryFromPlist,
  parseBatteryText,
  parseBplist,
  parseLogText,
  parsePlist,
  parseTar,
  parseXmlPlist,
  redact,
} from "./lib";

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
  it("redacts PII", () => {
    expect(redact("mail a@b.com", true)).toContain("[redacted-email]");
    expect(redact("mail a@b.com", false)).toContain("a@b.com");
  });
  it("parseTar round-trips a minimal archive", () => {
    const enc = new TextEncoder();
    const header = new Uint8Array(512);
    enc.encodeInto("a.txt", header.subarray(0, 100));
    enc.encodeInto("00000000005", header.subarray(124, 135));
    const body = enc.encode("hello");
    const block = new Uint8Array(512);
    block.set(body);
    const tar = new Uint8Array(512 + 512 + 1024);
    tar.set(header, 0);
    tar.set(block, 512);
    const entries = parseTar(tar);
    expect(entries[0].path).toBe("a.txt");
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
            },
          ],
        },
      },
    });
    expect(data?.points).toHaveLength(2);
    expect(data?.points[0].level).toBe(80);
    expect(data?.charging).toHaveLength(1);
    expect(data?.apps[0].name).toBe("Safari");
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
