import { scanLots } from "@/lib/alerts";
import { prisma } from "@/lib/db";
import { syncItem } from "@/lib/sync";

// Цикл синхронизации истории избранных предметов. Избранных мало — ходим часто.
const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 2 * 60 * 1000);
// Цикл скана активных лотов — независимый, по умолчанию реже (раз в 30 минут).
const LOT_SCAN_INTERVAL_MS = Number(
  process.env.LOT_SCAN_INTERVAL_MS ?? 30 * 60 * 1000,
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

// Избранные предметы (по ним работают оба цикла).
async function favoriteIds(): Promise<string[]> {
  const items = await prisma.trackedItem.findMany({
    where: { favorite: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  return items.map((item) => item.id);
}

// Прогон синхронизации истории.
async function syncCycle() {
  const ids = await favoriteIds();

  log(`синк истории: избранных ${ids.length}`);

  for (const id of ids) {
    if (stopping) {
      break;
    }

    await syncItem(id, log);
  }

  await cleanup();
}

// Прогон скана активных лотов («сначала обновление, потом анализ»: лоты тянем
// внутри scanLots, а считаем уже по полученным данным).
async function lotCycle() {
  const ids = await favoriteIds();

  log(`скан лотов: избранных ${ids.length}`);

  let queued = 0;

  for (const id of ids) {
    if (stopping) {
      break;
    }

    // Ошибка по предмету не должна ронять весь цикл.
    try {
      queued += await scanLots(id);
    } catch (error) {
      log(`${id}: скан лотов не удался — ${errorText(error)}`);
    }
  }

  if (queued > 0) {
    log(`уведомлений в очередь: ${queued}`);
  }
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

  log(`запуск: синк ${INTERVAL_MS} мс, скан лотов ${LOT_SCAN_INTERVAL_MS} мс`);

  const runSync = async () => {
    try {
      await syncCycle();
    } catch (error) {
      log(`синк не удался: ${errorText(error)}`);
    }
  };

  const runLots = async () => {
    try {
      await lotCycle();
    } catch (error) {
      log(`скан лотов не удался: ${errorText(error)}`);
    }
  };

  const syncTimer = setInterval(() => void runSync(), INTERVAL_MS);
  const lotTimer = setInterval(() => void runLots(), LOT_SCAN_INTERVAL_MS);

  await runSync();
  await runLots();

  await untilStopped();

  clearInterval(syncTimer);
  clearInterval(lotTimer);
  await prisma.$disconnect();
  log("остановлен");
}

main().catch(async (error) => {
  console.error("[worker] фатальная ошибка:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
