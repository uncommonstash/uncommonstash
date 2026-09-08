import * as HoverCard from "@radix-ui/react-hover-card";
import {
  BatteryMedium,
  ChevronDown,
  ChevronRight,
  Database,
  File,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  type LucideIcon,
  Radio,
  Search,
  Settings,
  SignalLow,
  SlidersHorizontal,
  Trash2,
  Upload,
  Wifi,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { csr } from "@/lib/compat";
import { AnalyticsClient } from "@/workers/sysdiagnose-analytics/analytics.client";
import type { AnalyticsAppRow } from "@/workers/sysdiagnose-analytics/analytics.protocol";
import { IngestClient } from "@/workers/sysdiagnose-ingest/ingest.client";
import {
  type ArchiveEntry,
  aggregateBattery,
  type BatteryPlistData,
  extractBatteryFromPlist,
  type IngestProgress,
  parseBatteryText,
  parseLogText,
  parsePlist,
  redact,
} from "./lib";

function formatMB(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  return `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;
}

function formatChartDate(timestamp: number | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
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

const BATTERY_CHART_WIDTH = 760;
const BATTERY_CHART_HEIGHT = 260;
const BATTERY_CHART_PADDING = { top: 18, right: 18, bottom: 38, left: 48 };
const BATTERY_CHART_TICKS = [0, 0.25, 0.5, 0.75, 1];

interface TimeRange {
  start: number;
  end: number;
}

function formatRange(range: TimeRange): string {
  const date = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(range.start));
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time.format(new Date(range.start))}–${time.format(new Date(range.end))}`;
}

function BatteryChart({
  points,
  charging,
  selectedRange,
  onRangeChange,
}: {
  points: { ts: number; level: number }[];
  charging?: Array<{ start: number; end: number }>;
  selectedRange?: TimeRange;
  onRangeChange?: (range: TimeRange) => void;
}) {
  const W = BATTERY_CHART_WIDTH;
  const H = BATTERY_CHART_HEIGHT;
  const P = BATTERY_CHART_PADDING;
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const ts = points.map((p) => p.ts);
    const min = Math.min(...ts);
    const max = Math.max(...ts);
    const X = (t: number) =>
      P.left + ((t - min) / Math.max(1, max - min)) * (W - P.left - P.right);
    const Y = (l: number) => H - P.bottom - (l / 100) * (H - P.top - P.bottom);
    const path = points
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${X(p.ts).toFixed(1)},${Y(p.level).toFixed(1)}`,
      )
      .join(" ");
    return {
      d: path,
      area: `${path} L ${X(points.at(-1)?.ts ?? max).toFixed(1)},${Y(0).toFixed(1)} L ${X(points[0].ts).toFixed(1)},${Y(0).toFixed(1)} Z`,
      band: (charging ?? []).map((c) => ({
        x1: X(Math.max(c.start, min)),
        x2: X(Math.min(c.end, max)),
      })),
      min,
      max,
      X,
      Y,
    };
  }, [points, charging]);
  if (points.length < 2 || !geom)
    return (
      <p className="text-sm text-muted-foreground">
        Not enough battery samples.
      </p>
    );
  const draftRange =
    dragStart !== null && dragEnd !== null
      ? {
          start: Math.min(dragStart, dragEnd),
          end: Math.max(dragStart, dragEnd),
        }
      : selectedRange;
  const toTime = (event: React.PointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return geom.min;
    const rect = svg.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * W;
    const fraction = Math.min(
      1,
      Math.max(0, (svgX - P.left) / Math.max(1, W - P.left - P.right)),
    );
    return geom.min + fraction * (geom.max - geom.min);
  };
  const finishSelection = (event: React.PointerEvent<SVGRectElement>) => {
    if (dragStart === null) return;
    const end = toTime(event);
    const minDistance = (geom.max - geom.min) * 0.02;
    setDragStart(null);
    setDragEnd(null);
    if (Math.abs(end - dragStart) < minDistance) {
      onRangeChange?.({ start: geom.min, end: geom.max });
      return;
    }
    onRangeChange?.({
      start: Math.min(dragStart, end),
      end: Math.max(dragStart, end),
    });
  };
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto min-h-56 w-full"
      role="img"
      aria-label="Battery level over time"
    >
      {geom.band.map(
        (b) =>
          b.x2 > b.x1 && (
            <rect
              key={`${b.x1}-${b.x2}`}
              x={b.x1}
              y={P.top}
              width={b.x2 - b.x1}
              height={H - P.top - P.bottom}
              fill="#34c759"
              opacity={0.12}
            />
          ),
      )}
      {draftRange ? (
        <rect
          x={geom.X(draftRange.start)}
          y={P.top}
          width={Math.max(1, geom.X(draftRange.end) - geom.X(draftRange.start))}
          height={H - P.top - P.bottom}
          fill="#0071e3"
          opacity={0.08}
          pointerEvents="none"
        />
      ) : null}
      {BATTERY_CHART_TICKS.map((tick) => {
        const level = 100 - tick * 100;
        const y = geom.Y(level);
        return (
          <g key={`y-${level}`}>
            <line
              x1={P.left}
              x2={W - P.right}
              y1={y}
              y2={y}
              stroke="#d2d2d7"
              strokeWidth={1}
            />
            <text
              x={P.left - 10}
              y={y + 4}
              textAnchor="end"
              fill="#6e6e73"
              fontSize="11"
            >
              {level}%
            </text>
          </g>
        );
      })}
      {BATTERY_CHART_TICKS.map((tick) => {
        const time = new Date(geom.min + (geom.max - geom.min) * tick);
        const x = P.left + tick * (W - P.left - P.right);
        return (
          <text
            key={`x-${time.toISOString()}`}
            x={x}
            y={H - 12}
            textAnchor={tick === 0 ? "start" : tick === 1 ? "end" : "middle"}
            fill="#6e6e73"
            fontSize="11"
          >
            {time.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </text>
        );
      })}
      <path d={geom.area} fill="#0071e3" opacity={0.08} />
      <path d={geom.d} fill="none" stroke="#0071e3" strokeWidth={2.5} />
      <rect
        x={P.left}
        y={P.top}
        width={W - P.left - P.right}
        height={H - P.top - P.bottom}
        fill="transparent"
        cursor="crosshair"
        onPointerDown={(event) => {
          if (!onRangeChange) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const time = toTime(event);
          setDragStart(time);
          setDragEnd(time);
        }}
        onPointerMove={(event) => {
          if (dragStart !== null) setDragEnd(toTime(event));
        }}
        onPointerUp={finishSelection}
        onPointerCancel={() => {
          setDragStart(null);
          setDragEnd(null);
        }}
      />
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
  const PresetIcon = PRESET_APP_ICONS[name.toLowerCase()];
  if (PresetIcon) {
    return (
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
        <PresetIcon className="h-4 w-4" strokeWidth={1.75} />
      </span>
    );
  }
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

const PRESET_APP_ICONS: Record<string, LucideIcon> = {
  hls: Radio,
  poorcellcondition: SignalLow,
  settings: Settings,
  deletedapp: Trash2,
};

interface FileTreeNode {
  name: string;
  path: string;
  type: "directory" | "file";
  children: FileTreeNode[];
  entry?: ArchiveEntry;
}

function buildFileTree(entries: ArchiveEntry[]): FileTreeNode[] {
  const root: FileTreeNode = {
    name: "",
    path: "",
    type: "directory",
    children: [],
  };

  for (const entry of entries) {
    let parent = root;
    const parts = entry.path.split("/").filter(Boolean);
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      let node = parent.children.find((child) => child.path === path);
      if (!node) {
        node = {
          name: part,
          path,
          type: index === parts.length - 1 ? "file" : "directory",
          children: [],
          entry: index === parts.length - 1 ? entry : undefined,
        };
        parent.children.push(node);
      }
      parent = node;
    });
  }

  const sort = (nodes: FileTreeNode[]) => {
    nodes.sort(
      (a, b) =>
        Number(b.type === "directory") - Number(a.type === "directory") ||
        a.name.localeCompare(b.name),
    );
    for (const node of nodes) sort(node.children);
  };
  sort(root.children);
  return root.children;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function FileTree({ entries }: { entries: ArchiveEntry[] }) {
  const tree = useMemo(() => buildFileTree(entries), [entries]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const renderNode = (node: FileTreeNode, depth: number): ReactNode => {
    const isOpen = expanded.has(node.path);
    const Icon =
      node.type === "directory"
        ? isOpen
          ? FolderOpen
          : Folder
        : node.entry?.kind === "sqlite"
          ? Database
          : node.entry?.kind === "plist"
            ? FileCode2
            : node.entry?.kind === "text"
              ? FileText
              : File;

    return (
      <div
        key={node.path}
        role="treeitem"
        aria-expanded={node.type === "directory" ? isOpen : undefined}
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 border-b px-2 py-1.5 text-left text-xs hover:bg-accent"
          style={{ paddingLeft: `${8 + depth * 18}px` }}
          onClick={() => {
            if (node.type !== "directory") return;
            setExpanded((current) => {
              const next = new Set(current);
              if (next.has(node.path)) next.delete(node.path);
              else next.add(node.path);
              return next;
            });
          }}
        >
          {node.type === "directory" ? (
            isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )
          ) : (
            <span className="h-3.5 w-3.5 shrink-0" />
          )}
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {node.entry ? (
            <span className="shrink-0 text-muted-foreground">
              {formatBytes(node.entry.size)}
            </span>
          ) : null}
        </button>
        {node.type === "directory" && isOpen ? (
          <div role="group">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div role="tree" className="border-y">
      {tree.map((node) => renderNode(node, 0))}
    </div>
  );
}

export default csr(function SysdiagnosePage() {
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState("battery");
  const [query, setQuery] = useState("");
  const [regex, setRegex] = useState(false);
  const [level, setLevel] = useState("all");
  const [processFilter, setProcessFilter] = useState("");
  const [redactOn, setRedactOn] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const ingestRef = useRef<IngestClient | null>(null);
  const analyticsRef = useRef<AnalyticsClient | null>(null);
  const [analyticsStatus, setAnalyticsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [rangeApps, setRangeApps] = useState<AnalyticsAppRow[] | null>(null);
  const [selectedRange, setSelectedRange] = useState<TimeRange | null>(null);

  function ingestClient(): IngestClient {
    if (!ingestRef.current) ingestRef.current = new IngestClient();
    return ingestRef.current;
  }

  useEffect(() => {
    const client = ingestRef.current;
    return () => {
      client?.terminate();
      ingestRef.current = null;
    };
  }, []);

  function resetEntries() {
    ingestRef.current?.terminate();
    ingestRef.current = null;
    setEntries([]);
  }

  async function load(f: File | Blob) {
    setBusy(true);
    setProgress(null);
    setFileName((f as File).name ?? "archive");
    try {
      setEntries(await ingestClient().start(f, setProgress));
    } catch {
      // Worker failure (or superseded load) — stay on the upload screen.
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
  const chartAnchor =
    batteryPoints[Math.floor(batteryPoints.length / 2)]?.ts ??
    plistBattery?.endTime;
  const chartDate = formatChartDate(chartAnchor);
  const chartRange = useMemo<TimeRange | null>(() => {
    const start = batteryPoints[0]?.ts;
    const end = batteryPoints.at(-1)?.ts;
    return start !== undefined && end !== undefined && end > start
      ? { start, end }
      : null;
  }, [batteryPoints]);
  const powerlogEntry = useMemo(
    () =>
      entries.find(
        (entry) =>
          entry.kind === "sqlite" && /powerlog.*\.plsql$/i.test(entry.path),
      ) ?? entries.find((entry) => entry.kind === "sqlite"),
    [entries],
  );

  useEffect(() => {
    if (chartRange) setSelectedRange(null);
  }, [chartRange]);

  useEffect(() => {
    analyticsRef.current?.terminate();
    analyticsRef.current = null;
    setRangeApps(null);
    setAnalyticsStatus("idle");
    if (!plistBattery || !powerlogEntry) return;
    const client = new AnalyticsClient();
    analyticsRef.current = client;
    let cancelled = false;
    setAnalyticsStatus("loading");
    const data = powerlogEntry.data.slice().buffer;
    void client
      .init(data, plistBattery.apps, plistBattery.endTime)
      .then(() => {
        if (!cancelled) setAnalyticsStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setAnalyticsStatus("error");
      });
    return () => {
      cancelled = true;
      client.terminate();
      if (analyticsRef.current === client) analyticsRef.current = null;
    };
  }, [plistBattery, powerlogEntry]);

  useEffect(() => {
    if (analyticsStatus !== "ready" || !chartRange) return;
    const client = analyticsRef.current;
    if (!client) return;
    let cancelled = false;
    const range = selectedRange ?? chartRange;
    void client
      .query(range.start, range.end)
      .then((result) => {
        if (!cancelled) setRangeApps(result.apps);
      })
      .catch(() => {
        // A newer drag superseded this request.
      });
    return () => {
      cancelled = true;
    };
  }, [analyticsStatus, chartRange, selectedRange]);

  const displayApps = rangeApps ?? plistBattery?.apps ?? [];
  const rangeLabel =
    selectedRange && chartRange ? formatRange(selectedRange) : chartDate;
  const handleRangeChange = (range: TimeRange) => {
    if (
      chartRange &&
      range.start <= chartRange.start &&
      range.end >= chartRange.end
    ) {
      setSelectedRange(null);
    } else {
      setSelectedRange(range);
    }
  };

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
      // Swallow stray drops outside the button so the browser never
      // navigates away to a raw .tar.gz.
      <div
        className="min-h-screen bg-secondary/30 p-4 [&_*]:shadow-none"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
      >
        <div className="max-w-6xl mx-auto">
          <BackLink />
          <div className="flex min-h-[80vh] items-center justify-center">
            <div className="w-full max-w-2xl space-y-4">
              {busy ? (
                <div
                  className="w-full p-10 text-center"
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
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void load(f);
                  }}
                  className={`w-full rounded-xl border-2 border-dashed p-10 text-center transition ${dragging ? "border-primary bg-background" : "hover:bg-background"}`}
                >
                  <div className="text-lg font-semibold">
                    Drop sysdiagnose_*.tar.gz here
                  </div>
                  <div className="text-sm text-muted-foreground">
                    or click to browse
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
              {import.meta.env.DEV ? (
                <Button variant="secondary" onClick={() => void loadSample()}>
                  Try with sample data
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-secondary/30 [&_*]:shadow-none">
      <div
        className="flex h-full"
        style={
          {
            // Keep the content at the former 5xl width on desktop. On smaller
            // screens, reserve enough room for the 44-wide navigation column.
            "--sysdiagnose-content-width": "min(64rem, calc(100vw - 22rem))",
          } as React.CSSProperties
        }
      >
        {/*
          Formula layout: sidebar takes (100% - content) / 2, so the content
          panel is always centered while hugging the sidebar. The unified
          white right side (panel + gap) is whatever remains.
        */}
        <aside
          className="w-[calc((100vw_-_var(--sysdiagnose-content-width))/2)] shrink-0 overflow-y-auto py-4 pl-4 pr-4"
          aria-label="Sections"
        >
          <div className="w-44 ml-auto">
            <BackLink className="mb-0" />
            <Button
              size="sm"
              className="mt-6 w-full justify-start gap-2 rounded-full px-3"
              onClick={resetEntries}
            >
              <Upload className="h-4 w-4" />
              Upload
            </Button>
            <nav className="mt-5 space-y-1">
              {(
                [
                  ["battery", BatteryMedium],
                  ["logs", SlidersHorizontal],
                  ["wifi", Wifi],
                  ["files", FolderTree],
                ] as const
              ).map(([t, Icon]) => (
                <button
                  key={t}
                  type="button"
                  disabled={t === "wifi"}
                  onClick={() => setTab(t === "wifi" ? tab : t)}
                  aria-current={tab === t ? "page" : undefined}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${tab === t ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"} ${t === "wifi" ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  <Icon className="h-4 w-4" />
                  {t}
                  {t === "wifi" ? " (soon)" : ""}
                </button>
              ))}
            </nav>
          </div>
        </aside>
        <ScrollArea
          type="always"
          className="flex-1 min-w-0 h-full border-l bg-background"
        >
          <main
            className={`${tab === "logs" ? "w-full" : "w-[var(--sysdiagnose-content-width)] max-w-full border-r"} px-4 py-4 sm:px-6`}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <h1 className="text-xl font-semibold">Sysdiagnose</h1>
              {tab === "logs" ? (
                <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
                  <div className="relative w-56">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search messages"
                      value={query}
                      onChange={setQuery}
                      className="pl-8"
                      aria-label="Search messages"
                    />
                  </div>
                  <Input
                    placeholder="Process"
                    value={processFilter}
                    onChange={setProcessFilter}
                    className="w-32"
                    aria-label="Process filter"
                  />
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    aria-label="Log level"
                  >
                    {["all", "default", "info", "error", "fault"].map((l) => (
                      <option key={l} value={l}>
                        {l === "all" ? "All levels" : l}
                      </option>
                    ))}
                  </select>
                  {[
                    ["hangs", "hang|stuck|watchdog"],
                    ["jetsam", "jetsam|memory|kill"],
                    ["thermal", "thermal|heat|throttle"],
                  ].map(([k, v]) => (
                    <Button
                      key={k}
                      size="sm"
                      variant="plain"
                      className="border"
                      onClick={() => {
                        setQuery(v);
                        setRegex(true);
                      }}
                    >
                      {k}
                    </Button>
                  ))}
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    regex
                    <Switch checked={regex} onCheckedChange={setRegex} />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    redact
                    <Switch checked={redactOn} onCheckedChange={setRedactOn} />
                  </label>
                </div>
              ) : null}
            </div>
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsContent value="battery" className="w-full">
                <section
                  aria-labelledby="battery-chart-heading"
                  className="space-y-3"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2
                      id="battery-chart-heading"
                      className="text-base font-semibold"
                    >
                      Battery level over time
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {rangeLabel}
                    </span>
                    {analyticsStatus === "loading" ? (
                      <span className="text-xs text-muted-foreground">
                        Analyzing Powerlog…
                      </span>
                    ) : analyticsStatus === "error" ? (
                      <span className="text-xs text-muted-foreground">
                        Daily totals
                      </span>
                    ) : null}
                  </div>
                  <BatteryChart
                    points={batteryPoints}
                    charging={plistBattery?.charging}
                    selectedRange={selectedRange ?? undefined}
                    onRangeChange={
                      plistBattery && powerlogEntry
                        ? handleRangeChange
                        : undefined
                    }
                  />
                </section>
                <section className="mt-10">
                  {plistBattery ? (
                    <Table>
                      <TableCaption className="sr-only">
                        App energy for {rangeLabel}
                      </TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-0">App</TableHead>
                          <TableHead className="text-right">
                            Energy (mWh)
                          </TableHead>
                          <TableHead className="text-right">
                            Foreground (min)
                          </TableHead>
                          <TableHead className="pr-0 text-right">
                            Background (min)
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayApps.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="px-0 py-8 text-center text-sm text-muted-foreground"
                            >
                              No app activity in this range.
                            </TableCell>
                          </TableRow>
                        ) : (
                          displayApps.slice(0, 30).map((a) => (
                            <TableRow key={a.bundleId || a.name}>
                              <TableCell className="pl-0">
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
                                      <span className="cursor-default text-sm font-medium underline decoration-dotted decoration-muted-foreground/50 underline-offset-4">
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
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {a.energy.toFixed(0)} mWh
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {(a.foregroundSec / 60).toFixed(0)} min
                              </TableCell>
                              <TableCell className="pr-0 text-right tabular-nums">
                                {(a.backgroundSec / 60).toFixed(0)} min
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  ) : (
                    <Table>
                      <TableCaption className="sr-only">
                        Process energy samples for {chartDate}
                      </TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-0">Process</TableHead>
                          <TableHead className="text-right">Samples</TableHead>
                          <TableHead className="text-right">
                            Energy (mWh)
                          </TableHead>
                          <TableHead className="pr-0 text-right">
                            Average level
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agg.map((a) => (
                          <TableRow key={a.process}>
                            <TableCell className="pl-0 font-mono text-xs">
                              {a.process}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {a.samples}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {a.energy.toFixed(0)} mWh
                            </TableCell>
                            <TableCell className="pr-0 text-right tabular-nums">
                              {a.avgLevel.toFixed(0)}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </section>
              </TabsContent>
              <TabsContent value="logs" className="w-full">
                <section aria-labelledby="logs-heading" className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id="logs-heading" className="text-base font-semibold">
                      Log entries
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {logLines.length.toLocaleString()} matching lines
                      {processes.length
                        ? ` · ${processes.length} processes`
                        : ""}
                    </span>
                  </div>
                  <ScrollArea
                    type="always"
                    className="h-[calc(100vh-9rem)] border-y"
                    viewportClassName="font-mono text-xs"
                  >
                    {logLines.slice(0, 500).map((l) => (
                      <details
                        key={`${l.source}:${l.ts}:${l.process}:${l.level}:${l.message}`}
                        className="border-b px-2 py-1 last:border-b-0"
                      >
                        <summary className="cursor-pointer truncate">
                          <span
                            className={`mr-2 inline-block h-2 w-2 rounded-full ${l.level === "error" ? "bg-red-500" : l.level === "fault" ? "bg-orange-500" : "bg-green-500"}`}
                          />
                          {l.process} —{" "}
                          {redact(l.message.slice(0, 140), redactOn)}
                        </summary>
                        <pre className="whitespace-pre-wrap p-2 text-muted-foreground">
                          {redact(l.message, redactOn)}&#10;[{l.source}]
                        </pre>
                      </details>
                    ))}
                  </ScrollArea>
                </section>
              </TabsContent>
              <TabsContent value="files" className="w-full">
                <section aria-labelledby="files-heading" className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id="files-heading" className="text-base font-semibold">
                      Archive files
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {entries.length.toLocaleString()} indexed files
                    </span>
                  </div>
                  <FileTree entries={entries} />
                </section>
              </TabsContent>
            </Tabs>
          </main>
        </ScrollArea>
      </div>
    </div>
  );
});
