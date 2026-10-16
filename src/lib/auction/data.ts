import { cacheLife, cacheTag } from "next/cache";
import {
  BACKFILL_DAYS,
  BACKFILL_PAGES,
  type AuctionLot,
  type PricePoint,
} from "./index";
import { getSzApi } from "./index";
import {
  isBackfilled,
  markBackfilled,
  readSales,
  saveSales,
} from "@/lib/db/sales";

// Сколько времени в миллисекундах в сутках.
const DAY_MS = 24 * 60 * 60 * 1000;

// Время запроса округляем до окна: это ключ кэша, поэтому запросы внутри
// одного окна переиспользуют один и тот же результат.
const WINDOW_MS = 5 * 60 * 1000;

// Округлённое вниз время запроса (ключ кэша истории).
export function windowOf(now: number): number {
  return Math.floor(now / WINDOW_MS) * WINDOW_MS;
}

// Активные лоты предмета. Кэш: обновление раз в минуту.
// Лоты всегда идут из API — в базе они не хранятся.
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

// Первый просмотр предмета: если история ещё не собиралась, забираем её
// из API сразу (за BACKFILL_DAYS дней) и сохраняем в БД, чтобы данные
// появились без ожидания воркера. Дальше историю дописывает воркер.
// Вызывать только после `connection()`: внутри есть и Date.now(), и запись в БД.
export async function ensureHistory(itemId: string): Promise<void> {
  if (await isBackfilled(itemId)) {
    return;
  }

  const api = getSzApi();

  if (!api) {
    return;
  }

  const since = Date.now() - BACKFILL_DAYS * DAY_MS;
  const { points, complete } = await api.getHistorySince(
    itemId,
    since,
    BACKFILL_PAGES,
  );

  await saveSales(itemId, points);

  // Пометку ставим, только если добрали весь период; иначе повторим позже.
  if (complete) {
    await markBackfilled(itemId);
  }
}

// История сделок за окно периода. Читается из PostgreSQL: API дёргает
// фоновый воркер, поэтому страница в API не ходит.
// Сигнатура прежняя — её передаёт ItemHistory.
export async function loadHistory(
  itemId: string,
  days: number,
  window: number,
): Promise<PricePoint[]> {
  "use cache";
  cacheLife({ revalidate: 300, stale: 300, expire: 1800 });
  cacheTag(`item:${itemId}`);

  const since = new Date(window - days * DAY_MS);

  return readSales(itemId, since);
}
