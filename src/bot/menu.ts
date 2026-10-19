import type { AlertChat } from "@prisma/client";
import { InlineKeyboard, type Bot, type Context } from "grammy";
import { qualityLabel } from "@/lib/auction/quality";
import { upsertAlertChat, type AlertChatPatch } from "@/lib/db/alerts";
import { RANK_OPTIONS, TOP_CATEGORY_OPTIONS } from "@/lib/items/catalog";
import { isAllowedUser } from "./auth";
import { settingsText } from "./commands";

// Настройки кнопками: сообщение с текущими фильтрами и инлайн-клавиатурой.
// Значения callback_data: "act:<toggle|refresh>", "f:<mp|mm|q|p|c|r>:<значение>".

const PROFITS: Array<{ label: string; value: bigint }> = [
  { label: "50 тыс", value: BigInt(50_000) },
  { label: "100 тыс", value: BigInt(100_000) },
  { label: "300 тыс", value: BigInt(300_000) },
  { label: "1 млн", value: BigInt(1_000_000) },
];

const MARGINS: Array<{ label: string; value: number | null }> = [
  { label: "выкл", value: null },
  { label: "10%", value: 10 },
  { label: "20%", value: 20 },
  { label: "30%", value: 30 },
];

function chatIdOf(ctx: Context): string | null {
  return ctx.chat ? String(ctx.chat.id) : null;
}

// Обратить элемент списка (для переключателей разделов и рангов).
function toggled(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

// Обратить число в наборе (для переключателей качества и точки).
function toggledNumber(list: number[], value: number): number[] {
  const next = list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];

  return next.sort((a, b) => a - b);
}

// Чистое применение нажатия кнопки к настройкам чата.
// Возвращает патч (или null, если нажатие ничего не меняет — «Обновить»).
export function menuPatch(
  chat: AlertChat,
  data: string,
): AlertChatPatch | null {
  const [scope, key, value] = data.split(":");

  if (scope === "act") {
    return key === "toggle" ? { active: !chat.active } : null;
  }

  if (scope !== "f") {
    return null;
  }

  if (key === "mp") {
    return { minProfit: BigInt(value) };
  }

  if (key === "mm") {
    return { minMargin: value === "off" ? null : Number(value) };
  }

  if (key === "q") {
    return value === "all"
      ? { qualities: [] }
      : { qualities: toggledNumber(chat.qualities, Number(value)) };
  }

  if (key === "p") {
    return value === "all"
      ? { points: [] }
      : { points: toggledNumber(chat.points, Number(value)) };
  }

  if (key === "c") {
    return { categories: toggled(chat.categories, value) };
  }

  if (key === "r") {
    return { ranks: toggled(chat.ranks, value) };
  }

  return null;
}

// Текст панели настроек.
export function menuText(chat: AlertChat): string {
  return `⚙️ <b>Настройки уведомлений</b>\n\n${settingsText(chat)}`;
}

// Добавляет кнопки рядами по perRow и завершает ряд.
function addOptions(
  keyboard: InlineKeyboard,
  buttons: Array<[string, string]>,
  perRow: number,
): void {
  buttons.forEach(([label, data], index) => {
    keyboard.text(label, data);

    if ((index + 1) % perRow === 0) {
      keyboard.row();
    }
  });
  keyboard.row();
}

// Инлайн-клавиатура настроек (✅ отмечает выбранное).
export function menuKeyboard(chat: AlertChat): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  keyboard.text(chat.active ? "⏸ Пауза" : "▶️ Возобновить", "act:toggle").row();

  keyboard.text("Порог прибыли", "noop").row();
  addOptions(
    keyboard,
    PROFITS.map((option): [string, string] => [
      `${chat.minProfit === option.value ? "✅ " : ""}${option.label}`,
      `f:mp:${option.value}`,
    ]),
    4,
  );

  keyboard.text("Порог маржи", "noop").row();
  addOptions(
    keyboard,
    MARGINS.map((option): [string, string] => [
      `${chat.minMargin === option.value ? "✅ " : ""}${option.label}`,
      `f:mm:${option.value === null ? "off" : option.value}`,
    ]),
    4,
  );

  keyboard.text("Качество (пусто = 0–5)", "noop").row();
  addOptions(
    keyboard,
    [
      [`${chat.qualities.length === 0 ? "✅ " : ""}все`, "f:q:all"],
      ...[0, 1, 2, 3, 4, 5].map((value): [string, string] => [
        `${chat.qualities.includes(value) ? "✅ " : ""}${qualityLabel(value)} ${value}`,
        `f:q:${value}`,
      ]),
    ],
    4,
  );

  keyboard.text("Точка (пусто = 0–15)", "noop").row();
  addOptions(
    keyboard,
    [
      [`${chat.points.length === 0 ? "✅ " : ""}все`, "f:p:all"],
      ...Array.from({ length: 16 }, (_, value): [string, string] => [
        `${chat.points.includes(value) ? "✅ " : ""}${value}`,
        `f:p:${value}`,
      ]),
    ],
    6,
  );

  keyboard.text("Разделы (нажми, чтобы вкл/выкл)", "noop").row();
  addOptions(
    keyboard,
    TOP_CATEGORY_OPTIONS.map((option): [string, string] => [
      `${chat.categories.includes(option.value) ? "✅ " : ""}${option.label}`,
      `f:c:${option.value}`,
    ]),
    2,
  );

  keyboard.text("Ранги (нажми, чтобы вкл/выкл)", "noop").row();
  addOptions(
    keyboard,
    RANK_OPTIONS.filter((option) => option.value !== "").map(
      (option): [string, string] => [
        `${chat.ranks.includes(option.value) ? "✅ " : ""}${option.label}`,
        `f:r:${option.value}`,
      ],
    ),
    3,
  );

  keyboard.text("🔄 Обновить", "act:refresh");

  return keyboard;
}

export function registerMenu(bot: Bot): void {
  bot.command(["menu", "status"], async (ctx) => {
    if (!(await allowed(ctx))) {
      return;
    }

    const chatId = chatIdOf(ctx);

    if (!chatId) {
      return;
    }

    const chat = await upsertAlertChat(chatId);

    await ctx.reply(menuText(chat), {
      parse_mode: "HTML",
      reply_markup: menuKeyboard(chat),
    });
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data === "noop") {
      await ctx.answerCallbackQuery();
      return;
    }

    if (!(await allowed(ctx))) {
      return;
    }

    const chatId = chatIdOf(ctx);

    if (!chatId) {
      await ctx.answerCallbackQuery();
      return;
    }

    const current = await upsertAlertChat(chatId);
    const patch = menuPatch(current, data);
    const chat = patch ? await upsertAlertChat(chatId, patch) : current;

    await ctx.answerCallbackQuery();

    // Перерисовываем сообщение. «Message is not modified» — не ошибка.
    await ctx
      .editMessageText(menuText(chat), {
        parse_mode: "HTML",
        reply_markup: menuKeyboard(chat),
      })
      .catch(() => undefined);
  });
}

// Проверяет права; при отказе отвечает во всплывающем уведомлении.
async function allowed(ctx: Context): Promise<boolean> {
  if (isAllowedUser(ctx)) {
    return true;
  }

  if (ctx.callbackQuery) {
    await ctx
      .answerCallbackQuery({
        text: "Менять настройки могут только админы (ALERT_ADMIN_USER_IDS)",
        show_alert: true,
      })
      .catch(() => undefined);
  } else {
    await ctx.reply(
      "Эта команда доступна только админам (ALERT_ADMIN_USER_IDS).",
    );
  }

  return false;
}
