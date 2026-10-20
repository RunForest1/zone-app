import type { AlertChat } from "@prisma/client";
import type { Bot, Context } from "grammy";
import { upsertAlertChat, type AlertChatPatch } from "@/lib/db/alerts";
import { setFavorite } from "@/lib/db/sales";
import { formatPrice } from "@/lib/format";
import {
  categoryLabel,
  itemName,
  RANK_OPTIONS,
  rankLabel,
  rankValue,
  TOP_CATEGORY_OPTIONS,
  topCategoryValue,
} from "@/lib/items/catalog";
import { itemsDatabase } from "@/lib/items/store";
import { isAllowedUser } from "./auth";

// Команды бота: /start и /chatid — без ограничений, остальные (меняют
// настройки) — только для отправителей из ALERT_ADMIN_USER_IDS.

const USAGE = [
  "Как менять фильтры:",
  "/menu — настройки кнопками",
  "/filter minprofit 60000 — порог прибыли в валюте",
  "/filter margin 15 — порог маржи в % (margin off — выключить)",
  "/filter categories Оружие,Броня — разделы (categories все — сброс)",
  "/filter ranks Легенда,Мастер — ранги (ranks все — сброс)",
  "/filter qlt 2-5 — качество 0–5, можно диапазон (qlt все — сброс)",
  "/filter ptn 0-15 — точка 0–15, можно диапазон (ptn все — сброс)",
  "/status — текущие настройки",
  "/track <id> и /untrack <id> — избранное (id — из ссылки на предмет)",
  "/pause и /resume — пауза и возобновление",
].join("\n");

// chat.id текущего чата строкой (в схеме telegramChatId — String).
function chatIdOf(ctx: Context): string | null {
  return ctx.chat ? String(ctx.chat.id) : null;
}

// Проверяет права и, если их нет, отвечает отказом. true — можно продолжать.
async function ensureAllowed(ctx: Context): Promise<boolean> {
  if (isAllowedUser(ctx)) {
    return true;
  }

  await ctx.reply(
    "Эта команда доступна только пользователям из ALERT_ADMIN_USER_IDS.",
  );

  return false;
}

// /track <id> и /untrack <id>: добавление/снятие избранного по id предмета
// (id виден в ссылке на предмет на сайте).
async function toggleTracked(ctx: Context, favorite: boolean): Promise<void> {
  if (!(await ensureAllowed(ctx))) {
    return;
  }

  const match = typeof ctx.match === "string" ? ctx.match : "";
  const itemId = match.trim().split(/\s+/)[0] ?? "";
  const item = itemId ? itemsDatabase.get(itemId) : undefined;

  if (!item) {
    await ctx.reply(
      `Не знаю такой предмет. Формат: /${favorite ? "track" : "untrack"} <id> (id — из ссылки на предмет)`,
    );
    return;
  }

  await setFavorite(itemId, favorite);

  await ctx.reply(
    favorite
      ? `⭐ «${itemName(item)}» в избранном`
      : `«${itemName(item)}» убран из избранного`,
  );
}

// Текущие настройки чата в виде текста (HTML-разметка).
export function settingsText(chat: AlertChat): string {
  const margin = chat.minMargin === null ? "выключена" : `${chat.minMargin}%`;
  const categories =
    chat.categories.length > 0
      ? chat.categories.map(categoryLabel).join(", ")
      : "все";
  const ranks =
    chat.ranks.length > 0 ? chat.ranks.map(rankLabel).join(", ") : "все";
  const quality = formatRange(chat.qualities, 5);
  const point = formatRange(chat.points, 15);
  const state = chat.active ? "включены" : "на паузе";

  return [
    `Состояние: <b>${state}</b>`,
    `Порог прибыли: <b>${formatPrice(Number(chat.minProfit))}</b>`,
    `Порог маржи: <b>${margin}</b>`,
    `Категории: ${categories}`,
    `Ранги: ${ranks}`,
    `Качество: ${quality}`,
    `Точка: ${point}`,
  ].join("\n");
}

// Разбирает «2-5», «2,3,4,5» или «3» в набор чисел (с проверкой границы).
function parseRange(value: string, max: number): number[] | null {
  const result = new Set<number>();

  for (const part of value.split(",")) {
    const piece = part.trim();

    if (piece === "") {
      continue;
    }

    const range = /^(\d+)-(\d+)$/.exec(piece);

    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);

      if (from > to || to > max) {
        return null;
      }

      for (let number = from; number <= to; number += 1) {
        result.add(number);
      }

      continue;
    }

    if (!/^\d+$/.test(piece) || Number(piece) > max) {
      return null;
    }

    result.add(Number(piece));
  }

  if (result.size === 0) {
    return null;
  }

  return [...result].sort((a, b) => a - b);
}

// Сжимает набор в компактную запись: [0,1,2,5] → «0–2, 5».
function compactRange(values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];

    if (current !== undefined && current === previous + 1) {
      previous = current;
      continue;
    }

    parts.push(start === previous ? String(start) : `${start}–${previous}`);

    if (current === undefined) {
      break;
    }

    start = current;
    previous = current;
  }

  return parts.join(", ");
}

// Отображение набора-фильтра: пустой = «все».
function formatRange(values: number[], max: number): string {
  return values.length === 0 ? `все (0–${max})` : compactRange(values);
}

