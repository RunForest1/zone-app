import { prisma } from "@/lib/db";
import { syncItem } from "@/lib/sync";

// Период обхода избранных предметов. Избранных мало, поэтому ходим в API чаще.
const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 2 * 60 * 1000);
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

// Один прогон по избранным предметам.
async function cycle() {
  const items = await prisma.trackedItem.findMany({
    where: { favorite: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  log(`прогон: избранных ${items.length}`);

  for (const item of items) {
    if (stopping) {
      break;
    }

    await syncItem(item.id, log);
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

  log(`запуск: интервал ${INTERVAL_MS} мс, только избранные`);

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
