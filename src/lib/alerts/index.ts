import { Prisma } from "@prisma/client";
import type { PricePoint } from "@/lib/auction";
import { listActiveAlertChats, markAlertSent } from "@/lib/db/alerts";
import { lastSalePrice, saleKeyOf, saleStats } from "@/lib/db/sales";
import { itemsDatabase } from "@/lib/items/store";
import { detectAlerts } from "./detect";
import { ALERT_PERIODS, estimateFlip, type PeriodStats } from "./profit";

// Ставит в очередь уведомления о новых сделках предмета (для процесса bot).
// Прибыль считаем от средней по совершённым сделкам с комиссией площадки.
// В Telegram ничего не шлём — только пишем события в AlertEvent.

const DAY_MS = 24 * 60 * 60 * 1000;

export async function checkAlerts(
  itemId: string,
  sales: PricePoint[],
): Promise<number> {
  if (sales.length === 0) {
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

  let queued = 0;

  for (const sale of sales) {
    // Срез рынка — по собственному качеству и точке сделки (нет точки = 0).
    const quality = sale.additional?.qlt ?? null;
    const point = sale.additional?.ptn ?? 0;
    const saleKey = saleKeyOf(itemId, sale);

    // Рынок за периоды — без учёта самой сделки.
    const periods = await slicePeriods(itemId, quality, point, saleKey);
    const average =
      periods.find((period) => period.days === ALERT_PERIODS[0])?.average ??
      null;
    const estimate = estimateFlip(sale.price, average);

    const matches = detectAlerts(
      { quality, point, category: item.category, rank: item.color },
      chats,
      estimate,
    );

    if (matches.length === 0) {
      continue;
    }

    const lastPrice = await lastSalePrice(itemId, quality, point);

    for (const match of matches) {
      const created = await markAlertSent({
        alertChatId: match.chat.id,
        itemId,
        saleKey,
        profit: match.profit,
        margin: match.margin,
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

// Рынок за 7/14/30 дней по срезу сделки (качество + точка).
async function slicePeriods(
  itemId: string,
  quality: number | null,
  point: number,
  excludeKey: string,
): Promise<PeriodStats[]> {
  const now = Date.now();
  const periods: PeriodStats[] = [];

  for (const days of ALERT_PERIODS) {
    const stats = await saleStats(
      itemId,
      new Date(now - days * DAY_MS),
      quality,
      point,
      excludeKey,
    );

    periods.push({ days, ...stats });
  }

  return periods;
}
