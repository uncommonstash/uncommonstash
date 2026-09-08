import * as HoverCard from "@radix-ui/react-hover-card";
import { useEffect, useMemo, useRef, useState } from "react";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { csr } from "@/lib/compat";
import {
  type ArchiveEntry,
  aggregateBattery,
  type BatteryPlistData,
  extractBatteryFromPlist,
  type IngestProgress,
  ingestFile,
  parseBatteryText,
  parseLogText,
  parsePlist,
  redact,
} from "./lib";

function formatMB(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  return `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;
}

function stageLabel(p: IngestProgress): string {
  switch (p.stage) {
    case "reading":
      return p.bytesTotal > 0
        ? `Reading ${formatMB(p.bytesRead)} of ${formatMB(p.bytesTotal)}`
        : `Reading ${formatMB(p.bytesRead)}`;
    case "decompressing":
      return `Decompressing ${formatMB(p.bytesRead)} streamed`;
    case "indexing":
      return "Indexing archive";
    case "storing":
      return p.filesFound > 0
        ? `Indexing ${p.filesFound.toLocaleString()} files`
        : "Indexing archive";
    case "done":
      return `${p.filesFound.toLocaleString()} files ready`;
  }
}

function BatteryChart({
  points,
  charging,
}: {
  points: { ts: number; level: number }[];
  charging?: Array<{ start: number; end: number }>;
}) {
  const W = 640;
  const H = 180;
  const P = 24;
  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const ts = points.map((p) => p.ts);
    const min = Math.min(...ts);
    const max = Math.max(...ts);
    const X = (t: number) =>
      P + ((t - min) / Math.max(1, max - min)) * (W - 2 * P);
    const Y = (l: number) => H - P - (l / 100) * (H - 2 * P);
    return {
      d: points
        .map(
          (p, i) =>
            `${i ? "L" : "M"}${X(p.ts).toFixed(1)},${Y(p.level).toFixed(1)}`,
        )
        .join(" "),
      band: (charging ?? []).map((c) => ({
        x1: X(Math.max(c.start, min)),
        x2: X(Math.min(c.end, max)),
      })),
    };
  }, [points, charging]);
  if (points.length < 2 || !geom)
    return (
      <p className="text-sm text-muted-foreground">
        Not enough battery samples.
      </p>
    );
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded border bg-background"
      role="img"
      aria-label="Battery level over time"
    >
      {[0, 25, 50, 75, 100].map((l) => (
        <line
          key={l}
          x1={P}
          x2={W - P}
          y1={H - P - (l / 100) * (H - 2 * P)}
          y2={H - P - (l / 100) * (H - 2 * P)}
          stroke="currentColor"
          strokeOpacity={0.1}
        />
      ))}
      <path d={geom.d} fill="none" stroke="currentColor" strokeWidth={2} />
      {geom.band.map(
        (b, i) =>
          b.x2 > b.x1 && (
            <rect
              key={i}
              x={b.x1}
              y={P / 2}
              width={b.x2 - b.x1}
              height={H - P}
              fill="currentColor"
              opacity={0.08}
            />
          ),
      )}
    </svg>
  );
}

// App artwork via Apple's official iTunes Search API
// (lookup?bundleId=.., exact match incl. Apple first-party apps, CORS-open).
// Only bundle-ID strings are queried — never file contents — results cached
// in localStorage; monogram fallback when offline, opted-out, or unlisted
// (daemons like backboardd have no store entry).
const ICON_CACHE_KEY = "sysdiagnose-app-icons-v1";

function readIconCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ICON_CACHE_KEY) ?? "{}") as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

function useAppIcons(bundleIds: string[], enabled: boolean) {
  const [icons, setIcons] = useState<Record<string, string>>(() =>
    readIconCache(),
  );
  const key = useMemo(
    () => [...new Set(bundleIds.filter(Boolean))].sort().join(","),
    [bundleIds],
  );
  useEffect(() => {
    if (!enabled || !key) return;
    const ids = key.split(",");
    const cached = readIconCache();
    const missing = ids.filter((id) => !cached[id]);
    if (missing.length === 0) {
      setIcons(cached);
      return;
    }
    let cancelled = false;
    // One batched request for all uncached bundle IDs.
    fetch(
      `https://itunes.apple.com/lookup?bundleId=${missing.map(encodeURIComponent).join(",")}&entity=software&limit=${missing.length}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.results) return;
        const next = { ...readIconCache() };
        for (const r of d.results as Array<{
          bundleId?: string;
          artworkUrl60?: string;
        }>) {
          if (r.bundleId && r.artworkUrl60) next[r.bundleId] = r.artworkUrl60;
        }
        // Negative cache: don't re-query unlisted IDs every load.
        for (const id of missing) next[id] = next[id] ?? "";
        try {
          localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(next));
        } catch {
          // Storage unavailable (private mode) — keep in-memory only.
        }
        setIcons(next);
      })
      .catch(() => {
        // Offline / blocked — monograms stay.
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);
  return icons;
}

