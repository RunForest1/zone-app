import { Bot } from "grammy";
import { prisma } from "@/lib/db";
import {
  listPendingAlertEvents,
  markAlertEventSent,
  type PendingAlertEvent,
} from "@/lib/db/alerts";
import { saleByKey } from "@/lib/db/sales";
import { itemName } from "@/lib/items/catalog";
import { itemsDatabase } from "@/lib/items/store";
import { registerCommands } from "./commands";
import { formatAlertMessage } from "./format";
import { buildProxyAgent } from "./proxy";

// Процесс bot: принимает команды (long polling) и рассылает уведомления,
// которые воркер поставил в очередь (AlertEvent). В API аукциона не ходит.

// Как часто проверяем очередь неотправленных событий и сколько берём за раз.
const POLL_MS = Number(process.env.BOT_POLL_MS ?? 10000);
const BATCH = 20;

// Тот же домен, что и у сайта (для ссылки на предмет).
const DOMAIN = (process.env.DOMAIN ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("[bot] не задан TELEGRAM_BOT_TOKEN — нечего запускать");
  process.exit(1);
}

// Флаг завершения (по SIGTERM/SIGINT).
let stopping = false;

function log(message: string) {
  console.log(`[bot ${new Date().toISOString()}] ${message}`);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Прокси-агент передаём в grammY: под Bun это Node-сборка на node-fetch,
// поэтому baseFetchConfig.agent учитывается.
const bot = new Bot(token, {
  client: { baseFetchConfig: { agent: buildProxyAgent() } },
});

registerCommands(bot);

bot.catch((err) => {
  log(`ошибка обработчика — ${errorText(err.error)}`);
});

// Отправка одного уведомления.
async function sendAlert(event: PendingAlertEvent): Promise<void> {
  const item = itemsDatabase.items[event.itemId];
  const sale = await saleByKey(event.saleKey);

  // Показывать нечего (предмет или сделка уже удалены) — помечаем
  // отправленным, чтобы не пытаться бесконечно.
  if (!item || !sale) {
    await markAlertEventSent(event.id);
    return;
  }

  const text = formatAlertMessage(
    {
      itemId: event.itemId,
      name: itemName(item),
      rank: item.color,
      price: sale.price,
      profit: Number(event.profit),
      margin: event.margin,
      quality: sale.quality,
      point: sale.point,
      average: event.average === null ? null : Number(event.average),
      median: event.median === null ? null : Number(event.median),
      deals: event.deals,
      time: sale.time,
    },
    DOMAIN,
  );

  await bot.api.sendMessage(event.alertChat.telegramChatId, text, {
    parse_mode: "HTML",
  });
  await markAlertEventSent(event.id);
}

// Один проход по очереди неотправленных уведомлений.
async function poll(): Promise<void> {
  if (stopping) {
    return;
  }

  const events = await listPendingAlertEvents(BATCH);

  for (const event of events) {
    try {
      await sendAlert(event);
    } catch (error) {
      // Не помечаем отправленным — повторим на следующем проходе.
      log(`не удалось отправить ${event.id} — ${errorText(error)}`);
    }
  }
}

async function main() {
  // Проверка связи и токена на старте: при неверном прокси/токене
  // падаем сразу, а не висим молча без уведомлений.
  const me = await bot.api.getMe();
  log(
    `запуск: @${me.username} (id ${me.id}), опрос очереди каждые ${POLL_MS} мс`,
  );

  if (!process.env.ALERT_ADMIN_USER_IDS) {
    log(
      "ALERT_ADMIN_USER_IDS не задан — команды изменения настроек недоступны никому",
    );
  }

  const timer = setInterval(() => {
    void poll().catch((error) => log(`опрос не удался — ${errorText(error)}`));
  }, POLL_MS);

  // Первый проход — сразу, не ждём интервал.
  void poll().catch((error) => log(`опрос не удался — ${errorText(error)}`));

  const shutdown = (signal: string) => {
    if (stopping) {
      return;
    }

    stopping = true;
    log(`получен ${signal} — завершаемся`);
    clearInterval(timer);
    void bot.stop();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Блокирует до остановки (long polling).
  await bot.start({ onStart: () => log("слушаем Telegram (long polling)") });

  await prisma.$disconnect();
  log("остановлен");
}

main().catch(async (error) => {
  console.error("[bot] фатальная ошибка:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
