// WiFi Analytics Store decoding and diagnosis. This module is intentionally
// worker-safe: it does not touch the DOM and returns only structured-cloneable
// values for the UI to render locally.

import {
  type ArchiveEntry,
  inferSysdiagnoseCaptureTime,
  parseTar,
} from "@/pages/sysdiagnose/lib";

export type WifiEventKind = "join" | "leave" | "roam" | "recovery" | "fault";

export interface WifiEvidence {
  source: string;
  row: number;
  fields: Record<string, string>;
}

export interface WifiEvent {
  id: string;
  kind: WifiEventKind;
  ts: number | null;
  networkRef: string | null;
  bssRef: string | null;
  evidence: WifiEvidence;
}

export interface WifiFinding {
  id: string;
  kind:
    | "flapping"
    | "roam-storm"
    | "authentication-failures"
    | "dhcp-failure"
    | "self-assigned-address"
    | "weak-signal";
  title: string;
  detail: string;
  ts: number | null;
  evidence: WifiEvidence[];
}

export interface WifiNetwork {
  id: string;
  ssid: string | null;
  bssids: string[];
  eventCount: number;
  lastSeenMs: number | null;
  bands: string[];
  channels: string[];
  evidence: WifiEvidence[];
}

export interface WifiSnapshot {
  source: string;
  fields: Record<string, string>;
}

export interface WifiConnectivityCheck {
  label: string;
  passed: boolean;
  source: string;
}

export interface WifiAnalysis {
  available: boolean;
  captureMs: number;
  snapshot: WifiSnapshot | null;
  connectivity: WifiConnectivityCheck[];
  events: WifiEvent[];
  networks: WifiNetwork[];
  findings: WifiFinding[];
  eventRange: { startMs: number; endMs: number } | null;
  bssRange: { startMs: number; endMs: number } | null;
  warnings: string[];
}

interface CsvRow {
  row: number;
  fields: Record<string, string>;
}

const EVENT_EXPORTS: Array<[string, WifiEventKind]> = [
  ["Join", "join"],
  ["Leave", "leave"],
  ["Roam", "roam"],
  ["Recovery", "recovery"],
  ["Fault", "fault"],
];
const MAX_EXPANDED_EXPORT_BYTES = 32 * 1024 * 1024;
const TEN_MINUTES = 10 * 60 * 1000;
const PLACEHOLDER = /^(?:|\(null\)|\(nil\))$/i;

function text(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

function known(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return PLACEHOLDER.test(trimmed) ? null : trimmed;
}

function ref(value: string | undefined): string | null {
  return known(value);
}

function range(values: number[]): { startMs: number; endMs: number } | null {
  if (values.length === 0) return null;
  return { startMs: Math.min(...values), endMs: Math.max(...values) };
}

function captureOffset(entries: ArchiveEntry[]): string | null {
  for (const entry of entries) {
    const match =
      /sysdiagnose_\d{4}\.\d{2}\.\d{2}_\d{2}-\d{2}-\d{2}([+-]\d{4})(?:_|\/|$)/i.exec(
        entry.path,
      );
    if (!match) continue;
    return `${match[1].slice(0, 3)}:${match[1].slice(3)}`;
  }
  return null;
}

/** RFC-4180 parser. Analytics rows contain quoted comma-separated arrays. */
export function parseWifiCsv(input: string): CsvRow[] {
  const records: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell.length > 0)) records.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.length > 0)) records.push(row);
  if (records.length < 2) return [];
  const headers = records[0].map((header) => header.trim());
  return records.slice(1).flatMap((cells, index) => {
    if (cells.length !== headers.length) return [];
    return [
      {
        row: index + 2,
        fields: Object.fromEntries(headers.map((h, i) => [h, cells[i]])),
      },
    ];
  });
}

/**
 * Export dates can be ISO wall time (the sample) or numeric Analytics Store
 * epochs. Numeric candidates are accepted only when close to the capture.
 */
