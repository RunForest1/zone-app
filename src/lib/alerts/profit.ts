import { MARKET_FEE } from "@/lib/auction/market";

// Экономика алертов: площадка забирает комиссию с продажи, поэтому «продать
// дороже, чем купил» недостаточно — нужно покрыть комиссию.
// Сама ставка комиссии — общая с сайтом (MARKET_FEE в @/lib/auction/market).

// Периоды рынка в сообщении (дней).
export const ALERT_PERIODS = [7, 14, 30];

// Рынок за один период: считается по совершённым сделкам.
export interface PeriodStats {
  days: number;
  average: number | null;
  median: number | null;
  deals: number;
}

// Оценка выгоды для алерта: покупаем по цене сделки, продаём по средней рынка.
// Прибыль нетто = (1 − комиссия) × средняя − цена; маржа = прибыль / средняя × 100.
export interface FlipEstimate {
  profit: number | null;
  margin: number | null;
}

export function estimateFlip(
  price: number,
  average: number | null,
): FlipEstimate {
  if (average === null || average <= 0) {
    return { profit: null, margin: null };
  }

  const profit = (1 - MARKET_FEE) * average - price;

  return { profit, margin: (profit / average) * 100 };
}
