import { useMemo, useState } from "react";
import type { AppEnergyAttributionRow } from "@/workers/sysdiagnose-query/query.protocol";
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

function formatEnergy(rawEnergy: number) {
  const energy = rawEnergy * 0.001;
  if (energy >= 100) return `${energy.toFixed(0)} mWh`;
  if (energy >= 10) return `${energy.toFixed(1)} mWh`;
  return `${energy.toFixed(2)} mWh`;
}

interface ComponentEnergy {
  id: number;
  name: string;
  rawEnergy: number;
}

interface IntervalEnergy {
  start: number;
  end: number;
  components: ComponentEnergy[];
}

export function AppEnergyChart({ rows }: { rows: AppEnergyAttributionRow[] }) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const intervals = useMemo<IntervalEnergy[]>(() => {
    const grouped = new Map<
      string,
      {
        start: number;
        end: number;
        components: Map<number, ComponentEnergy>;
      }
    >();
    for (const row of rows) {
      const key = `${row.interval.startMs}:${row.interval.endMs}`;
      const interval = grouped.get(key) ?? {
        start: row.interval.startMs,
        end: row.interval.endMs,
        components: new Map(),
      };
      const component = interval.components.get(row.rootNode.id) ?? {
        id: row.rootNode.id,
        name: row.rootNode.name,
        rawEnergy: 0,
      };
      component.rawEnergy += row.rawEnergy;
      interval.components.set(component.id, component);
      grouped.set(key, interval);
    }
    return [...grouped.values()]
      .map((interval) => ({
        start: interval.start,
        end: interval.end,
        components: [...interval.components.values()],
      }))
      .sort((left, right) => left.start - right.start);
  }, [rows]);
  const componentIds = useMemo(
    () =>
      [
        ...new Set(
          intervals.flatMap((interval) =>
            interval.components.map((component) => component.id),
          ),
        ),
      ].sort((left, right) => {
        const total = (id: number) =>
          intervals.reduce(
            (sum, interval) =>
              sum +
              (interval.components.find((component) => component.id === id)
                ?.rawEnergy ?? 0),
            0,
          );
        return total(right) - total(left);
      }),
    [intervals],
  );
  const componentName = (id: number) =>
    intervals
      .flatMap((interval) => interval.components)
      .find((component) => component.id === id)?.name ?? `Node ${id}`;
  const color = (id: number) =>
    COLORS[componentIds.indexOf(id) % COLORS.length];
  const maximum = Math.max(
    1,
    ...intervals.map((interval) =>
      interval.components.reduce(
        (sum, component) => sum + component.rawEnergy,
        0,
      ),
    ),
  );
  const width = 760;
  const height = 230;
  const padding = { top: 18, right: 16, bottom: 40, left: 92 };
  const start = intervals[0]?.start ?? 0;
  const end = intervals.at(-1)?.end ?? start + 1;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (value: number) =>
    padding.left +
    ((value - start) / Math.max(1, end - start)) *
      (width - padding.left - padding.right);
  const hovered = intervals.find(
    (interval) => `${interval.start}-${interval.end}` === hoveredKey,
  );
  const hoveredTotal = hovered?.components.reduce(
    (sum, component) => sum + component.rawEnergy,
    0,
  );
  const tooltip = hovered
    ? {
        title: intervalLabel(hovered.start, hovered.end),
        lines: [
          `Total: ${formatEnergy(hoveredTotal ?? 0)}`,
          ...[...hovered.components]
            .sort((left, right) => right.rawEnergy - left.rawEnergy)
            .map(
              (component) =>
                `${component.name}: ${formatEnergy(component.rawEnergy)}`,
            ),
        ],
      }
    : null;
  const tooltipAnchor = hovered
    ? {
        x: ((x(hovered.start) + x(hovered.end)) / 2 / width) * 100,
        y:
          ((height -
            padding.bottom -
            ((hoveredTotal ?? 0) / maximum) * plotHeight) /
            height) *
          100,
      }
    : null;

  if (intervals.length === 0)
    return (
      <p className="py-8 text-sm text-muted-foreground">
        No energy records for this app in the selected range.
      </p>
    );

  return (
    <div className="space-y-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-72 w-full"
          aria-label="App energy over time by component"
          preserveAspectRatio="none"
          onPointerLeave={() => setHoveredKey(null)}
        >
          {[0, 0.5, 1].map((tick) => {
            const value = maximum * tick;
            const y = height - padding.bottom - tick * plotHeight;
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
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#6e6e73"
                >
                  {formatEnergy(value)}
                </text>
              </g>
            );
          })}
          {intervals.map((interval) => {
            const key = `${interval.start}-${interval.end}`;
            const byId = new Map(
              interval.components.map((component) => [component.id, component]),
            );
            let baseline = height - padding.bottom;
            return (
              <g
                key={key}
                data-interval-start-ms={interval.start}
                data-interval-end-ms={interval.end}
                onPointerEnter={() => setHoveredKey(key)}
              >
                {componentIds.map((id) => {
                  const rawEnergy = byId.get(id)?.rawEnergy ?? 0;
                  const barHeight = (rawEnergy / maximum) * plotHeight;
                  baseline -= barHeight;
                  return rawEnergy > 0 ? (
                    <rect
                      key={id}
                      x={x(interval.start) + 1}
                      y={baseline}
                      width={Math.max(
                        1,
                        x(interval.end) - x(interval.start) - 2,
                      )}
                      height={barHeight}
                      fill={color(id)}
                    />
                  ) : null;
                })}
                <rect
                  x={x(interval.start) + 1}
                  y={padding.top}
                  width={Math.max(1, x(interval.end) - x(interval.start) - 2)}
                  height={plotHeight}
                  fill="transparent"
                />
              </g>
            );
          })}
          {hovered ? (
            <line
              x1={(x(hovered.start) + x(hovered.end)) / 2}
              x2={(x(hovered.start) + x(hovered.end)) / 2}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="#1d1d1f"
              strokeDasharray="3 3"
              pointerEvents="none"
            />
          ) : null}
          <text x={padding.left} y={height - 14} fontSize="11" fill="#6e6e73">
            {timeLabel(start)}
          </text>
          <text
            x={width - padding.right}
            y={height - 14}
            textAnchor="end"
            fontSize="11"
            fill="#6e6e73"
          >
            {timeLabel(end)}
          </text>
        </svg>
        <ChartTooltip anchor={tooltipAnchor} tooltip={tooltip} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {componentIds.map((id) => (
          <span key={id}>
            <span
              className="mr-1 inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: color(id) }}
            />
            {componentName(id)}
          </span>
        ))}
      </div>
    </div>
  );
}