export function parseWifiDate(
  value: string | undefined,
  captureMs: number,
  offset: string | null,
): number | null {
  const raw = known(value);
  if (!raw) return null;
  const iso =
    /^(\d{4}-\d{2}-\d{2})[ _](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:Z|[+-]\d{2}:?\d{2})?$/i.exec(
      raw,
    );
  if (iso) {
    const zoneMatch = /(?:Z|[+-]\d{2}:?\d{2})$/i.exec(raw);
    if (!zoneMatch && !offset) return null;
    const zone = zoneMatch
      ? zoneMatch[0] === "Z"
        ? "Z"
        : `${zoneMatch[0].slice(0, 3)}:${zoneMatch[0].slice(-2)}`
      : offset;
    const parsed = Date.parse(`${iso[1]}T${iso[2]}${zone}`);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const number = Number(raw);
  if (!Number.isFinite(number) || !captureMs) return null;
  const cfEpochSeconds = 978307200;
  const candidates = [
    number * 1000,
    number,
    (number + cfEpochSeconds) * 1000,
    number + cfEpochSeconds * 1000,
  ].filter((candidate) => Number.isFinite(candidate));
  const sorted = candidates
    .map((candidate) => ({
      candidate,
      distance: Math.abs(candidate - captureMs),
    }))
    .sort((a, b) => a.distance - b.distance);
  // Ring buffers can cover weeks; 90 days catches realistic history without
  // converting a wrong epoch into a confident-looking timestamp.
  return sorted[0]?.distance <= 90 * 24 * 60 * 60 * 1000
    ? sorted[0].candidate
    : null;
}

function parseLabeledText(
  entry: ArchiveEntry | undefined,
): WifiSnapshot | null {
  if (!entry) return null;
  const fields: Record<string, string> = {};
  for (const line of text(entry.data).split(/\r?\n/)) {
    const match = /^\s*([^:]{2,64}?)\s*:\s*(.*?)\s*$/.exec(line);
    if (match) fields[match[1].trim()] = match[2].trim();
  }
  return Object.keys(fields).length > 0 ? { source: entry.path, fields } : null;
}

function parseConnectivity(
  entry: ArchiveEntry | undefined,
): WifiConnectivityCheck[] {
  if (!entry) return [];
  return text(entry.data)
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^(.+?)\s{2,}[\d.]+\s+(Yes|No)\b/i.exec(line.trim());
      return match
        ? [
            {
              label: match[1].trim(),
              passed: match[2].toLowerCase() === "yes",
              source: entry.path,
            },
          ]
        : [];
    });
}

