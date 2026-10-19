import { getSzApi, type PricePoint } from "@/lib/auction";
import { PERIODS } from "@/lib/auction/period";
import { listActiveAlertChats, markAlertSent } from "@/lib/db/alerts";
import { saleKeyOf, saleStats } from "@/lib/db/sales";
import { itemsDatabase } from "@/lib/items/store";
import { detectAlerts } from "./detect";

const DAY_MS = 24 * 60 * 60 * 1000;
// Период для средней/медианы — как период по умолчанию на сайте.
const STATS_DAYS = PERIODS[0];

// Ставит в очередь уведомления о новых сделках предмета (для процесса bot).
// Воркер вызывает это после сохранения новых сделок; в Telegram ничего не шлём —
// только пишем события в AlertEvent. Возвращает число поставленных в очередь.
export async function checkAlerts(
  itemId: string,
  sales: PricePoint[],
): Promise<number> {
  if (sales.length === 0) {
    return 0;
  }

  // Нет активных чатов — не дёргаем API за лотами.
  const chats = await listActiveAlertChats();

  if (chats.length === 0) {
    return 0;
  }

  const item = itemsDatabase.items[itemId];

  if (!item) {
    return 0;
  }

  const api = getSzApi();

  if (!api) {
    return 0;
  }

  // Прибыль считаем относительно текущих активных лотов (один запрос на предмет).
  const lots = await api.getLots(itemId);
  // Сводка по рынку — одна на предмет (контекст к каждой сделке).
  const stats = await saleStats(
    itemId,
    new Date(Date.now() - STATS_DAYS * DAY_MS),
  );
  let queued = 0;

  for (const sale of sales) {
    const matches = detectAlerts(
      { price: sale.price, category: item.category, rank: item.color, lots },
      chats,
    );

    for (const match of matches) {
      // markAlertSent сам отсекает дубли по (alertChatId, saleKey).
      const created = await markAlertSent({
        alertChatId: match.chat.id,
        itemId,
        saleKey: saleKeyOf(itemId, sale),
        profit: match.profit,
        margin: match.margin,
        average: stats.average === null ? null : BigInt(stats.average),
        median: stats.median === null ? null : BigInt(stats.median),
        deals: stats.deals,
      });

      if (created) {
        queued += 1;
      }
    }
  }

  return queued;
}
