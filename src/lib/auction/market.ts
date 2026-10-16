import type { AuctionLot, PricePoint } from "./index";

// Тип сделки для статистики: история и лоты обрабатываются одинаково.
type Entry = AuctionLot | PricePoint;

// Значение признака (качество/точка) для фильтра.
// Отсутствующая точка считается нулём — тогда её тоже можно выбрать.
export function featureValue(entry: Entry, key: "qlt" | "ptn"): string {
  const value = entry.additional?.[key];

  if (typeof value === "number") {
    return String(value);
  }

  return key === "ptn" ? "0" : "";
}

// Полные диапазоны признаков: заточка 0–15, качество 0–5.
const FEATURE_RANGES: Record<"qlt" | "ptn", number> = { qlt: 6, ptn: 16 };

// Полный список значений признака для фильтра.
// Так варианты не «пропадают» из списка, если по какому-то значению
// пока не было сделок или лотов.
export function featureRange(key: "qlt" | "ptn"): number[] {
  return Array.from({ length: FEATURE_RANGES[key] }, (_, index) => index);
}

// Значения признака, которые есть в данных (для фильтра).
export function availableValues(
  entries: Entry[],
  key: "qlt" | "ptn",
): number[] {
  const values = new Set<number>();
  let found = false;

  for (const entry of entries) {
    const value = entry.additional?.[key];

    if (typeof value === "number") {
      values.add(value);
      found = true;
    }
  }

  // Признака нет в данных — фильтр не показываем.
  if (!found) {
    return [];
  }

  if (key === "ptn") {
    values.add(0);
  }

  return [...values].sort((a, b) => a - b);
}

// Фильтр по качеству и точке: пустое значение — не фильтруем.
export function filterEntries<T extends Entry>(
  entries: T[],
  quality: string,
  point: string,
): T[] {
  return entries.filter((entry) => {
    if (quality && featureValue(entry, "qlt") !== quality) {
      return false;
    }

    if (point && featureValue(entry, "ptn") !== point) {
      return false;
    }

    return true;
  });
}

// Точка графика: средняя цена за интервал.
export interface SeriesPoint {
  time: string;
  price: number;
  count: number;
}

// Сводка по сделкам за период.
export interface HistorySummary {
  series: SeriesPoint[];
  count: number;
  sold: number;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  last: number | null;
  // Границы реально полученных данных (для честной подписи о покрытии).
  from: string | null;
  to: string | null;
}

// Сколько интервалов на графике.
const SERIES_BUCKETS = 120;

// Считает статистику по сделкам и ряд для графика (по интервалам времени).
export function summarize(points: PricePoint[]): HistorySummary {
  const empty: HistorySummary = {
    series: [],
    count: 0,
    sold: 0,
    average: null,
    median: null,
    min: null,
    max: null,
    last: null,
    from: null,
    to: null,
  };

  if (points.length === 0) {
    return empty;
  }

  const prices = points.map((point) => point.price);
  const sum = prices.reduce((total, price) => total + price, 0);

  return {
    series: buildSeries(points),
    count: points.length,
    sold: points.reduce((total, point) => total + (point.amount || 1), 0),
    average: Math.round(sum / prices.length),
    median: medianOf(prices),
    min: Math.min(...prices),
    max: Math.max(...prices),
    last: prices[prices.length - 1],
    from: points[0].time,
    to: points[points.length - 1].time,
  };
}

// Ряд для графика: окно делится на равные интервалы, внутри — средняя цена.
function buildSeries(points: PricePoint[]): SeriesPoint[] {
  const first = new Date(points[0].time).getTime();
  const last = new Date(points[points.length - 1].time).getTime();
  const span = last - first;
  const step = span > 0 ? span / SERIES_BUCKETS : 1;
  const groups = new Map<number, { sum: number; count: number }>();

  for (const point of points) {
    const time = new Date(point.time).getTime();
    const index =
      span > 0
        ? Math.min(SERIES_BUCKETS - 1, Math.floor((time - first) / step))
        : 0;
    const group = groups.get(index) ?? { sum: 0, count: 0 };

    group.sum += point.price;
    group.count += 1;
    groups.set(index, group);
  }

  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, group]) => ({
      time: new Date(first + index * step).toISOString(),
      price: Math.round(group.sum / group.count),
      count: group.count,
    }));
}

// Медиана набора цен (точная, без округления на промежуточных шагах).
function medianOf(prices: number[]): number | null {
  if (prices.length === 0) {
    return null;
  }

  const sorted = [...prices].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
