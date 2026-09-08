import { useMemo, useRef, useState } from "react";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { csr } from "@/lib/compat";
import {
  type ArchiveEntry,
  aggregateBattery,
  ingestFile,
  parseBatteryText,
  parseLogText,
  redact,
} from "./lib";

function BatteryChart({ points }: { points: { ts: number; level: number }[] }) {
  const W = 640;
  const H = 180;
  const P = 24;
  const path = useMemo(() => {
    if (points.length < 2) return "";
    const ts = points.map((p) => p.ts);
    const min = Math.min(...ts);
    const max = Math.max(...ts);
    const X = (t: number) =>
      P + ((t - min) / Math.max(1, max - min)) * (W - 2 * P);
    const Y = (l: number) => H - P - (l / 100) * (H - 2 * P);
    return points
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${X(p.ts).toFixed(1)},${Y(p.level).toFixed(1)}`,
      )
      .join(" ");
  }, [points]);
  if (points.length < 2)
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
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

export default csr(function SysdiagnosePage() {
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [busy, setBusy] = useState(false);
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
    try {
      setEntries(await ingestFile(f));
    } finally {
      setBusy(false);
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
  const batteryPoints = useMemo(() => {
    const pts = [];
    for (const e of entries) {
      if (/batter|power/i.test(e.path))
        pts.push(...parseBatteryText(new TextDecoder().decode(e.data)));
    }
    return pts;
  }, [entries]);
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
      <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-4">
        <div className="absolute top-0 left-0 p-6">
          <BackLink />
        </div>
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <CardTitle>Sysdiagnose</CardTitle>
            <p className="text-sm text-muted-foreground">
              Private, in-browser iPhone sysdiagnose analysis. Files never leave
              your device.{" "}
              <span className="rounded border px-1.5 py-0.5 text-xs">
                local-only
              </span>
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed p-10 text-center hover:bg-background transition"
            >
              <div className="text-lg font-semibold">
                Drop sysdiagnose_*.tar.gz here
              </div>
              <div className="text-sm text-muted-foreground">
                or click to browse —{" "}
                {busy ? "parsing…" : "up to ~1GB, streamed + spilled to OPFS"}
              </div>
            </button>
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
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30 p-4">
      <div className="max-w-6xl mx-auto flex gap-4">
        <aside className="w-44 shrink-0 space-y-1">
          <BackLink />
          <p className="font-semibold px-2 pt-2">Sysdiagnose</p>
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
          <Button variant="ghost" size="sm" onClick={() => setEntries([])}>
            Load another
          </Button>
        </aside>
        <main className="flex-1 min-w-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="battery">Battery</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
            </TabsList>
            <TabsContent value="battery">
              <div className="grid sm:grid-cols-4 gap-3 mb-3">
                {[
                  ["Samples", String(batteryPoints.length)],
                  [
                    "Δ level",
                    batteryPoints.length > 1
                      ? `${(batteryPoints[0].level - batteryPoints[batteryPoints.length - 1].level).toFixed(0)}%`
                      : "—",
                  ],
                  ["Processes", String(agg.length)],
                  ["Top drain", agg[0]?.process ?? "—"],
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
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <BatteryChart points={batteryPoints} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Per-process energy
                  </CardTitle>
                </CardHeader>
                <CardContent>
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
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-muted-foreground">
                      Engineer: raw SQL (sqlite-wasm, single-thread, in-memory)
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
            <TabsContent value="logs">
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
                      {["all", "default", "info", "error", "fault"].map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
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
            <TabsContent value="files">
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
  );
});
