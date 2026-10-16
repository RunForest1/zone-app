"use client";

import { useRef, useState } from "react";
import type { SeriesPoint } from "@/lib/auction/market";
import { formatDateTime, formatDay, formatPrice } from "@/lib/format";

// График средней цены по интервалам времени.
// Точки позиционируются по времени, поэтому разрывы в данных видно честно.
export function PriceChart({ points }: { points: SeriesPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const times = points.map((point) => new Date(point.time).getTime());
  const prices = points.map((point) => point.price);
  const first = times.length > 0 ? times[0] : 0;
  const last = times.length > 0 ? times[times.length - 1] : 0;
  const span = last - first;
  const min = prices.length > 0 ? Math.min(...prices) : 0;
  const max = prices.length > 0 ? Math.max(...prices) : 0;
  const priceSpan = max - min;

  // Координаты в системе 0..100 (ось Y перевёрнута).
  const coords = points.map((point, index) => ({
    x: span > 0 ? ((times[index] - first) / span) * 100 : 50,
    y: priceSpan === 0 ? 50 : (1 - (point.price - min) / priceSpan) * 100,
    point,
  }));

  const line = coords
    .map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`)
    .join(" ");
  const activeCoord = active === null ? null : coords[active];

  function onMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = box.current?.getBoundingClientRect();

    if (!rect || coords.length === 0) {
      return;
    }

    const ratio = (event.clientX - rect.left) / rect.width;
    const target = first + ratio * span;

    // Ищем ближайшую по времени точку.
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < times.length; i += 1) {
      const distance = Math.abs(times[i] - target);

      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }

    setActive(best);
  }

  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        За этот период сделок нет · историю пополняет воркер (раз в 5 минут)
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <div className="flex h-56 w-20 shrink-0 flex-col justify-between text-right text-xs text-faint">
          <span>{formatPrice(max)}</span>
          <span>{formatPrice(min)}</span>
        </div>

        <div
          ref={box}
          onMouseMove={onMove}
          onMouseLeave={() => setActive(null)}
          className="relative h-56 flex-1"
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-full w-full"
            role="img"
            aria-label="График цены"
          >
            <polyline
              points={line}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {activeCoord ? (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 w-px bg-line"
                style={{ left: `${activeCoord.x}%` }}
              />
              <div
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
                style={{
                  left: `${activeCoord.x}%`,
                  top: `${activeCoord.y}%`,
                }}
              />
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-card"
                style={{
                  left: `${activeCoord.x}%`,
                  top: `${activeCoord.y}%`,
                }}
              >
                <div className="font-medium">
                  {formatPrice(activeCoord.point.price)}
                </div>
                <div className="text-faint">
                  {formatDateTime(activeCoord.point.time)} ·{" "}
                  {activeCoord.point.count} сд.
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex justify-between pl-23 text-xs text-faint">
        <span>{formatDay(points[0].time)}</span>
        <span>{formatDay(points[points.length - 1].time)}</span>
      </div>
    </div>
  );
}
