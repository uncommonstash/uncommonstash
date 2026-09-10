export interface ChartTooltipData {
  title: string;
  lines: string[];
}

export interface ChartTooltipAnchor {
  x: number;
  y: number;
}

export function ChartTooltip({
  anchor,
  tooltip,
}: {
  anchor: ChartTooltipAnchor | null;
  tooltip: ChartTooltipData | null;
}) {
  if (!tooltip || !anchor) return null;

  const x = Math.max(2, Math.min(98, anchor.x));
  const y = Math.max(2, Math.min(98, anchor.y));
  const horizontal = x < 24 ? "0" : x > 76 ? "-100%" : "-50%";
  const vertical = y > 50 ? "calc(-100% - 8px)" : "8px";

  return (
    <div
      role="tooltip"
      data-testid="chart-sample-tooltip"
      className="pointer-events-none absolute z-10 max-h-36 w-64 max-w-[calc(100%_-_1rem)] overflow-y-auto rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(${horizontal}, ${vertical})`,
      }}
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
