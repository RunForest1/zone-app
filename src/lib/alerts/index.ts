import { Prisma } from "@prisma/client";
import { getSzApi, type AuctionLot } from "@/lib/auction";
import { listActiveAlertChats, markAlertSent } from "@/lib/db/alerts";
import { lastSalePrice, saleStats } from "@/lib/db/sales";
import { itemsDatabase } from "@/lib/items/store";
import { detectAlerts } from "./detect";
import {
  ALERT_PERIODS,
  estimateFlip,
  SCAN_MIN_SALES,
  type PeriodStats,
} from "./profit";

// Скан активных лотов по предмету (для процесса bot).
// Ищем лоты, которые висят заметно дешевле недавней средней по своему
// качеству и точке. В Telegram не шлём — только пишем события в AlertEvent.

const DAY_MS = 24 * 60 * 60 * 1000;

export async function scanLots(itemId: string): Promise<number> {
  const api = getSzApi();

  if (!api) {
    return 0;
  }

  const chats = await listActiveAlertChats();

  if (chats.length === 0) {
    return 0;
  }

  const item = itemsDatabase.items[itemId];

  if (!item) {
    return 0;
  }

  const lots = await api.getLots(itemId);
  // Берём только лоты с выкупом: это цена, за которую можно купить сразу.
  const priced = lots.filter((lot) => lot.buyoutPrice > 0);

  if (priced.length === 0) {
    return 0;
  }

  // Рынок по срезу не зависит от лота — считаем один раз на срез.
  const sliceCache = new Map<string, PeriodStats[]>();
  let queued = 0;

  for (const lot of priced) {
    const quality = lot.additional?.qlt ?? null;
    const point = lot.additional?.ptn ?? 0;

    const periods = await slicePrices(sliceCache, itemId, quality, point);
    const week = periods[0];

    // Нет истории по срезу или слишком мало сделок — оценивать нечем.
    if (!week || week.average === null || week.deals < SCAN_MIN_SALES) {
      continue;
    }

    const estimate = estimateFlip(lot.buyoutPrice, week.average);
    const matches = detectAlerts(
      { quality, point, category: item.category, rank: item.color },
      chats,
      estimate,
    );

    if (matches.length === 0) {
      continue;
    }

    const lastPrice = await lastSalePrice(itemId, quality, point);
    const lotKey = lotKeyOf(itemId, lot);

    for (const match of matches) {
      // Дедуп по (чат, ключ лота): один и тот же лот шлём один раз.
      const created = await markAlertSent({
        alertChatId: match.chat.id,
        itemId,
        lotKey,
        quality,
        point,
        lotPrice: BigInt(Math.round(lot.buyoutPrice)),
        average: BigInt(week.average),
        profit: match.profit,
        margin: match.margin,
        lotStart: lotDate(lot.startTime),
        lotEnd: lotDate(lot.endTime),
        lastPrice: lastPrice === null ? null : BigInt(lastPrice),
        stats: periods as unknown as Prisma.InputJsonValue,
      });

      if (created) {
        queued += 1;
      }
    }
  }

  return queued;
}

// Рынок за 7/14/30 дней по срезу лота (качество + точка); кэш на проход.
async function slicePrices(
  cache: Map<string, PeriodStats[]>,
  itemId: string,
  quality: number | null,
  point: number,
): Promise<PeriodStats[]> {
  const key = `${quality ?? "null"}:${point}`;
  const cached = cache.get(key);

  if (cached) {
    return cached;
  }

  const now = Date.now();
  const periods: PeriodStats[] = [];

  for (const days of ALERT_PERIODS) {
    const stats = await saleStats(
      itemId,
      new Date(now - days * DAY_MS),
      quality,
      point,
    );

    periods.push({ days, ...stats });
  }

  cache.set(key, periods);

  return periods;
}

// Дата из строки API; пустая/некорректная — null.
function lotDate(value: string): Date | null {
  const time = new Date(value).getTime();

  return Number.isFinite(time) ? new Date(time) : null;
}

// Ключ лота для дедупа. У лота нет id, поэтому собираем его из полей:
// если продавец поменяет цену или срок — это уже другой лот, пришлём снова.
function lotKeyOf(itemId: string, lot: AuctionLot): string {
  return [
    itemId,
    lot.additional?.qlt ?? -1,
    lot.additional?.ptn ?? 0,
    lot.buyoutPrice,
    lot.amount,
    lot.startTime,
    lot.endTime,
  ].join("|");
}
