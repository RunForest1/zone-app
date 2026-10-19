import type { AlertChat } from "@prisma/client";
import type { AuctionLot } from "@/lib/auction";
import { estimateProfit } from "@/lib/auction/market";

// Оценка сделки против фильтров чатов. Чистая функция: ничего не знает
// ни про Telegram, ни про БД — только решает, кому подходит сделка.
// Прибыль/маржа считаются той же формулой, что и на странице предмета.

// Что нужно знать о сделке для проверки фильтров.
export interface DealInput {
  // Цена сделки в игровой валюте.
  price: number;
  // Категория предмета (полный путь, например "weapon/assault_rifle").
  category: string;
  // Ранг предмета (значение из RANK_OPTIONS, например "RANK_LEGEND").
  rank: string;
  // Активные лоты предмета — из них берём минимальное предложение.
  lots: AuctionLot[];
}

// Сделка, прошедшая фильтры конкретного чата.
export interface DealAlert {
  chat: AlertChat;
  // Прибыль в игровой валюте (целая, поэтому BigInt — как деньги в схеме).
  profit: bigint;
  // Маржа в процентах, без округления.
  margin: number | null;
}

// Верхний уровень категории: "weapon/assault_rifle" → "weapon".
export function topCategory(category: string): string {
  return category.split("/")[0];
}

// Нормализует ранг предмета: пустой цвет считаем обычным (DEFAULT).
function normalizedRank(rank: string): string {
  return rank || "DEFAULT";
}

// Подходит ли сделка фильтрам чата. Возвращает посчитанные прибыль и маржу
// или null, если сделка не проходит.
export function matchAlert(deal: DealInput, chat: AlertChat): DealAlert | null {
  if (!chat.active) {
    return null;
  }

  const { profit, margin } = estimateProfit(deal.price, deal.lots);

  // Нет активных лотов — оценить прибыль нельзя, не шлём.
  if (profit === null) {
    return null;
  }

  const profitValue = BigInt(Math.round(profit));

  if (profitValue < chat.minProfit) {
    return null;
  }

  if (chat.minMargin !== null && (margin === null || margin < chat.minMargin)) {
    return null;
  }

  // Пустой список = все категории / все ранги.
  if (
    chat.categories.length > 0 &&
    !chat.categories.includes(topCategory(deal.category))
  ) {
    return null;
  }

  if (chat.ranks.length > 0 && !chat.ranks.includes(normalizedRank(deal.rank))) {
    return null;
  }

  return { chat, profit: profitValue, margin };
}

// Все чаты, которым подходит сделка.
export function detectAlerts(deal: DealInput, chats: AlertChat[]): DealAlert[] {
  const matches: DealAlert[] = [];

  for (const chat of chats) {
    const match = matchAlert(deal, chat);

    if (match) {
      matches.push(match);
    }
  }

  return matches;
}
