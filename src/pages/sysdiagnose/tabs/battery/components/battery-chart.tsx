import { type PointerEvent, useRef, useState } from "react";
import type { QueryRange } from "@/workers/sysdiagnose-query/query.protocol";
import { ChartTooltip } from "./chart-tooltip";

export function BatteryChart({
  points,
  selectedRange,
  onRangeChange,
}: {
  points: { ts: number; level: number }[];
  selectedRange: QueryRange;
  onRangeChange: (range: QueryRange) => void;
}) {
  const width = 760;
  const height = 250;
  const padding = { top: 18, right: 18, bottom: 36, left: 48 };
  const min = points[0]?.ts ?? selectedRange.startMs;
  const max = points.at(-1)?.ts ?? selectedRange.endMs;
  const x = (value: number) =>
    padding.left +
    ((value - min) / Math.max(1, max - min)) *
      (width - padding.left - padding.right);
  const y = (value: number) =>
    height -
    padding.bottom -
    (value / 100) * (height - padding.top - padding.bottom);
  const d = points
    .map(
      (point, index) => `${index ? "L" : "M"}${x(point.ts)},${y(point.level)}`,
    )
    .join(" ");
  const dragStart = useRef<number | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(
    null,
  );
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
    return min + fraction * (max - min);
  };
  const updateHover = (event: PointerEvent<SVGSVGElement>) => {
    const time = timeAt(event);
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const [index, point] of points.entries()) {
      const distance = Math.abs(point.ts - time);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    }
    setHoveredPointIndex(nearestIndex);
  };
  const hoveredPoint =
    hoveredPointIndex === null ? undefined : points[hoveredPointIndex];
  const tooltip = hoveredPoint
    ? {
        title: new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(hoveredPoint.ts)),
        lines: [`${hoveredPoint.level}% battery`],
      }
    : null;
  if (points.length < 2)
    return (
      <p className="py-8 text-sm text-muted-foreground">
        Battery UI plist has insufficient samples.
      </p>
    );
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-64 w-full"
        aria-label="Battery level from Battery UI plist"
        preserveAspectRatio="none"
        onPointerDown={(event) => {
          dragStart.current = timeAt(event);
          event.currentTarget.setPointerCapture(event.pointerId);
          updateHover(event);
        }}
        onPointerMove={updateHover}
        onPointerLeave={() => setHoveredPointIndex(null)}
        onPointerUp={(event) => {
          if (dragStart.current === null) return;
          const end = timeAt(event);
          const clickThresholdMs = ((max - min) / width) * 8;
          if (Math.abs(end - dragStart.current) <= clickThresholdMs) {
            onRangeChange({ startMs: min, endMs: max });
            dragStart.current = null;
            return;
          }
          onRangeChange({
            startMs: Math.min(dragStart.current, end),
            endMs: Math.max(dragStart.current, end),
          });
          dragStart.current = null;
        }}
      >
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#d2d2d7"
            />
            <text
              x={padding.left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              fontSize="11"
              fill="#6e6e73"
            >
              {tick}%
            </text>
          </g>
        ))}
        <rect
          x={x(selectedRange.startMs)}
          y={padding.top}
          width={Math.max(1, x(selectedRange.endMs) - x(selectedRange.startMs))}
          height={height - padding.top - padding.bottom}
          fill="#0071e3"
          opacity={0.08}
          pointerEvents="none"
        />
        <path d={d} fill="none" stroke="#0071e3" strokeWidth={3} />
        {points.map((point) => (
          <circle
            key={point.ts}
            cx={x(point.ts)}
            cy={y(point.level)}
            r={3}
            fill="#0071e3"
            stroke="white"
            strokeWidth={1.5}
            pointerEvents="none"
          />
        ))}
        {hoveredPoint ? (
          <>
            <line
              x1={x(hoveredPoint.ts)}
              x2={x(hoveredPoint.ts)}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="#1d1d1f"
              strokeDasharray="3 3"
              pointerEvents="none"
            />
            <circle
              cx={x(hoveredPoint.ts)}
              cy={y(hoveredPoint.level)}
              r={5}
              fill="#0071e3"
              stroke="white"
              strokeWidth={2}
              pointerEvents="none"
            />
          </>
        ) : null}
      </svg>
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}
