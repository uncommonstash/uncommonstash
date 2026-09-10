export interface ChartTooltipData {
  title: string;
  lines: string[];
}

export function ChartTooltip({
  tooltip,
}: {
  tooltip: ChartTooltipData | null;
}) {
  if (!tooltip) return null;

  return (
    <div
      role="tooltip"
      data-testid="chart-sample-tooltip"
      className="pointer-events-none absolute right-2 top-2 z-10 max-h-36 w-64 max-w-[calc(100%_-_1rem)] overflow-y-auto rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
    >
      <div className="font-medium">{tooltip.title}</div>
      {tooltip.lines.map((line) => (
        <div
          key={`${tooltip.title}-${line}`}
          className="mt-0.5 tabular-nums text-muted-foreground"
        >
          {line}
        </div>
      ))}
    </div>
  );
}