async function expandAnalyticsExport(entry: ArchiveEntry): Promise<CsvRow[]> {
  let data = entry.data;
  if (data[0] === 0x1f && data[1] === 0x8b) {
    if (typeof DecompressionStream === "undefined")
      throw new Error("gzip decompression is unavailable in this browser");
    const stream = new Blob([data as unknown as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    data = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  if (data.byteLength > MAX_EXPANDED_EXPORT_BYTES)
    throw new Error("export exceeds the 32 MB safety limit");
  const member = parseTar(data).find((item) => /\.csv$/i.test(item.path));
  if (!member) throw new Error("CSV member was not found");
  return parseWifiCsv(text(member.data));
}

function exportEntry(
  entries: ArchiveEntry[],
  name: string,
): ArchiveEntry | undefined {
  return entries.find((entry) =>
    new RegExp(`(?:^|/)WiFi/Entity_.*_${name}\\.csv\\.tgz$`, "i").test(
      entry.path,
    ),
  );
}

function groupKey(event: WifiEvent): string {
  return event.networkRef ?? event.bssRef ?? "unresolved";
}

function withinWindow(events: WifiEvent[]): WifiEvent[] | null {
  for (let start = 0; start < events.length; start += 1) {
    const end = events.findIndex(
      (event, index) =>
        index >= start &&
        (event.ts ?? Infinity) - (events[start].ts ?? -Infinity) > TEN_MINUTES,
    );
    const window = events.slice(start, end < 0 ? undefined : end);
    if (window.length >= 3) return window;
  }
  return null;
}

function diagnose(
  events: WifiEvent[],
  snapshot: WifiSnapshot | null,
): WifiFinding[] {
  const findings: WifiFinding[] = [];
  const dated = events.filter((event) => event.ts !== null);
  for (const kind of ["join", "leave"] as const) {
    const groups = new Map<string, WifiEvent[]>();
    for (const event of dated.filter((event) => event.kind === kind)) {
      const key = groupKey(event);
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    for (const [key, group] of groups) {
      const triggered = withinWindow(
        group.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)),
      );
      if (triggered)
        findings.push({
          id: `flapping:${kind}:${key}:${triggered[0].id}`,
          kind: "flapping",
          title: "Connection flapping",
          detail: `${triggered.length} ${kind} events were recorded within 10 minutes.`,
          ts: triggered[0].ts,
          evidence: triggered.map((event) => event.evidence),
        });
    }
  }
  const roamGroups = new Map<string, WifiEvent[]>();
  for (const event of dated.filter((event) => event.kind === "roam")) {
    const key = groupKey(event);
    roamGroups.set(key, [...(roamGroups.get(key) ?? []), event]);
    if (event.evidence.fields.isPingPong === "1")
      findings.push({
        id: `roam-ping-pong:${event.id}`,
        kind: "roam-storm",
        title: "Ping-pong roam",
        detail: "The WiFi export explicitly marked this roam as ping-pong.",
        ts: event.ts,
        evidence: [event.evidence],
      });
  }
  for (const [key, group] of roamGroups) {
    const triggered = withinWindow(
      group.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)),
    );
    if (triggered)
      findings.push({
        id: `roam-storm:${key}:${triggered[0].id}`,
        kind: "roam-storm",
        title: "Roam storm",
        detail: `${triggered.length} roams were recorded within 10 minutes.`,
        ts: triggered[0].ts,
        evidence: triggered.map((event) => event.evidence),
      });
  }
  const auth = dated.filter(
    (event) =>
      event.kind === "join" &&
      event.evidence.fields.status !== "successful" &&
      /auth|authentication|eap|802\.1x|credential|password/i.test(
        [
          event.evidence.fields.status,
          event.evidence.fields.reason,
          event.evidence.fields.subReason,
        ].join(" "),
      ),
  );
  const authGroups = new Map<string, WifiEvent[]>();
  for (const event of auth) {
    const key = groupKey(event);
    authGroups.set(key, [...(authGroups.get(key) ?? []), event]);
  }
  for (const [key, group] of authGroups) {
    const triggered = withinWindow(
      group.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)),
    );
    if (triggered)
      findings.push({
        id: `auth:${key}:${triggered[0].id}`,
        kind: "authentication-failures",
        title: "Authentication failure burst",
        detail: `${triggered.length} explicitly authentication-related join failures were recorded within 10 minutes.`,
        ts: triggered[0].ts,
        evidence: triggered.map((event) => event.evidence),
      });
  }
  for (const event of events.filter((item) => item.kind === "join")) {
    const dhcp = event.evidence.fields.dhcpSuccess?.toLowerCase();
    if (["0", "false", "no", "failed"].includes(dhcp))
      findings.push({
        id: `dhcp:${event.id}`,
        kind: "dhcp-failure",
        title: "DHCP failure",
        detail:
          "The join record explicitly reports an unsuccessful DHCP result.",
        ts: event.ts,
        evidence: [event.evidence],
      });
    const rssi = Number(event.evidence.fields.rssi);
    if (
      event.evidence.fields.status === "successful" &&
      Number.isFinite(rssi) &&
      rssi <= -75
    )
      findings.push({
        id: `weak-signal:${event.id}`,
        kind: "weak-signal",
        title: "Weak-signal join",
        detail: `A successful join reported RSSI ${rssi} dBm (threshold: −75 dBm).`,
        ts: event.ts,
        evidence: [event.evidence],
      });
  }
  const ipv4 = snapshot?.fields["IPv4 Address"];
  if (ipv4 && /\b169\.254\.\d{1,3}\.\d{1,3}\b/.test(ipv4))
    findings.push({
      id: "self-assigned-address",
      kind: "self-assigned-address",
      title: "Self-assigned IPv4 address",
      detail:
        "The capture snapshot shows a 169.254/16 address, which can indicate DHCP did not complete.",
      ts: null,
      evidence: [
        { source: snapshot.source, row: 0, fields: { "IPv4 Address": ipv4 } },
      ],
    });
  return findings.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
}