// Список через запятую → массив непустых элементов.
function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

// «все» / «all» — сброс фильтра.
function isAll(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return normalized === "все" || normalized === "all";
}

function topLabels(): string {
  return TOP_CATEGORY_OPTIONS.map((option) => option.label).join(", ");
}

function rankLabels(): string {
  return RANK_OPTIONS.filter((option) => option.value !== "")
    .map((option) => option.label)
    .join(", ");
}

// Разбирает /filter <поле> <значение> в патч настроек.
// Возвращает либо патч, либо текст ошибки с подсказкой.
export function filterPatch(
  field: string,
  value: string,
): { patch: AlertChatPatch } | { error: string } {
  if (field === "minprofit") {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
      return {
        error: "Порог прибыли — число, например: /filter minprofit 60000",
      };
    }

    return { patch: { minProfit: BigInt(Math.round(amount)) } };
  }

  if (field === "margin") {
    if (value === "off") {
      return { patch: { minMargin: null } };
    }

    const percent = Number(value);

    if (!Number.isFinite(percent) || percent < 0) {
      return {
        error: "Порог маржи — процент или off, например: /filter margin 15",
      };
    }

    return { patch: { minMargin: percent } };
  }

  if (field === "categories") {
    if (value === "") {
      return {
        error: "Укажите разделы: /filter categories Оружие,Броня (или все)",
      };
    }

    if (isAll(value)) {
      return { patch: { categories: [] } };
    }

    const values: string[] = [];

    for (const label of splitList(value)) {
      const resolved = topCategoryValue(label);

      if (!resolved) {
        return { error: `Не знаю раздел «${label}». Доступно: ${topLabels()}` };
      }

      values.push(resolved);
    }

    return { patch: { categories: values } };
  }

  if (field === "ranks") {
    if (value === "") {
      return { error: "Укажите ранги: /filter ranks Легенда,Мастер (или все)" };
    }

    if (isAll(value)) {
      return { patch: { ranks: [] } };
    }

    const values: string[] = [];

    for (const label of splitList(value)) {
      const resolved = rankValue(label);

      if (!resolved) {
        return { error: `Не знаю ранг «${label}». Доступно: ${rankLabels()}` };
      }

      values.push(resolved);
    }

    return { patch: { ranks: values } };
  }

  if (field === "qlt") {
    if (isAll(value)) {
      return { patch: { qualities: [] } };
    }

    const values = parseRange(value, 5);

    if (!values) {
      return {
        error: "Качество — 0–5 или диапазон, например: /filter qlt 2-5",
      };
    }

    return { patch: { qualities: values } };
  }

  if (field === "ptn") {
    if (isAll(value)) {
      return { patch: { points: [] } };
    }

    const values = parseRange(value, 15);

    if (!values) {
      return { error: "Точка — 0–15 или диапазон, например: /filter ptn 0-15" };
    }

    return { patch: { points: values } };
  }

  return { error: USAGE };
}

export function registerCommands(bot: Bot): void {
  bot.command("start", async (ctx) => {
    const chatId = chatIdOf(ctx);

    if (!chatId) {
      return;
    }

    const chat = await upsertAlertChat(chatId, {
      title: ctx.chat?.title ?? null,
    });

    await ctx.reply(`Готово, слежу за сделками.\n\n${settingsText(chat)}`, {
      parse_mode: "HTML",
    });
  });

  bot.command("chatid", async (ctx) => {
    const chatId = chatIdOf(ctx);

    if (chatId) {
      await ctx.reply(`chat.id: ${chatId}`);
    }
  });

  bot.command("filter", async (ctx) => {
    if (!(await ensureAllowed(ctx))) {
      return;
    }

    const chatId = chatIdOf(ctx);

    if (!chatId) {
      return;
    }

    const [field, ...rest] = (ctx.match ?? "").trim().split(/\s+/);
    const result = filterPatch(field ?? "", rest.join(" ").trim());

    if ("error" in result) {
      await ctx.reply(result.error);
      return;
    }

    const chat = await upsertAlertChat(chatId, result.patch);

    await ctx.reply(`Обновил настройки.\n\n${settingsText(chat)}`, {
      parse_mode: "HTML",
    });
  });

  bot.command("track", async (ctx) => {
    await toggleTracked(ctx, true);
  });

  bot.command("untrack", async (ctx) => {
    await toggleTracked(ctx, false);
  });

  bot.command("pause", async (ctx) => {
    if (!(await ensureAllowed(ctx))) {
      return;
    }

    const chatId = chatIdOf(ctx);

    if (!chatId) {
      return;
    }

    const chat = await upsertAlertChat(chatId, { active: false });

    await ctx.reply(`Уведомления на паузе.\n\n${settingsText(chat)}`, {
      parse_mode: "HTML",
    });
  });

  bot.command("resume", async (ctx) => {
    if (!(await ensureAllowed(ctx))) {
      return;
    }

    const chatId = chatIdOf(ctx);

    if (!chatId) {
      return;
    }

    const chat = await upsertAlertChat(chatId, { active: true });

    await ctx.reply(`Уведомления возобновлены.\n\n${settingsText(chat)}`, {
      parse_mode: "HTML",
    });
  });
}
