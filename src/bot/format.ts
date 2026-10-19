import type { PeriodStats } from "@/lib/alerts/profit";
import { qualityLabel } from "@/lib/auction/quality";
import { formatDateTime, formatPrice } from "@/lib/format";
import { rankLabel } from "@/lib/items/catalog";

// Данные для сообщения о выгодной сделке.
export interface AlertMessage {
  itemId: string;
  name: string;
  // Ранг предмета (значение из RANK_OPTIONS).
  rank: string;
  // Цена этой сделки.
  price: number;
  // Цена последней совершённой сделки по тому же качеству/точке.
  lastPrice: number | null;
  // Прибыль нетто (после комиссии) и маржа от средней.
  profit: number;
  margin: number | null;
  quality: number | null;
  point: number | null;
  // Рынок за периоды (7/14/30 дней).
  periods: PeriodStats[];
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

function money(value: number | null): string {
  return value === null ? "—" : formatPrice(value);
}

// Подпись среза: «Редкий (3), точка 10» или «без качества, точка 0».
function sliceLabel(quality: number | null, point: number | null): string {
  const qualityText =
    quality === null ? "без качества" : `${qualityLabel(quality)} (${quality})`;

  return `${qualityText}, точка ${point ?? 0}`;
}

// Строка одного периода: «средняя … · медиана … · сделок N».
function periodText(period: PeriodStats): string {
  return [
    `средняя ${money(period.average)}`,
    `медиана ${money(period.median)}`,
    `сделок ${period.deals}`,
  ].join(" · ");
}

// Текст уведомления: цена сделки, последняя сделка, прибыль/маржа, признаки
// и рынок за 7/14/30 дней.
export function formatAlertMessage(deal: AlertMessage, domain: string): string {
  const lines = [
    "🔥 <b>Выгодная сделка</b>",
    "",
    `<a href="${domain}/items/${deal.itemId}">${escapeHtml(deal.name)}</a>`,
    `Ранг: ${rankLabel(deal.rank)}`,
    `Цена сделки: <b>${formatPrice(deal.price)}</b>`,
  ];

  if (deal.lastPrice !== null) {
    lines.push(`Последняя сделка: ${formatPrice(deal.lastPrice)}`);
  }

  lines.push(
    `Прибыль (после 5%): <b>${formatPrice(deal.profit)}</b> (${marginText(deal.margin)})`,
  );

  if (deal.quality !== null) {
    lines.push(`Качество: ${qualityLabel(deal.quality)} (${deal.quality})`);
  }

  if (deal.point !== null) {
    lines.push(`Точка: ${deal.point}`);
  }

  if (deal.periods.length > 0) {
    lines.push("", `Рынок · ${sliceLabel(deal.quality, deal.point)}`);

    for (const period of deal.periods) {
      lines.push(`${period.days} дней: ${periodText(period)}`);
    }
  }

  lines.push("", formatDateTime(deal.time));

  return lines.join("\n");
}
