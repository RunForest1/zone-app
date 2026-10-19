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

// Тот же ключ сделки, что и у Sale.key: им пользуется детектор алертов,
// чтобы связать событие с сохранённой сделкой.
export function saleKeyOf(itemId: string, point: PricePoint): string {
  return saleKey(itemId, point);
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

// Сделки из списка, которых ещё нет в БД: именно они «новые» для алертов.
// Вызывать до saveSales (пока записи не вставлены).
export async function freshSales(
  itemId: string,
  points: PricePoint[],
): Promise<PricePoint[]> {
  if (points.length === 0) {
    return [];
  }

  const fresh: PricePoint[] = [];

  for (let start = 0; start < points.length; start += INSERT_CHUNK) {
    const chunk = points.slice(start, start + INSERT_CHUNK);
    const keys = chunk.map((point) => saleKey(itemId, point));
    const existing = await prisma.sale.findMany({
      where: { key: { in: keys } },
      select: { key: true },
    });
    const known = new Set(existing.map((row) => row.key));

    for (let index = 0; index < chunk.length; index += 1) {
      if (!known.has(keys[index])) {
        fresh.push(chunk[index]);
      }
    }
  }

  return fresh;
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

// Сделка по ключу — боту нужны цена/качество/точка/время для сообщения.
export interface SaleRow {
  price: number;
  quality: number | null;
  point: number | null;
  time: string;
}

export async function saleByKey(key: string): Promise<SaleRow | null> {
  const row = await prisma.sale.findUnique({
    where: { key },
    select: { price: true, quality: true, point: true, time: true },
  });

  if (!row) {
    return null;
  }

  return {
    price: Number(row.price),
    quality: row.quality,
    point: row.point,
    time: row.time.toISOString(),
  };
}

// Сводка по сделкам предмета за период: число сделок, средняя и медиана цены.
export interface SaleStats {
  deals: number;
  average: number | null;
  median: number | null;
}

// Считаем в SQL: AVG и percentile_cont (медиана) — без выгрузки всех сделок.
export async function saleStats(
  itemId: string,
  since: Date,
): Promise<SaleStats> {
  const rows = await prisma.$queryRaw<
    Array<{ deals: number; average: number | null; median: number | null }>
  >`
    SELECT
      COUNT(*)::int AS deals,
      AVG(price)::float8 AS average,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price::float8) AS median
    FROM "Sale"
    WHERE "itemId" = ${itemId} AND "time" >= ${since}
  `;

  const row = rows[0];

  if (!row || row.deals === 0) {
    return { deals: 0, average: null, median: null };
  }

  return {
    deals: row.deals,
    average: row.average === null ? null : Math.round(row.average),
    median: row.median === null ? null : Math.round(row.median),
  };
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
