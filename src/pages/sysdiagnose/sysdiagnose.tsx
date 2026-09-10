import {
  BatteryMedium,
  CircleAlert,
  FileText,
  FolderTree,
  HardDrive,
  type LucideIcon,
  Smartphone,
  Thermometer,
  Upload,
  Wifi,
} from "lucide-react";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { csr } from "@/lib/compat";
import { IngestClient } from "@/workers/sysdiagnose-ingest/ingest.client";
import {
  type ArchiveEntry,
  type BatteryPlistData,
  extractBatteryFromPlist,
  findBatteryPlistEntry,
  type IngestProgress,
  parsePlist,
} from "./lib";
import {
  BatteryTab,
  type BatteryView,
  BatteryViewToggle,
} from "./tabs/battery/battery-tab";
import { CrashesTab } from "./tabs/crashes/crashes-tab";
import { DeviceTab } from "./tabs/device/device-tab";
import { FilesTab } from "./tabs/files/files-tab";
import { LogsTab } from "./tabs/logs/logs-tab";
import { StorageTab } from "./tabs/storage/storage-tab";
import { ThermalTab } from "./tabs/thermal/thermal-tab";
import { WifiTab } from "./tabs/wifi/wifi-tab";

type Tab =
  | "battery"
  | "wifi"
  | "storage"
  | "thermal"
  | "device"
  | "crashes"
  | "logs"
  | "files";