export async function analyzeWifiEntries(
  entries: ArchiveEntry[],
): Promise<WifiAnalysis> {
  const wifiEntries = entries.filter((entry) =>
    /(?:^|\/)WiFi\//i.test(entry.path),
  );
  const fallbackMs = Math.max(0, ...entries.map((entry) => entry.mtime * 1000));
  const captureMs = inferSysdiagnoseCaptureTime(entries, fallbackMs);
  const offset = captureOffset(entries);
  const snapshot = parseLabeledText(
    wifiEntries.find((entry) => /\/wifi_status\.txt$/i.test(entry.path)),
  );
  const connectivity = parseConnectivity(
    wifiEntries.find((entry) =>
      /\/diagnostics-connectivity\.txt$/i.test(entry.path),
    ),
  );
  const warnings: string[] = [];
  if (wifiEntries.length === 0)
    return {
      available: false,
      captureMs,
      snapshot: null,
      connectivity: [],
      events: [],
      networks: [],
      findings: [],
      eventRange: null,
      bssRange: null,
      warnings: ["No WiFi directory was found in this archive."],
    };

  const parsed = new Map<string, { entry: ArchiveEntry; rows: CsvRow[] }>();
  for (const name of [
    ...EVENT_EXPORTS.map(([name]) => name),
    "BSS",
    "Network",
  ]) {
    const entry = exportEntry(entries, name);
    if (!entry) continue;
    try {
      parsed.set(name, { entry, rows: await expandAnalyticsExport(entry) });
    } catch (error) {
      warnings.push(
        `${name} export was skipped: ${error instanceof Error ? error.message : "could not be decoded"}.`,
      );
    }
  }
  if (!snapshot)
    warnings.push(
      "wifi_status.txt was not available for a capture-time connection snapshot.",
    );
  if (!offset)
    warnings.push(
      "The archive capture timezone was unavailable; timezone-free event timestamps were omitted.",
    );

  const events: WifiEvent[] = [];
  for (const [name, kind] of EVENT_EXPORTS) {
    const current = parsed.get(name);
    if (!current) continue;
    for (const row of current.rows) {
      const ts = parseWifiDate(row.fields.date, captureMs, offset);
      if (row.fields.date && ts === null)
        warnings.push(
          `${name} row ${row.row} has an unvalidated timestamp and is not placed on the timeline.`,
        );
      events.push({
        id: `${name}:${row.row}`,
        kind,
        ts,
        networkRef: ref(row.fields.network),
        bssRef: ref(row.fields.bss),
        evidence: {
          source: current.entry.path,
          row: row.row,
          fields: row.fields,
        },
      });
    }
  }
  events.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));

  const networks = new Map<string, WifiNetwork>();
  const ensureNetwork = (id: string) => {
    const existing = networks.get(id);
    if (existing) return existing;
    const created: WifiNetwork = {
      id,
      ssid: null,
      bssids: [],
      eventCount: 0,
      lastSeenMs: null,
      bands: [],
      channels: [],
      evidence: [],
    };
    networks.set(id, created);
    return created;
  };
  const networkRows = parsed.get("Network");
  for (const row of networkRows?.rows ?? []) {
    const id = ref(row.fields.opaque);
    if (!id) continue;
    const network = ensureNetwork(id);
    network.ssid = known(row.fields.ssid);
    network.evidence.push({
      source: networkRows?.entry.path ?? "Network.csv",
      row: row.row,
      fields: row.fields,
    });
  }
  const bssRows = parsed.get("BSS");
  const bssNetwork = new Map<string, string>();
  const bssLastSeen: number[] = [];
  for (const row of bssRows?.rows ?? []) {
    const networkId = ref(row.fields.network);
    const bssId = ref(row.fields.opaque);
    if (bssId && networkId) bssNetwork.set(bssId, networkId);
    if (!networkId) continue;
    const network = ensureNetwork(networkId);
    const bssid = known(row.fields.bssid);
    if (bssid && !network.bssids.includes(bssid)) network.bssids.push(bssid);
    const seen = parseWifiDate(row.fields.lastSeen, captureMs, offset);
    if (seen !== null) {
      bssLastSeen.push(seen);
      network.lastSeenMs = Math.max(network.lastSeenMs ?? 0, seen);
    }
    for (const field of ["mostRecentBand", "mostRecentChannel"] as const) {
      const value = known(row.fields[field]);
      const target =
        field === "mostRecentBand" ? network.bands : network.channels;
      if (value && !target.includes(value)) target.push(value);
    }
    network.evidence.push({
      source: bssRows?.entry.path ?? "BSS.csv",
      row: row.row,
      fields: row.fields,
    });
  }
  for (const event of events) {
    const id =
      event.networkRef ??
      (event.bssRef ? bssNetwork.get(event.bssRef) : null) ??
      "unresolved";
    const network = ensureNetwork(id);
    network.eventCount += 1;
    if (event.ts !== null)
      network.lastSeenMs = Math.max(network.lastSeenMs ?? 0, event.ts);
    for (const [field, target] of [
      ["band", network.bands],
      ["channel", network.channels],
    ] as const) {
      const value = known(event.evidence.fields[field]);
      if (value && !target.includes(value)) target.push(value);
    }
    network.evidence.push(event.evidence);
  }
  return {
    available: true,
    captureMs,
    snapshot,
    connectivity,
    events,
    networks: [...networks.values()].sort(
      (a, b) => (b.lastSeenMs ?? 0) - (a.lastSeenMs ?? 0),
    ),
    findings: diagnose(events, snapshot),
    eventRange: range(
      events.flatMap((event) => (event.ts === null ? [] : [event.ts])),
    ),
    bssRange: range(bssLastSeen),
    warnings: [...new Set(warnings)],
  };
}
