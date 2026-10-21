import type { AlertChat } from "@prisma/client";
import type { FlipEstimate } from "./profit";

// Оценка лота против фильтров чатов. Чистая функция: ничего не знает
// ни про Telegram, ни про БД — только решает, кому подходит лот.
// Прибыль/маржу считает вызывающий (estimateFlip), здесь — фильтры и пороги.

// Что нужно знать о лоте для проверки фильтров.
export interface LotInput {
  // Качество лота (у части предметов его нет).
  quality: number | null;
  // Точка лота; отсутствующая считается нулём (как на странице).
  point: number;
  // Категория предмета (полный путь, например "weapon/assault_rifle").
  category: string;
  // Ранг предмета (значение из RANK_OPTIONS, например "RANK_LEGEND").
  rank: string;
}

// Лот, прошедший фильтры конкретного чата.
export interface LotAlert {
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

// Подходит ли лот фильтрам чата (активность, качество, точка, раздел, ранг).
// Пустой список = без ограничения; отсутствующее качество под непустой
// список качеств не подходит.
export function matchFilters(lot: LotInput, chat: AlertChat): boolean {
  if (!chat.active) {
    return false;
  }

  if (
    chat.qualities.length > 0 &&
    (lot.quality === null || !chat.qualities.includes(lot.quality))
  ) {
    return false;
  }

  if (chat.points.length > 0 && !chat.points.includes(lot.point)) {
    return false;
  }

  if (
    chat.categories.length > 0 &&
    !chat.categories.includes(topCategory(lot.category))
  ) {
    return false;
  }

  if (chat.ranks.length > 0 && !chat.ranks.includes(normalizedRank(lot.rank))) {
    return false;
  }

  return true;
}

// Проходит ли оценка пороги чата. Возвращает прибыль (BigInt) или null.
export function matchThreshold(
  chat: AlertChat,
  estimate: FlipEstimate,
): bigint | null {
  if (estimate.profit === null) {
    return null;
  }

  const profit = BigInt(Math.round(estimate.profit));

  if (profit < chat.minProfit) {
    return null;
  }

  if (
    chat.minMargin !== null &&
    (estimate.margin === null || estimate.margin < chat.minMargin)
  ) {
    return null;
  }

  return profit;
}

// Все чаты, которым подходит лот.
export function detectAlerts(
  lot: LotInput,
  chats: AlertChat[],
  estimate: FlipEstimate,
): LotAlert[] {
  const matches: LotAlert[] = [];

  for (const chat of chats) {
    if (!matchFilters(lot, chat)) {
      continue;
    }

    const profit = matchThreshold(chat, estimate);

    if (profit === null) {
      continue;
    }

    matches.push({ chat, profit, margin: estimate.margin });
  }

  return matches;
}