function Monogram({ name, bundleId }: { name: string; bundleId: string }) {
  const initials = name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  let h = 0;
  for (const c of bundleId || name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white"
      style={{ backgroundColor: `hsl(${h} 45% 45%)` }}
    >
      {initials || "?"}
    </span>
  );
}

function AppIcon({
  name,
  bundleId,
  artUrl,
}: {
  name: string;
  bundleId: string;
  artUrl?: string;
}) {
  if (artUrl) {
    return (
      <img
        src={artUrl}
        alt=""
        loading="lazy"
        width={28}
        height={28}
        className="h-7 w-7 shrink-0 rounded-md border"
      />
    );
  }
  return <Monogram name={name} bundleId={bundleId} />;
}

export default csr(function SysdiagnosePage() {
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [fileName, setFileName] = useState("");
  const [tab, setTab] = useState("battery");
  const [query, setQuery] = useState("");
  const [regex, setRegex] = useState(false);
  const [level, setLevel] = useState("all");
  const [processFilter, setProcessFilter] = useState("");
  const [redactOn, setRedactOn] = useState(true);
  const [sql, setSql] = useState(
    "SELECT process, COUNT(*) samples FROM battery GROUP BY process",
  );
  const fileRef = useRef<HTMLInputElement>(null);

  async function load(f: File | Blob) {
    setBusy(true);
    setProgress(null);
    setFileName((f as File).name ?? "archive");
    try {
      setEntries(await ingestFile(f, setProgress));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function loadSample() {
    const lines = [
      "2024-05-01T10:00:00Z,92,com.apple.springboard,12",
      "2024-05-01T10:10:00Z,88,com.instagram.app,34",
      "2024-05-01T10:20:00Z,81,com.instagram.app,41",
      "2024-05-01T10:30:00Z,79,backboardd,8",
      "2024-05-01T10:00:01Z [Default] SpringBoard[12]: lock screen dim",
      "2024-05-01T10:11:02Z [Error] Instagram[44]: background wakeup fetch",
      "2024-05-01T10:21:10Z [Fault] powerd[1]: thermal pressure nominal",
      "2024-05-01T10:22:33Z [Error] backboardd[2]: jetsam kill com.instagram.app",
    ].join("\n");
    const enc = new TextEncoder();
    setEntries([
      {
        path: "powerlogs/battery.csv",
        size: lines.length,
        mtime: 0,
        kind: "text",
        data: enc.encode(lines),
      },
      {
        path: "system_logs.log",
        size: lines.length,
        mtime: 0,
        kind: "text",
        data: enc.encode(lines),
      },
    ]);
  }

  const textEntries = entries.filter((e) => e.kind === "text");
  // Primary source: BatteryUISysdiagnose.plist (24h level curve + per-app
  // energy). Fallback: strict CSV parsing for sample/synthetic data.
  const plistBattery: BatteryPlistData | null = useMemo(() => {
    const cand = entries.find((e) =>
      /batteryuisysdiagnose\.plist$/i.test(e.path),
    );
    if (!cand) return null;
    try {
      return extractBatteryFromPlist(parsePlist(cand.data));
    } catch {
      return null;
    }
  }, [entries]);
  const appIcons = useAppIcons(
    plistBattery ? plistBattery.apps.map((a) => a.bundleId) : [],
    true,
  );
  const batteryPoints = useMemo(() => {
    if (plistBattery) return plistBattery.points;
    const pts = [];
    for (const e of entries) {
      if (!/\.csv$/i.test(e.path) || e.size > 2_000_000) continue;
      if (!/batter|power/i.test(e.path)) continue;
      pts.push(...parseBatteryText(new TextDecoder().decode(e.data)));
    }
    return pts;
  }, [entries, plistBattery]);
  const agg = useMemo(() => aggregateBattery(batteryPoints), [batteryPoints]);

  const logLines = useMemo(() => {
    const all = [];
    for (const e of textEntries.slice(0, 20)) {
      all.push(
        ...parseLogText(
          e.path,
          new TextDecoder().decode(e.data.slice(0, 2_000_000)),
        ),
      );
    }
    let out = all.slice(0, 5000);
    if (processFilter)
      out = out.filter((l) =>
        l.process.toLowerCase().includes(processFilter.toLowerCase()),
      );
    if (level !== "all") out = out.filter((l) => l.level === level);
    if (query) {
      try {
        if (regex) {
          const re = new RegExp(query, "i");
          out = out.filter((l) => re.test(l.message));
        } else {
          const q = query.toLowerCase();
          out = out.filter((l) => l.message.toLowerCase().includes(q));
        }
      } catch {
        /* invalid regex: show unfiltered */
      }
    }
    return out;
  }, [textEntries, query, regex, level, processFilter]);

  const processes = useMemo(
    () => [...new Set(logLines.map((l) => l.process))].slice(0, 50),
    [logLines],
  );

  if (entries.length === 0) {
    return (
      <div className="min-h-screen bg-secondary/30 p-4 [&_*]:shadow-none">
        <div className="max-w-6xl mx-auto">
          <BackLink />
          <Card className="max-w-2xl w-full mx-auto mt-6">
            <CardHeader>
              <p className="text-sm">
                Sysdiagnose — private, in-browser iPhone analysis; files never
                leave your device.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {busy ? (
                <div
                  className="w-full rounded-xl border p-10 text-center"
                  role="status"
                  aria-live="polite"
                >
                  <Spinner
                    size="md"
                    className="mx-auto"
                    value={progress ? progress.fraction : undefined}
                  >
                    <span className="sr-only">Loading sysdiagnose</span>
                  </Spinner>
                  <div className="mt-4 text-lg font-semibold truncate">
                    {fileName || "sysdiagnose archive"}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {progress ? stageLabel(progress) : "Starting"}
                  </div>
                  <div
                    className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round((progress?.fraction ?? 0) * 100)}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{
                        width: `${Math.round((progress?.fraction ?? 0) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Processing locally — nothing is uploaded
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed p-10 text-center hover:bg-background transition"
                >
                  <div className="text-lg font-semibold">
                    Drop sysdiagnose_*.tar.gz here
                  </div>
                  <div className="text-sm text-muted-foreground">
                    or click to browse — up to ~1GB, streamed + spilled to OPFS
                  </div>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".tar.gz,.tgz,.tar,.gz"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void load(f);
                }}
              />
              <ol className="text-sm space-y-1 list-decimal pl-5 text-muted-foreground">
                <li>
                  iPhone: press Vol Up + Vol Down + hold Side 1s, wait ~10 min.
                </li>
                <li>
                  Settings → Privacy & Security → Analytics → Analytics Data →
                  sysdiagnose_[date].
                </li>
                <li>Share via AirDrop, then drop the .tar.gz above.</li>
              </ol>
              <Button variant="secondary" onClick={() => void loadSample()}>
                Try with sample data
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30 p-4 [&_*]:shadow-none">
      <div className="max-w-6xl mx-auto">
        <BackLink />
        <div className="flex gap-4 mt-2">
          <aside className="w-44 shrink-0 space-y-1" aria-label="Sections">
            {(["battery", "logs", "wifi", "files"] as const).map((t) => (
              <button
                key={t}
                type="button"
                disabled={t === "wifi"}
                onClick={() => setTab(t === "wifi" ? tab : t)}
                className={`w-full text-left px-3 py-2 rounded capitalize ${tab === t ? "bg-background border font-medium" : "text-muted-foreground"} ${t === "wifi" ? "opacity-40" : ""}`}
              >
                {t}
                {t === "wifi" ? " (soon)" : ""}
              </button>
            ))}
            <div className="px-2 pt-4 text-xs text-muted-foreground">
              {entries.length} files · {textEntries.length} text
            </div>
          </aside>
          <main className="flex-1 min-w-0 w-full">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-semibold">Sysdiagnose</h1>
              <Button size="sm" onClick={() => setEntries([])}>
                Load another
              </Button>
            </div>
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsContent value="battery" className="w-full">
                <div className="grid sm:grid-cols-4 gap-3 mb-3">
                  {[
                    [
                      plistBattery ? "Samples (15-min)" : "Samples",
                      String(batteryPoints.length),
                    ],
                    [
                      "Δ level",
                      batteryPoints.length > 1
                        ? `${(batteryPoints[0].level - batteryPoints[batteryPoints.length - 1].level).toFixed(0)}%`
                        : "—",
                    ],
                    [
                      plistBattery ? "Apps" : "Processes",
                      String(
                        plistBattery ? plistBattery.apps.length : agg.length,
                      ),
                    ],
                    [
                      "Top drain",
                      plistBattery
                        ? (plistBattery.apps[0]?.name ?? "—")
                        : (agg[0]?.process ?? "—"),
                    ],
                  ].map(([k, v]) => (
                    <Card key={k}>
                      <CardContent className="pt-4">
                        <div className="text-xl font-bold truncate" title={v}>
                          {v}
                        </div>
                        <div className="text-xs text-muted-foreground">{k}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card className="mb-3">
                  <CardHeader>
                    <CardTitle className="text-base">
                      Battery level over time
                      {plistBattery ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          24h · 15-min samples · shaded = charging
                        </span>
                      ) : null}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BatteryChart
                      points={batteryPoints}
                      charging={plistBattery?.charging}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {plistBattery
                        ? "Per-app energy (24h)"
                        : "Per-process energy"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {plistBattery ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th>App</th>
                            <th>Energy</th>
                            <th>Foreground</th>
                            <th>Background</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {plistBattery.apps.slice(0, 30).map((a) => (
                            <tr key={a.bundleId || a.name} className="border-t">
                              <td className="py-1">
                                <div className="flex items-center gap-2">
                                  <AppIcon
                                    name={a.name}
                                    bundleId={a.bundleId}
                                    artUrl={appIcons[a.bundleId] || undefined}
                                  />
                                  <HoverCard.Root
                                    openDelay={200}
                                    closeDelay={100}
                                  >
                                    <HoverCard.Trigger asChild>
                                      <span className="cursor-default text-xs font-medium underline decoration-dotted decoration-muted-foreground/50 underline-offset-4">
                                        {a.name}
                                      </span>
                                    </HoverCard.Trigger>
                                    <HoverCard.Portal>
                                      <HoverCard.Content
                                        side="top"
                                        sideOffset={6}
                                        className="rounded-md border bg-popover px-2.5 py-1.5 font-mono text-[11px] text-popover-foreground"
                                      >
                                        {a.bundleId || a.name}
                                        <HoverCard.Arrow className="fill-border" />
                                      </HoverCard.Content>
                                    </HoverCard.Portal>
                                  </HoverCard.Root>
                                </div>
                              </td>
                              <td>{a.energy.toFixed(0)}</td>
                              <td>{(a.foregroundSec / 60).toFixed(0)}m</td>
                              <td>{(a.backgroundSec / 60).toFixed(0)}m</td>
                              <td>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setProcessFilter(
                                      a.bundleId.split(".").pop() ?? a.name,
                                    );
                                    setTab("logs");
                                  }}
                                >
                                  → logs
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th>Process</th>
                            <th>Samples</th>
                            <th>Energy</th>
                            <th>Avg lvl</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {agg.map((a) => (
                            <tr key={a.process} className="border-t">
                              <td className="py-1 font-mono text-xs">
                                {a.process}
                              </td>
                              <td>{a.samples}</td>
                              <td>{a.energy.toFixed(0)}</td>
                              <td>{a.avgLevel.toFixed(0)}</td>
                              <td>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setProcessFilter(
                                      a.process.split(".").pop() ?? a.process,
                                    );
                                    setTab("logs");
                                  }}
                                >
                                  → logs
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Engineer: raw SQL (sqlite-wasm, single-thread,
                        in-memory)
                      </summary>
                      <Input
                        className="mt-2 font-mono"
                        value={sql}
                        onChange={(v) => setSql(v)}
                      />
                      <p className="mt-1 text-muted-foreground">
                        Runs read-only against powerlog copy when available;
                        CSV/text fallback otherwise.{" "}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const csv = `process,samples,energy,avgLevel\n${agg.map((a) => [a.process, a.samples, a.energy, a.avgLevel.toFixed(1)].join(",")).join("\n")}`;
                            const url = URL.createObjectURL(
                              new Blob([csv], { type: "text/csv" }),
                            );
                            const el = document.createElement("a");
                            el.href = url;
                            el.download = "battery.csv";
                            el.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Export CSV
                        </Button>
                      </p>
                    </details>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="logs" className="w-full">
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Input
                        placeholder="Search messages…"
                        value={query}
                        onChange={(v) => setQuery(v)}
                        className="max-w-xs"
                      />
                      <Input
                        placeholder="Process filter…"
                        value={processFilter}
                        onChange={(v) => setProcessFilter(v)}
                        className="max-w-40"
                      />
                      <select
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                        className="rounded border bg-background px-2 text-sm"
                        aria-label="Log level"
                      >
                        {["all", "default", "info", "error", "fault"].map(
                          (l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ),
                        )}
                      </select>
                      <label className="flex items-center gap-1 text-xs">
                        regex{" "}
                        <Switch checked={regex} onCheckedChange={setRegex} />
                      </label>
                      <label className="flex items-center gap-1 text-xs">
                        redact PII{" "}
                        <Switch
                          checked={redactOn}
                          onCheckedChange={setRedactOn}
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {[
                        ["hangs", "hang|stuck|watchdog"],
                        ["jetsam", "jetsam|memory|kill"],
                        ["thermal", "thermal|heat|throttle"],
                        ["wakeups", "wakeup|background"],
                      ].map(([k, v]) => (
                        <Button
                          key={k}
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setQuery(v);
                            setRegex(true);
                          }}
                        >
                          {k}
                        </Button>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {logLines.length} lines · processes:{" "}
                      {processes.slice(0, 5).join(", ")}
                    </div>
                    <div className="max-h-[50vh] overflow-auto rounded border divide-y text-xs font-mono">
                      {/* biome-ignore lint/suspicious/noArrayIndexKey: log rows have no stable id */}
                      {logLines.slice(0, 500).map((l, i) => (
                        <details key={i} className="px-2 py-1">
                          <summary className="cursor-pointer truncate">
                            <span
                              className={`inline-block w-2 h-2 rounded-full mr-2 ${l.level === "error" ? "bg-red-500" : l.level === "fault" ? "bg-orange-500" : "bg-green-500"}`}
                            />
                            {l.process} —{" "}
                            {redact(l.message.slice(0, 140), redactOn)}
                          </summary>
                          <pre className="whitespace-pre-wrap p-2 text-muted-foreground">
                            {redact(l.message, redactOn)}&#10;[{l.source}]
                          </pre>
                        </details>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Note: .logarchive binary decoding is partial — showing
                      extractable strings; use Mac Console for full decode.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="files" className="w-full">
                <Card>
                  <CardContent className="pt-4 text-xs font-mono max-h-[60vh] overflow-auto">
                    {entries.slice(0, 500).map((e) => (
                      <div key={e.path} className="py-0.5 border-b">
                        {e.path}{" "}
                        <span className="text-muted-foreground">
                          ({e.kind}, {(e.size / 1024).toFixed(1)}KB)
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </div>
  );
});