function formatMB(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  return `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;
}

function stageLabel(progress: IngestProgress): string {
  if (progress.stage === "reading")
    return progress.bytesTotal > 0
      ? `Reading ${formatMB(progress.bytesRead)} of ${formatMB(progress.bytesTotal)}`
      : `Reading ${formatMB(progress.bytesRead)}`;
  if (progress.stage === "decompressing")
    return `Decompressing ${formatMB(progress.bytesRead)} streamed`;
  if (progress.stage === "storing")
    return `Indexing ${progress.filesFound.toLocaleString()} files`;
  if (progress.stage === "done")
    return `${progress.filesFound.toLocaleString()} files ready`;
  return "Indexing archive";
}

export default csr(function SysdiagnosePage() {
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState<Tab>("battery");
  const [batteryView, setBatteryView] = useState<BatteryView>("battery");
  const fileRef = useRef<HTMLInputElement>(null);
  const ingestRef = useRef<IngestClient | null>(null);

  const ingestClient = () => {
    if (!ingestRef.current) ingestRef.current = new IngestClient();
    return ingestRef.current;
  };
  useEffect(() => () => ingestRef.current?.terminate(), []);

  const load = async (file: File | Blob) => {
    setBusy(true);
    setProgress(null);
    setFileName((file as File).name ?? "sysdiagnose archive");
    try {
      setEntries(await ingestClient().start(file, setProgress));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  const reset = () => {
    ingestRef.current?.terminate();
    ingestRef.current = null;
    setEntries([]);
    setTab("battery");
    setBatteryView("battery");
  };

  const battery = useMemo<BatteryPlistData | null>(() => {
    const entry = findBatteryPlistEntry(entries);
    if (!entry) return null;
    try {
      return extractBatteryFromPlist(parsePlist(entry.data));
    } catch {
      return null;
    }
  }, [entries]);
  const powerlog = useMemo(
    () =>
      entries.find(
        (entry) =>
          entry.kind === "sqlite" && /powerlog.*\.plsql$/i.test(entry.path),
      ) ??
      entries.find((entry) => entry.kind === "sqlite") ??
      null,
    [entries],
  );

  if (entries.length === 0)
    return (
      <UploadView
        busy={busy}
        dragging={dragging}
        fileName={fileName}
        fileRef={fileRef}
        progress={progress}
        onDragChange={setDragging}
        onLoad={load}
      />
    );
  const navigation: Array<{
    id: Tab;
    label: string;
    Icon: LucideIcon;
  }> = [
    { id: "battery", label: "Battery", Icon: BatteryMedium },
    { id: "wifi", label: "WiFi", Icon: Wifi },
    { id: "storage", label: "Storage", Icon: HardDrive },
    { id: "thermal", label: "Thermal", Icon: Thermometer },
    { id: "device", label: "Device", Icon: Smartphone },
    { id: "crashes", label: "Crashes", Icon: CircleAlert },
    { id: "logs", label: "Logs", Icon: FileText },
    { id: "files", label: "Files", Icon: FolderTree },
  ];
  return (
    <div className="h-screen overflow-hidden bg-secondary/30 [&_*]:shadow-none">
      <div
        className="flex h-full"
        style={
          {
            "--sysdiagnose-content-width": "min(64rem, calc(100vw - 22rem))",
          } as CSSProperties
        }
      >
        <aside
          className="w-[calc((100vw_-_var(--sysdiagnose-content-width))/2)] shrink-0 overflow-y-auto py-4 pl-4 pr-4"
          aria-label="Sections"
        >
          <div className="ml-auto w-44">
            <BackLink className="mb-0" />
            <Button
              size="sm"
              className="mt-6 w-full justify-start gap-2 rounded-full px-3"
              onClick={reset}
            >
              <Upload className="h-4 w-4" />
              Upload
            </Button>
            <nav className="mt-5 space-y-1">
              {navigation.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={tab === id ? "page" : undefined}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${tab === id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </aside>
        <div className="min-w-0 flex-1 overflow-hidden border-l border-border/40 bg-background">
          <main
            className={`${tab === "logs" ? "w-full" : "w-[var(--sysdiagnose-content-width)] max-w-full"} flex h-full min-h-0 flex-col py-4`}
          >
            <div className="mb-6 flex shrink-0 items-center justify-between gap-4 px-4 sm:px-6">
              <h1 className="text-xl font-semibold">Sysdiagnose</h1>
              {tab === "battery" && battery ? (
                <BatteryViewToggle
                  view={batteryView}
                  onViewChange={setBatteryView}
                />
              ) : null}
            </div>
            <div className="min-h-0 flex-1">
              {tab === "battery" ? (
                <BatteryTab
                  battery={battery}
                  powerlog={powerlog}
                  view={batteryView}
                />
              ) : null}
              {tab === "wifi" ? <WifiTab /> : null}
              {tab === "storage" ? <StorageTab /> : null}
              {tab === "thermal" ? <ThermalTab /> : null}
              {tab === "device" ? <DeviceTab /> : null}
              {tab === "crashes" ? <CrashesTab /> : null}
              {tab === "logs" ? <LogsTab entries={entries} /> : null}
              {tab === "files" ? <FilesTab entries={entries} /> : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
});

function UploadView({
  busy,
  dragging,
  fileName,
  fileRef,
  progress,
  onDragChange,
  onLoad,
}: {
  busy: boolean;
  dragging: boolean;
  fileName: string;
  fileRef: React.RefObject<HTMLInputElement | null>;
  progress: IngestProgress | null;
  onDragChange: (dragging: boolean) => void;
  onLoad: (file: File) => void;
}) {
  return (
    <div
      className="min-h-screen bg-secondary/30 p-4 [&_*]:shadow-none"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      <div className="mx-auto max-w-6xl">
        <BackLink />
        <div className="flex min-h-[80vh] items-center justify-center">
          <div className="w-full max-w-xl space-y-4">
            {busy ? (
              <div
                className="w-full p-10 text-center"
                role="status"
                aria-live="polite"
              >
                <Spinner
                  size="md"
                  className="mx-auto"
                  value={progress?.fraction}
                >
                  <span className="sr-only">Loading sysdiagnose</span>
                </Spinner>
                <div className="mt-4 truncate text-lg font-semibold">
                  {fileName}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {progress ? stageLabel(progress) : "Starting"}
                </div>
                <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
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
                onDragOver={(event) => {
                  event.preventDefault();
                  onDragChange(true);
                }}
                onDragLeave={() => onDragChange(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  onDragChange(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) onLoad(file);
                }}
                className={`flex min-h-64 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${dragging ? "border-primary bg-background" : "hover:bg-background"}`}
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
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onLoad(file);
              }}
            />
            <ol className="mx-auto w-fit max-w-full list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                iPhone: press Vol Up + Vol Down + hold Side 1s, wait about 10
                min.
              </li>
              <li>
                Settings → Privacy & Security → Analytics → Analytics Data →
                sysdiagnose_[date].
              </li>
              <li>Share via AirDrop, then drop the .tar.gz above.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
