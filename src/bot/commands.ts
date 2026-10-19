import type { AlertChat } from "@prisma/client";
import type { Bot, Context } from "grammy";
import { upsertAlertChat, type AlertChatPatch } from "@/lib/db/alerts";
import { formatPrice } from "@/lib/format";
import {
  categoryLabel,
  RANK_OPTIONS,
  rankLabel,
  rankValue,
  TOP_CATEGORY_OPTIONS,
  topCategoryValue,
} from "@/lib/items/catalog";
import { isAllowedUser } from "./auth";

// Команды бота: /start и /chatid — без ограничений, остальные (меняют
// настройки) — только для отправителей из ALERT_ADMIN_USER_IDS.

const USAGE = [
  "Как менять фильтры:",
  "/filter minprofit 60000 — порог прибыли в валюте",
  "/filter margin 15 — порог маржи в % (margin off — выключить)",
  "/filter categories Оружие,Броня — разделы (categories все — сброс)",
  "/filter ranks Легенда,Мастер — ранги (ranks все — сброс)",
  "/status — текущие настройки",
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

// Текущие настройки чата в виде текста (HTML-разметка).
export function settingsText(chat: AlertChat): string {
  const margin = chat.minMargin === null ? "выключена" : `${chat.minMargin}%`;
  const categories =
    chat.categories.length > 0
      ? chat.categories.map(categoryLabel).join(", ")
      : "все";
  const ranks =
    chat.ranks.length > 0 ? chat.ranks.map(rankLabel).join(", ") : "все";
  const state = chat.active ? "включены" : "на паузе";

  return [
    `Состояние: <b>${state}</b>`,
    `Порог прибыли: <b>${formatPrice(Number(chat.minProfit))}</b>`,
    `Порог маржи: <b>${margin}</b>`,
    `Категории: ${categories}`,
    `Ранги: ${ranks}`,
  ].join("\n");
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

  bot.command("status", async (ctx) => {
    if (!(await ensureAllowed(ctx))) {
      return;
    }

    const chatId = chatIdOf(ctx);

    if (!chatId) {
      return;
    }

    const chat = await upsertAlertChat(chatId);

    await ctx.reply(settingsText(chat), { parse_mode: "HTML" });
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
