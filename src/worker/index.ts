import {
  BACKFILL_DAYS as DEFAULT_BACKFILL_DAYS,
  BACKFILL_PAGES,
  INCREMENT_PAGES,
  getSzApi,
} from "@/lib/auction";
import { prisma } from "@/lib/db";
import { latestSaleTime, saveSales } from "@/lib/db/sales";

// Период обхода отслеживаемых предметов и глубина разового backfill.
// Дописывание новых сделок — каждый прогон; backfill — один раз на предмет.
const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 5 * 60 * 1000);
const BACKFILL_DAYS = Number(
  process.env.WORKER_BACKFILL_DAYS ?? DEFAULT_BACKFILL_DAYS,
);
// Сколько дней сделок храним (нужно максимум 30 + запас).
const RETENTION_DAYS = Number(process.env.WORKER_RETENTION_DAYS ?? 35);
const DAY_MS = 24 * 60 * 60 * 1000;
const SHUTDOWN_POLL_MS = 200;

// Флаг завершения (по SIGTERM/SIGINT).
let stopping = false;

function log(message: string) {
  console.log(`[worker ${new Date().toISOString()}] ${message}`);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Один предмет: backfill при первом появлении, дальше — только новые сделки.
async function syncItem(itemId: string): Promise<number> {
  const api = getSzApi();

  if (!api) {
    throw new Error("нет кредов API (CLIENT_ID / CLIENT_SECRET)");
  }

  const state = await prisma.itemSync.findUnique({ where: { itemId } });
  const isBackfill = !state?.backfilledAt;
  const lastSale = await latestSaleTime(itemId);
  // Первый прогон — история за BACKFILL_DAYS дней; дальше дописываем только
  // новое (начиная с последней сохранённой сделки).
  const since = isBackfill
    ? Date.now() - BACKFILL_DAYS * DAY_MS
    : (lastSale?.getTime() ?? Date.now() - BACKFILL_DAYS * DAY_MS);
  const maxPages = isBackfill ? BACKFILL_PAGES : INCREMENT_PAGES;

  const entry = await prisma.syncLog.create({
    data: { itemId, status: "running" },
  });

  try {
    const { points, complete } = await api.getHistorySince(
      itemId,
      since,
      maxPages,
    );
    const added = await saveSales(itemId, points);
    const newest =
      points.length > 0 ? new Date(points[points.length - 1].time) : lastSale;

    if (!complete) {
      log(`${itemId}: упёрлись в лимит страниц — доберём на следующем прогоне`);
    }

    await prisma.itemSync.upsert({
      where: { itemId },
      create: {
        itemId,
        backfilledAt: complete ? new Date() : null,
        lastSyncedAt: new Date(),
        lastSaleTime: complete ? (newest ?? undefined) : undefined,
      },
      update: {
        // Пометку о собранном периоде ставим, только если дошли до конца,
        // иначе повторим backfill на следующем прогоне.
        backfilledAt: complete
          ? (state?.backfilledAt ?? new Date())
          : (state?.backfilledAt ?? null),
        lastSyncedAt: new Date(),
        lastSaleTime: complete
          ? (newest ?? undefined)
          : (lastSale ?? undefined),
        lastError: null,
      },
    });

    await prisma.syncLog.update({
      where: { id: entry.id },
      data: {
        status: "ok",
        added,
        finishedAt: new Date(),
        message: isBackfill ? "backfill" : null,
      },
    });

    log(`${itemId}: +${added} сделок${isBackfill ? " (backfill)" : ""}`);

    return added;
  } catch (error) {
    const message = errorText(error);

    await prisma.itemSync
      .upsert({
        where: { itemId },
        create: { itemId, lastError: message },
        update: { lastError: message },
      })
      .catch(() => undefined);

    await prisma.syncLog
      .update({
        where: { id: entry.id },
        data: { status: "error", finishedAt: new Date(), message },
      })
      .catch(() => undefined);

    log(`${itemId}: ошибка — ${message}`);

    return 0;
  }
}

// Один прогон по всем отслеживаемым предметам.
async function cycle() {
  const items = await prisma.trackedItem.findMany({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  log(`прогон: предметов ${items.length}`);

  for (const item of items) {
    if (stopping) {
      break;
    }

    await syncItem(item.id);
  }

  await cleanup();
}

// Чистит старое: странице нужны максимум 30 дней истории, поэтому удаляем
// сделки (и записи журнала) старше RETENTION_DAYS.
async function cleanup() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS);
  const sales = await prisma.sale.deleteMany({
    where: { time: { lt: cutoff } },
  });
  const logs = await prisma.syncLog.deleteMany({
    where: { startedAt: { lt: cutoff } },
  });

  if (sales.count > 0 || logs.count > 0) {
    log(
      `удалено старше ${RETENTION_DAYS} дн: сделок ${sales.count}, записей лога ${logs.count}`,
    );
  }
}

// Ожидание сигнала завершения.
function untilStopped(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (stopping) {
        clearInterval(timer);
        resolve();
      }
    }, SHUTDOWN_POLL_MS);
  });
}

async function main() {
  process.on("SIGTERM", () => {
    stopping = true;
    log("получен SIGTERM — завершаемся после текущего предмета");
  });
  process.on("SIGINT", () => {
    stopping = true;
    log("получен SIGINT — завершаемся после текущего предмета");
  });

  log(`запуск: интервал ${INTERVAL_MS} мс, backfill ${BACKFILL_DAYS} дн`);

  let timer: ReturnType<typeof setInterval> | undefined;

  const run = async () => {
    try {
      await cycle();
    } catch (error) {
      log(`прогон не удался: ${errorText(error)}`);
    }
  };

  await run();
  timer = setInterval(() => void run(), INTERVAL_MS);

  await untilStopped();

  clearInterval(timer);
  await prisma.$disconnect();
  log("остановлен");
}

main().catch(async (error) => {
  console.error("[worker] фатальная ошибка:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
