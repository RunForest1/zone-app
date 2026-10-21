import type { PeriodStats } from "@/lib/alerts/profit";
import { qualityLabel } from "@/lib/auction/quality";
import { formatDateTime, formatPrice } from "@/lib/format";
import { rankLabel } from "@/lib/items/catalog";

// Данные для сообщения о выгодном лоте.
export interface AlertMessage {
  itemId: string;
  name: string;
  // Ранг предмета (значение из RANK_OPTIONS).
  rank: string;
  // Цена лота (выкуп) — за сколько можно купить сейчас.
  lotPrice: number;
  // Начало и окончание лота (ISO-строки, показываем по Москве).
  lotStart: string | null;
  lotEnd: string | null;
  // Цена последней совершённой сделки по тому же качеству/точке.
  lastPrice: number | null;
  // Прибыль нетто (после комиссии) и маржа от средней.
  profit: number;
  margin: number | null;
  quality: number | null;
  point: number | null;
  // Рынок за периоды (7/14/30 дней).
  periods: PeriodStats[];
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

// Текст уведомления: цена лота, последняя сделка, прибыль/маржа, признаки
// и рынок за 7/14/30 дней.
export function formatAlertMessage(lot: AlertMessage, domain: string): string {
  const lines = [
    "🔥 <b>Выгодный лот</b>",
    "",
    `<a href="${domain}/items/${lot.itemId}">${escapeHtml(lot.name)}</a>`,
    `Ранг: ${rankLabel(lot.rank)}`,
    `Цена лота (выкуп): <b>${formatPrice(lot.lotPrice)}</b>`,
  ];

  if (lot.lotStart !== null) {
    lines.push(`Начало лота: ${formatDateTime(lot.lotStart)}`);
  }

  if (lot.lotEnd !== null) {
    lines.push(`Окончание лота: ${formatDateTime(lot.lotEnd)}`);
  }

  if (lot.lastPrice !== null) {
    lines.push(`Последняя сделка: ${formatPrice(lot.lastPrice)}`);
  }

  lines.push(
    `Прибыль (после 5%): <b>${formatPrice(lot.profit)}</b> (${marginText(lot.margin)})`,
  );

  if (lot.quality !== null) {
    lines.push(`Качество: ${qualityLabel(lot.quality)} (${lot.quality})`);
  }

  if (lot.point !== null) {
    lines.push(`Точка: ${lot.point}`);
  }

  if (lot.periods.length > 0) {
    lines.push("", `Рынок · ${sliceLabel(lot.quality, lot.point)}`);

    for (const period of lot.periods) {
      lines.push(`${period.days} дней: ${periodText(period)}`);
    }
  }

  return lines.join("\n");
}
