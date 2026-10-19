import { qualityLabel } from "@/lib/auction/quality";
import { formatDateTime, formatPrice } from "@/lib/format";
import { rankLabel } from "@/lib/items/catalog";

// Данные для сообщения о выгодной сделке.
export interface AlertMessage {
  itemId: string;
  name: string;
  // Ранг предмета (значение из RANK_OPTIONS).
  rank: string;
  // Цена сделки в игровой валюте.
  price: number;
  // Прибыль и маржа, посчитанные воркером.
  profit: number;
  margin: number | null;
  quality: number | null;
  point: number | null;
  // Контекст рынка на момент сделки.
  average: number | null;
  median: number | null;
  deals: number;
  // Время сделки (ISO-строка).
  time: string;
}

// HTML-разметка Telegram: имена предметов могут содержать &, <, поэтому
// их экранируем (с Markdown пришлось бы экранировать куда больше символов).
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function marginText(margin: number | null): string {
  return margin === null ? "—" : `${Math.round(margin)}%`;
}

// Короткий текст уведомления: название-ссылка, ранг, цена, прибыль, маржа
// и (если есть) качество и точка.
export function formatAlertMessage(deal: AlertMessage, domain: string): string {
  const lines = [
    "🔥 <b>Выгодная сделка</b>",
    "",
    `<a href="${domain}/items/${deal.itemId}">${escapeHtml(deal.name)}</a>`,
    `Ранг: ${rankLabel(deal.rank)}`,
    `Цена: <b>${formatPrice(deal.price)}</b>`,
    `Прибыль: <b>${formatPrice(deal.profit)}</b> (${marginText(deal.margin)})`,
  ];

  if (deal.quality !== null) {
    lines.push(`Качество: ${qualityLabel(deal.quality)} (${deal.quality})`);
  }

  if (deal.point !== null) {
    lines.push(`Точка: ${deal.point}`);
  }

  // Контекст рынка за период.
  const market: string[] = [];

  if (deal.average !== null) {
    market.push(`Средняя цена: ${formatPrice(deal.average)}`);
  }

  if (deal.median !== null) {
    market.push(`Медиана: ${formatPrice(deal.median)}`);
  }

  if (deal.deals > 0) {
    market.push(`Сделок: ${deal.deals}`);
  }

  if (market.length > 0) {
    lines.push("", ...market);
  }

  lines.push("", formatDateTime(deal.time));

  return lines.join("\n");
}
