import { ChevronDown, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  type ArchiveEntry,
  type DeviceField,
  extractDeviceData,
} from "../../lib";

function formatCaptureTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(timestamp);
}

function FieldList({
  fields,
  hidden = false,
}: {
  fields: DeviceField[];
  hidden?: boolean;
}) {
  if (fields.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Not present in this archive.
      </p>
    );
  return (
    <dl className="divide-y divide-border/70">
      {fields.map((field) => (
        <div
          key={field.label}
          className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4"
        >
          <dt className="text-sm text-muted-foreground">{field.label}</dt>
          <dd className="min-w-0 break-all font-mono text-sm">
            {hidden && field.sensitive ? "••••••••" : field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Section({
  title,
  children,
  open = false,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details className="rounded-lg border bg-card" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[open]_&]:rotate-180" />
      </summary>
      <div className="border-t px-4 pb-2">{children}</div>
    </details>
  );
}

export function DeviceTab({ entries }: { entries: ArchiveEntry[] }) {
  const [showIdentifiers, setShowIdentifiers] = useState(false);
  const device = useMemo(() => extractDeviceData(entries), [entries]);
  const identity = new Map(
    device.identity.map((field) => [field.label, field.value]),
  );

  return (
    <section className="h-full overflow-y-auto px-4 pb-8 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-lg border bg-card p-5">
          <p className="text-sm font-medium text-muted-foreground">
            Captured device
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-2xl font-semibold tracking-tight">
              {identity.get("Hardware identifier") ??
                identity.get("Product") ??
                "Unknown device"}
            </h3>
            {identity.get("Product") && identity.get("Hardware identifier") ? (
              <span className="text-sm text-muted-foreground">
                {identity.get("Product")}
              </span>
            ) : null}
          </div>
          <dl className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                OS version
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {identity.get("OS version") ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Build
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {identity.get("Build") ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Capture time
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {formatCaptureTime(device.captureTime)}
              </dd>
            </div>
          </dl>
        </div>

        <Section title="Operating system" open>
          <FieldList fields={device.operatingSystem} />
        </Section>
        <Section title="Hardware">
          <FieldList fields={device.hardware} />
        </Section>

        <Section title="Power and USB snapshot">
          <div className="py-3 text-sm text-muted-foreground">
            These registry records describe the capture-time state only. They do
            not establish historical attachment or ownership.
          </div>
          {device.snapshots.length === 0 ? (
            <p className="pb-3 text-sm text-muted-foreground">
              No power or USB snapshot was found.
            </p>
          ) : (
            <ul className="divide-y divide-border/70 pb-1">
              {device.snapshots.map((snapshot) => (
                <li
                  key={snapshot.path}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm"
                >
                  <span className="font-medium">{snapshot.label}</span>
                  <span className="text-muted-foreground">
                    {snapshot.entryCount === null
                      ? "Recorded"
                      : `${snapshot.entryCount.toLocaleString()} registry entries`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {device.proxiedDevice.length > 0 ? (
          <Section title="Proxied device metadata">
            <div className="py-3 text-sm text-muted-foreground">
              This is metadata for a proxied device/service, not the captured
              device identity above.
            </div>
            <FieldList fields={device.proxiedDevice} />
          </Section>
        ) : null}

        <Section title="Sensitive identifiers">
          <div className="flex items-start gap-3 py-4">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Reveal identifiers locally</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Serial numbers and device IDs are hidden by default and never
                leave this browser.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {showIdentifiers ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              )}
              <Switch
                checked={showIdentifiers}
                onCheckedChange={setShowIdentifiers}
                aria-label="Reveal sensitive identifiers locally"
              />
            </div>
          </div>
          <FieldList
            fields={device.sensitiveIdentifiers}
            hidden={!showIdentifiers}
          />
        </Section>
      </div>
    </section>
  );
}
