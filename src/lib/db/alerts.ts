import { Prisma } from "@prisma/client";
import type { AlertChat, AlertEvent } from "@prisma/client";
import { prisma } from "./index";

// Читаем/пишем подписки телеграм-бота и лог-очередь его уведомлений.
// Воркер только ставит события в очередь (AlertEvent), процесс bot их отправляет.

// Поля фильтров, которые бот меняет командами /filter, /pause, /resume.
export interface AlertChatPatch {
  title?: string | null;
  minProfit?: bigint;
  minMargin?: number | null;
  categories?: string[];
  ranks?: string[];
  qualities?: number[];
  points?: number[];
  active?: boolean;
}

// Все активные чаты (по ним воркер проверяет новые сделки).
export async function listActiveAlertChats(): Promise<AlertChat[]> {
  return prisma.alertChat.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });
}

// Создаёт чат при первом /start и обновляет его фильтры командами.
export async function upsertAlertChat(
  telegramChatId: string,
  patch: AlertChatPatch = {},
): Promise<AlertChat> {
  return prisma.alertChat.upsert({
    where: { telegramChatId },
    create: { telegramChatId, ...patch },
    update: patch,
  });
}

// Отправлялось ли уже этой чату уведомление по этой сделке.
export async function wasAlertSent(
  alertChatId: string,
  saleKey: string,
): Promise<boolean> {
  const event = await prisma.alertEvent.findUnique({
    where: { alertChatId_saleKey: { alertChatId, saleKey } },
    select: { id: true },
  });

  return event !== null;
}

// Ставит уведомление в очередь (создаёт AlertEvent).
// Дубликат по (alertChatId, saleKey) пропускается — как saveSales по Sale.key.
// Возвращает true, если событие действительно создано.
export async function markAlertSent(input: {
  alertChatId: string;
  itemId: string;
  saleKey: string;
  profit: bigint;
  margin: number | null;
  lastPrice: bigint | null;
  stats: Prisma.InputJsonValue;
}): Promise<boolean> {
  try {
    await prisma.alertEvent.create({ data: input });

    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }

    throw error;
  }
}

// Событие вместе с его чатом (боту нужны фильтры и chat.id).
export type PendingAlertEvent = AlertEvent & { alertChat: AlertChat };

// Свежие неотправленные уведомления активных чатов — очередь процесса bot.
export async function listPendingAlertEvents(
  limit = 50,
): Promise<PendingAlertEvent[]> {
  return prisma.alertEvent.findMany({
    where: { sentAt: null, alertChat: { active: true } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { alertChat: true },
  });
}

// Отмечает событие отправленным. Идемпотентно: повторный вызов ничего не меняет.
export async function markAlertEventSent(id: string): Promise<void> {
  await prisma.alertEvent.updateMany({
    where: { id, sentAt: null },
    data: { sentAt: new Date() },
  });
}
