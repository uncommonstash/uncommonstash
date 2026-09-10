import type { QueryProvenance } from "@/workers/sysdiagnose-query/query.protocol";

export function SourceStatus({ provenance }: { provenance?: QueryProvenance }) {
  if (!provenance) return <p className="text-xs text-muted-foreground">Waiting for Powerlog query results.</p>;
  const aggregation = provenance.aggregation.map((entry) => `${entry.operation}(${entry.input}) by ${entry.groupBy.join(", ")}`).join("; ");
  const time = (value: number) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  const effective = provenance.effectiveRange;
  return <p className="text-xs text-muted-foreground" data-requested-start-ms={provenance.requestedRange.startMs} data-requested-end-ms={provenance.requestedRange.endMs} data-effective-start-ms={effective?.startMs} data-effective-end-ms={effective?.endMs}>Source: {provenance.source.table} · {aggregation || "source rows"} · {provenance.source.clock}{effective ? <> · Effective source range: {time(effective.startMs)}–{time(effective.endMs)}</> : " · No overlapping source rows"}</p>;
}
