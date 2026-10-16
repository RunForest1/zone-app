import { createHash } from "node:crypto";
import type { PricePoint } from "@/lib/auction";
import { prisma } from "./index";

// Ключ дедупликации сделки: по нему одинаковые записи из API не задваиваются.
function saleKey(itemId: string, point: PricePoint): string {
  const parts = [
    itemId,
    point.time,
    point.price,
    point.amount,
    point.additional?.qlt ?? -1,
    point.additional?.ptn ?? 0,
  ];

  return createHash("sha1").update(parts.join("|")).digest("hex");
}

// Сделки предмета за период, хронологически, в формате истории.
export async function readSales(
  itemId: string,
  since: Date,
): Promise<PricePoint[]> {
  const rows = await prisma.sale.findMany({
    where: { itemId, time: { gte: since } },
    orderBy: { time: "asc" },
    select: {
      time: true,
      price: true,
      amount: true,
      quality: true,
      point: true,
    },
  });

  return rows.map((row) => ({
    amount: row.amount,
    price: Number(row.price),
    time: row.time.toISOString(),
    additional: {
      ...(row.quality !== null ? { qlt: row.quality } : {}),
      ...(row.point !== null ? { ptn: row.point } : {}),
    },
  }));
}

// Размер пачки при вставке (backfill может дать тысячи записей).
const INSERT_CHUNK = 1000;

// Дописывает сделки (дубликаты пропускаются). Возвращает число добавленных.
export async function saveSales(
  itemId: string,
  points: PricePoint[],
): Promise<number> {
  if (points.length === 0) {
    return 0;
  }

  let added = 0;

  for (let start = 0; start < points.length; start += INSERT_CHUNK) {
    const data = points.slice(start, start + INSERT_CHUNK).map((point) => ({
      itemId,
      time: new Date(point.time),
      price: BigInt(Math.round(point.price)),
      amount: point.amount || 1,
      quality:
        typeof point.additional?.qlt === "number" ? point.additional.qlt : null,
      point:
        typeof point.additional?.ptn === "number" ? point.additional.ptn : null,
      key: saleKey(itemId, point),
    }));

    const result = await prisma.sale.createMany({ data, skipDuplicates: true });
    added += result.count;
  }

  return added;
}

// Самая свежая сделка предмета (с неё продолжаем дописывание).
export async function latestSaleTime(itemId: string): Promise<Date | null> {
  const row = await prisma.sale.findFirst({
    where: { itemId },
    orderBy: { time: "desc" },
    select: { time: true },
  });

  return row?.time ?? null;
}

// Собран ли уже базовый период истории предмета.
export async function isBackfilled(itemId: string): Promise<boolean> {
  const state = await prisma.itemSync.findUnique({
    where: { itemId },
    select: { backfilledAt: true },
  });

  return Boolean(state?.backfilledAt);
}

// Отмечает, что история за базовый период собрана.
export async function markBackfilled(itemId: string): Promise<void> {
  await prisma.itemSync.upsert({
    where: { itemId },
    create: { itemId, backfilledAt: new Date(), lastSyncedAt: new Date() },
    update: { backfilledAt: new Date(), lastSyncedAt: new Date() },
  });
}

// Помечает предмет отслеживаемым (чтобы воркер знал, за чем следить).
export async function trackItem(itemId: string): Promise<void> {
  await prisma.trackedItem.upsert({
    where: { id: itemId },
    create: { id: itemId },
    update: {},
  });

  await prisma.itemSync.upsert({
    where: { itemId },
    create: { itemId },
    update: {},
  });
}
