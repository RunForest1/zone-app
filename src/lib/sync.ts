import {
  BACKFILL_DAYS as DEFAULT_BACKFILL_DAYS,
  BACKFILL_PAGES,
  INCREMENT_PAGES,
  getSzApi,
} from "@/lib/auction";
import { checkAlerts } from "@/lib/alerts";
import { prisma } from "@/lib/db";
import {
  ensureItem,
  freshSales,
  latestSaleTime,
  saveSales,
} from "@/lib/db/sales";

// Синхронизация истории предмета: используется и воркером (по избранному),
// и страницей предмета (подтягивание по открытию).

// Глубина разового backfill при первом появлении предмета (дней).
const BACKFILL_DAYS = Number(
  process.env.WORKER_BACKFILL_DAYS ?? DEFAULT_BACKFILL_DAYS,
);
const DAY_MS = 24 * 60 * 60 * 1000;

// Подтягивание по открытию карточки делаем не чаще этого интервала, чтобы
// частые переходы не дёргали API (избранные и так синкает воркер).
const ON_DEMAND_MIN_MS = Number(
  process.env.SYNC_ON_DEMAND_MIN_MS ?? 2 * 60 * 1000,
);

export type SyncLogger = (message: string) => void;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Один предмет: backfill при первом появлении, дальше — только новые сделки.
// Возвращает число добавленных сделок.
export async function syncItem(
  itemId: string,
  log: SyncLogger = () => {},
): Promise<number> {
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
    // Новые сделки для алертов определяем до сохранения (пока их нет в БД).
    // На backfill уведомления не шлём — иначе зальём чат историей за 30 дней.
    const fresh = isBackfill ? [] : await freshSales(itemId, points);
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

    // Ставим в очередь уведомления о новых выгодных сделках.
    // Сбой алертов не должен ломать синхронизацию сделок.
    if (fresh.length > 0) {
      try {
        const queued = await checkAlerts(itemId, fresh);

        if (queued > 0) {
          log(`${itemId}: уведомлений в очередь: ${queued}`);
        }
      } catch (error) {
        log(`${itemId}: алерты не удались — ${errorText(error)}`);
      }
    }

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

// Подтягивание истории по открытию карточки (предмет при этом не становится
// избранным). Строку предмета создаём всегда — она нужна как владелец сделок
// (внешний ключ). Не чаще ON_DEMAND_MIN_MS на предмет.
export async function syncOnDemand(itemId: string): Promise<void> {
  await ensureItem(itemId);

  const state = await prisma.itemSync.findUnique({
    where: { itemId },
    select: { lastSyncedAt: true },
  });
  const last = state?.lastSyncedAt?.getTime() ?? 0;

  if (Date.now() - last < ON_DEMAND_MIN_MS) {
    return;
  }

  await syncItem(itemId);
}
