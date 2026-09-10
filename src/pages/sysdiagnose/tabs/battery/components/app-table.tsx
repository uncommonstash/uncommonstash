import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppIdentity, AppEnergyAttributionRow, AppRuntimeRow, QueryProvenance } from "@/workers/sysdiagnose-query/query.protocol";
import { SourceStatus } from "./source-status";

export function AppTable({ apps, energyRows, runtimeRows, energyProvenance, runtimeProvenance }: { apps: AppIdentity[]; energyRows: AppEnergyAttributionRow[]; runtimeRows: AppRuntimeRow[]; energyProvenance?: QueryProvenance; runtimeProvenance?: QueryProvenance }) {
  const energy = new Map<string, number>();
  for (const row of energyRows) energy.set(row.consumerNode.name, (energy.get(row.consumerNode.name) ?? 0) + row.rawEnergy);
  const runtime = new Map<string, AppRuntimeRow>();
  for (const row of runtimeRows) {
    const previous = runtime.get(row.bundleId);
    runtime.set(row.bundleId, { ...row, foregroundSec: (previous?.foregroundSec ?? 0) + row.foregroundSec, backgroundSec: (previous?.backgroundSec ?? 0) + row.backgroundSec });
  }
  const rows = apps.map((app) => ({ app, rawEnergy: energy.get(app.bundleId), runtime: runtime.get(app.bundleId) })).filter((row) => row.rawEnergy !== undefined || row.runtime);
  return <section className="space-y-2"><div><h3 className="text-base font-semibold">App attribution and runtime</h3><SourceStatus provenance={energyProvenance} /><SourceStatus provenance={runtimeProvenance} /></div><Table><TableHeader><TableRow><TableHead className="pl-0">App</TableHead><TableHead className="text-right">Energy (mWh)</TableHead><TableHead className="text-right">Foreground (min)</TableHead><TableHead className="pr-0 text-right">Background (min)</TableHead></TableRow></TableHeader><TableBody>{rows.length === 0 ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No Powerlog app rows in this range.</TableCell></TableRow> : rows.map(({ app, rawEnergy, runtime: times }) => <TableRow key={app.bundleId}><TableCell className="pl-0 font-medium">{app.name}<div className="font-mono text-xs text-muted-foreground">{app.bundleId}</div></TableCell><TableCell className="text-right tabular-nums">{rawEnergy === undefined ? "—" : `${(rawEnergy * 0.001).toFixed(2)} mWh`}</TableCell><TableCell className="text-right tabular-nums">{times ? `${(times.foregroundSec / 60).toFixed(0)} min` : "—"}</TableCell><TableCell className="pr-0 text-right tabular-nums">{times ? `${(times.backgroundSec / 60).toFixed(0)} min` : "—"}</TableCell></TableRow>)}</TableBody></Table></section>;
}
