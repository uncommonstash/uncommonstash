import { useMemo, useState } from "react";
import type {
  ComponentTotalRow,
  QueryProvenance,
} from "@/workers/sysdiagnose-query/query.protocol";
import { ChartTooltip } from "./chart-tooltip";
import { SourceStatus } from "./source-status";

const COLORS = [
  "#0071e3",
  "#34c759",
  "#af52de",
  "#ff375f",
  "#5ac8fa",
  "#8e8e93",
  "#ff9f0a",
];

function timeLabel(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function intervalLabel(start: number, end: number) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(start))}–${formatter.format(
    new Date(end),
  )}`;
}

export function ComponentTotalsChart({
  rows,
  provenance,
}: {
  rows: ComponentTotalRow[];
  provenance?: QueryProvenance;
}) {
  const [hoveredIntervalKey, setHoveredIntervalKey] = useState<string | null>(
    null,
  );
  const intervals = useMemo(() => {
    const grouped = new Map<
      string,
      { start: number; end: number; components: ComponentTotalRow[] }
    >();
    for (const row of rows) {
      const key = `${row.interval.startMs}:${row.interval.endMs}`;
      const group = grouped.get(key) ?? {
        start: row.interval.startMs,
        end: row.interval.endMs,
        components: [],
      };
      group.components.push(row);
      grouped.set(key, group);
    }
    return [...grouped.values()].sort((a, b) => a.start - b.start);
  }, [rows]);
  const names = [...new Set(rows.map((row) => row.rootNode.name))].sort();
  const color = (name: string) => COLORS[names.indexOf(name) % COLORS.length];
  const maximum = Math.max(
    1,
    ...intervals.map((group) =>
      group.components.reduce((sum, row) => sum + row.rawEnergy, 0),
    ),
  );
  const width = 760;
  const height = 260;
  const padding = { top: 20, right: 16, bottom: 48, left: 68 };
  const sourceStart = intervals[0]?.start ?? 0;
  const sourceEnd = intervals.at(-1)?.end ?? sourceStart + 1;
  const x = (value: number) =>
    padding.left +
    ((value - sourceStart) / Math.max(1, sourceEnd - sourceStart)) *
      (width - padding.left - padding.right);
  const plotHeight = height - padding.top - padding.bottom;
  const hoveredInterval = intervals.find(
    (group) => `${group.start}-${group.end}` === hoveredIntervalKey,
  );
  const tooltip = hoveredInterval
    ? {
        title: intervalLabel(hoveredInterval.start, hoveredInterval.end),
        lines: [
          `Total: ${(hoveredInterval.components.reduce((sum, row) => sum + row.rawEnergy, 0) * 0.001).toFixed(3)} mWh`,
          ...[...hoveredInterval.components]
            .sort((a, b) => a.rootNode.name.localeCompare(b.rootNode.name))
            .map(
              (row) =>
                `${row.rootNode.name}: ${(row.rawEnergy * 0.001).toFixed(3)} mWh`,
            ),
        ],
      }
    : null;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Powerlog component totals</h2>
          <p className="text-xs text-muted-foreground">
            Hourly SUM(Energy), grouped by RootNodeID. Values are raw source
            units; the display converts uWh to mWh.
          </p>
        </div>
      </div>
      <SourceStatus provenance={provenance} />
      {intervals.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">
          No complete Powerlog intervals overlap this range.
        </p>
      ) : (
        <>
          <div className="relative">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="h-auto w-full"
              aria-label="Powerlog component totals chart"
              onPointerLeave={() => setHoveredIntervalKey(null)}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                const y = padding.top + (1 - tick) * plotHeight;
                return (
                  <g key={tick}>
                    <line
                      x1={padding.left}
                      x2={width - padding.right}
                      y1={y}
                      y2={y}
                      stroke="#d2d2d7"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="#6e6e73"
                    >
                      {(maximum * tick * 0.001).toFixed(tick ? 1 : 0)} mWh
                    </text>
                  </g>
                );
              })}
              {intervals.map((group) => {
                let y = height - padding.bottom;
                const components = [...group.components].sort((a, b) =>
                  a.rootNode.name.localeCompare(b.rootNode.name),
                );
                const key = `${group.start}-${group.end}`;
                return (
                  <g
                    key={key}
                    data-interval-start-ms={group.start}
                    data-interval-end-ms={group.end}
                    onPointerEnter={() => setHoveredIntervalKey(key)}
                  >
                    {components.map((row) => {
                      const barHeight = (row.rawEnergy / maximum) * plotHeight;
                      y -= barHeight;
                      return (
                        <rect
                          key={row.rootNode.id}
                          x={x(group.start) + 1}
                          width={Math.max(1, x(group.end) - x(group.start) - 2)}
                          y={y}
                          height={barHeight}
                          fill={color(row.rootNode.name)}
                        />
                      );
                    })}
                    <rect
                      x={x(group.start) + 1}
                      y={padding.top}
                      width={Math.max(1, x(group.end) - x(group.start) - 2)}
                      height={plotHeight}
                      fill="transparent"
                    />
                  </g>
                );
              })}
              {hoveredInterval ? (
                <line
                  x1={(x(hoveredInterval.start) + x(hoveredInterval.end)) / 2}
                  x2={(x(hoveredInterval.start) + x(hoveredInterval.end)) / 2}
                  y1={padding.top}
                  y2={height - padding.bottom}
                  stroke="#1d1d1f"
                  strokeDasharray="3 3"
                  pointerEvents="none"
                />
              ) : null}
              <text
                x={padding.left}
                y={height - 16}
                fontSize="11"
                fill="#6e6e73"
              >
                {timeLabel(sourceStart)}
              </text>
              <text
                x={width - padding.right}
                y={height - 16}
                textAnchor="end"
                fontSize="11"
                fill="#6e6e73"
              >
                {timeLabel(sourceEnd)}
              </text>
            </svg>
            <ChartTooltip tooltip={tooltip} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {names.map((name) => (
              <span key={name}>
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: color(name) }}
                />
                {name}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
