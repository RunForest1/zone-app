import { cacheLife, cacheTag } from "next/cache";
import { getSzApi, type AuctionLot, type PricePoint } from "./index";

// Время запроса округляем до окна: это ключ кэша, поэтому запросы внутри
// одного окна переиспользуют один и тот же результат.
const WINDOW_MS = 5 * 60 * 1000;

// Округлённое вниз время запроса (ключ кэша истории).
export function windowOf(now: number): number {
  return Math.floor(now / WINDOW_MS) * WINDOW_MS;
}

// Активные лоты предмета. Кэш: обновление раз в минуту.
export async function loadLots(itemId: string): Promise<AuctionLot[]> {
  "use cache";
  cacheLife({ revalidate: 60, stale: 60, expire: 300 });
  cacheTag(`item:${itemId}`);

  const api = getSzApi();

  if (!api) {
    return [];
  }

  return api.getLots(itemId);
}

// История сделок за окно периода. Кэш: обновление раз в 5 минут.
// Качество/точка не входят в ключ — фильтруем уже готовые данные в памяти.
export async function loadHistory(
  itemId: string,
  days: number,
  window: number,
): Promise<PricePoint[]> {
  "use cache";
  cacheLife({ revalidate: 300, stale: 300, expire: 1800 });
  cacheTag(`item:${itemId}`);

  const api = getSzApi();

  if (!api) {
    return [];
  }

  return api.getHistory(itemId, days, window);
}
