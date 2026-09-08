import { parseBatteryText, parseLogText, parseTar, redact } from "./lib";

describe("sysdiagnose lib", () => {
  it("parses battery csv", () => {
    const pts = parseBatteryText("2024-05-01T10:00:00Z,92,com.a.app,5\n2024-05-01T10:10:00Z,88,com.a.app,9\n");
    expect(pts).toHaveLength(2);
    expect(pts[0].level).toBe(92);
  });
  it("parses logs", () => {
    const lines = parseLogText("a.log", "2024-05-01T10:00:01Z [Error] SpringBoard[12]: boom\nhello");
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
});
