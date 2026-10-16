// Доступные периоды истории продаж, дней.
export const PERIODS = [7, 14, 30];

// Фильтры рынка, которые хранятся в адресе.
export interface MarketQuery {
  days: number;
  quality: string;
  point: string;
}

// Разбирает период из URL: возвращает допустимый период (по умолчанию 7 дней).
export function parsePeriod(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const days = Number(raw);

  if (PERIODS.includes(days)) {
    return days;
  }

  return PERIODS[0];
}

// Разбирает числовой параметр (qlt / ptn): пустое или нечисловое значение — «все».
export function parseFeature(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;

  if (typeof raw !== "string" || raw === "") {
    return "";
  }

  return /^\d+$/.test(raw) ? raw : "";
}

// Адрес рынка с учётом выбранных фильтров.
export function marketHref(
  query: MarketQuery,
  patch: Partial<MarketQuery>,
): string {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();

  params.set("days", String(next.days));

  if (next.quality) {
    params.set("qlt", next.quality);
  }

  if (next.point) {
    params.set("ptn", next.point);
  }

  return `?${params.toString()}`;
}
