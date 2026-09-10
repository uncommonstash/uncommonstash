import { type PointerEvent, useMemo, useRef, useState } from "react";
import type {
  ComponentTotalRow,
  QueryProvenance,
  QueryRange,
} from "@/workers/sysdiagnose-query/query.protocol";
import { ChartTooltip } from "./chart-tooltip";

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
  domain,
  rows,
  provenance,
  selectedRange,
  onRangeChange,
}: {
  domain: QueryRange;
  rows: ComponentTotalRow[];
  provenance?: QueryProvenance;
  selectedRange: QueryRange;
  onRangeChange: (range: QueryRange) => void;
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
  const padding = { top: 20, right: 16, bottom: 48, left: 104 };
  const sourceStart = domain.startMs;
  const sourceEnd = domain.endMs;
  const x = (value: number) =>
    padding.left +
    ((value - sourceStart) / Math.max(1, sourceEnd - sourceStart)) *
      (width - padding.left - padding.right);
  const plotHeight = height - padding.top - padding.bottom;
  const selectedStart = Math.max(
    sourceStart,
    Math.min(sourceEnd, selectedRange.startMs),
  );
  const selectedEnd = Math.max(
    sourceStart,
    Math.min(sourceEnd, selectedRange.endMs),
  );
  const dragStart = useRef<number | null>(null);
  const timeAt = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(
      0,
      Math.min(
        1,
        (event.clientX - rect.left - (padding.left / width) * rect.width) /
          Math.max(
            1,
            ((width - padding.left - padding.right) / width) * rect.width,
          ),
      ),
    );
    return sourceStart + fraction * (sourceEnd - sourceStart);
  };
  const updateHoveredInterval = (time: number) => {
    const interval = intervals.find(
      (group) => time >= group.start && time <= group.end,
    );
    setHoveredIntervalKey(
      interval ? `${interval.start}-${interval.end}` : null,
    );
  };
  const hoveredInterval = intervals.find(
    (group) => `${group.start}-${group.end}` === hoveredIntervalKey,
  );
  const hoveredTotal = hoveredInterval?.components.reduce(
    (sum, row) => sum + row.rawEnergy,
    0,
  );
  const tooltip = hoveredInterval
    ? {
        title: intervalLabel(hoveredInterval.start, hoveredInterval.end),
        lines: [
          {
            label: `Total: ${((hoveredTotal ?? 0) * 0.001).toFixed(3)} mWh`,
          },
          ...[...hoveredInterval.components]
            .sort(
              (left, right) =>
                right.rawEnergy - left.rawEnergy ||
                left.rootNode.name.localeCompare(right.rootNode.name),
            )
            .map((row) => ({
              label: `${row.rootNode.name}: ${(row.rawEnergy * 0.001).toFixed(3)} mWh`,
              color: color(row.rootNode.name),
            })),
        ],
      }
    : null;
  const tooltipAnchor = hoveredInterval
    ? {
        x:
          ((x(hoveredInterval.start) + x(hoveredInterval.end)) / 2 / width) *
          100,
        y:
          ((height -
            padding.bottom -
            ((hoveredTotal ?? 0) / maximum) * plotHeight) /
            height) *
          100,
      }
    : null;
  return (
    <section className="shrink-0 space-y-2 px-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Energy by component</h2>
        </div>
      </div>
      {intervals.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">
          No energy data in this range.
        </p>
      ) : (
        <>
          <div className="relative">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="h-80 w-full touch-none"
              aria-label="Energy by component chart"
              preserveAspectRatio="none"
              data-requested-start-ms={provenance?.requestedRange.startMs}
              data-requested-end-ms={provenance?.requestedRange.endMs}
              data-effective-start-ms={provenance?.effectiveRange?.startMs}
              data-effective-end-ms={provenance?.effectiveRange?.endMs}
              data-selected-start-ms={selectedRange.startMs}
              data-selected-end-ms={selectedRange.endMs}
              data-timeline-start-ms={sourceStart}
              data-timeline-end-ms={sourceEnd}
              onPointerDown={(event) => {
                dragStart.current = timeAt(event);
                event.currentTarget.setPointerCapture(event.pointerId);
                updateHoveredInterval(dragStart.current);
              }}
              onPointerMove={(event) => updateHoveredInterval(timeAt(event))}
              onPointerLeave={() => setHoveredIntervalKey(null)}
              onPointerUp={(event) => {
                if (dragStart.current === null) return;
                const end = timeAt(event);
                const clickThresholdMs =
                  ((sourceEnd - sourceStart) / width) * 8;
                if (Math.abs(end - dragStart.current) <= clickThresholdMs) {
                  onRangeChange({ startMs: sourceStart, endMs: sourceEnd });
                } else {
                  onRangeChange({
                    startMs: Math.min(dragStart.current, end),
                    endMs: Math.max(dragStart.current, end),
                  });
                }
                dragStart.current = null;
              }}
            >
              <defs>
                <clipPath id="component-totals-plot">
                  <rect
                    x={padding.left}
                    y={padding.top}
                    width={width - padding.left - padding.right}
                    height={plotHeight}
                  />
                </clipPath>
              </defs>
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
              <rect
                x={x(selectedStart)}
                y={padding.top}
                width={Math.max(1, x(selectedEnd) - x(selectedStart))}
                height={plotHeight}
                fill="#0071e3"
                opacity={0.08}
                pointerEvents="none"
              />
              <g clipPath="url(#component-totals-plot)">
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
                        const barHeight =
                          (row.rawEnergy / maximum) * plotHeight;
                        y -= barHeight;
                        return (
                          <rect
                            key={row.rootNode.id}
                            x={x(group.start) + 1}
                            width={Math.max(
                              1,
                              x(group.end) - x(group.start) - 2,
                            )}
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
              </g>
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
            <ChartTooltip anchor={tooltipAnchor} tooltip={tooltip} />
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
