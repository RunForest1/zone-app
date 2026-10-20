import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PricePoint } from "@/lib/auction";
import { OUTLIER_MEDIAN_FACTOR, OUTLIER_TRIM } from "@/lib/auction/market";
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
// Срез задаётся качеством и точкой сделки (отсутствующая точка — 0,
// отсутствующее качество — отдельный срез). excludeKey исключает саму сделку.
export async function saleStats(
  itemId: string,
  since: Date,
  quality: number | null,
  point: number,
  excludeKey?: string,
): Promise<SaleStats> {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`"itemId" = ${itemId}`,
    Prisma.sql`"time" >= ${since}`,
    quality === null
      ? Prisma.sql`"quality" IS NULL`
      : Prisma.sql`"quality" = ${quality}`,
    Prisma.sql`COALESCE("point", 0) = ${point}`,
  ];

  if (excludeKey) {
    conditions.push(Prisma.sql`"key" <> ${excludeKey}`);
  }

  const rows = await prisma.$queryRaw<
    Array<{ deals: number; average: number | null; median: number | null }>
  >(Prisma.sql`
    WITH slice AS (
      SELECT price::float8 AS price
      FROM "Sale"
      WHERE ${Prisma.join(conditions, " AND ")}
    ),
    bounds AS (
      SELECT
        percentile_cont(${1 - OUTLIER_TRIM}) WITHIN GROUP (ORDER BY price) AS top,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS med
      FROM slice
    )
    SELECT
      (SELECT COUNT(*)::int FROM slice) AS deals,
      (
        SELECT AVG(price) FROM slice, bounds
        WHERE price <= bounds.top AND price <= bounds.med * ${OUTLIER_MEDIAN_FACTOR}
      ) AS average,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price) FROM slice) AS median
  `);

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

// Цена последней совершённой сделки по тому же качеству и точке.
export async function lastSalePrice(
  itemId: string,
  quality: number | null,
  point: number,
): Promise<number | null> {
  const row = await prisma.sale.findFirst({
    where: {
      itemId,
      ...(quality === null ? { quality: null } : { quality }),
      ...(point === 0 ? { OR: [{ point: 0 }, { point: null }] } : { point }),
    },
    orderBy: { time: "desc" },
    select: { price: true },
  });

  return row ? Number(row.price) : null;
}

// Создаёт строки предмета (TrackedItem + ItemSync), если их ещё нет. Нужны как
// владельцы сделок (внешний ключ) для любого предмета, по которому храним историю.
export async function ensureItem(itemId: string): Promise<void> {
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

// Избранное: помечено вручную; воркер синкает только избранные предметы.
export async function setFavorite(
  itemId: string,
  favorite: boolean,
): Promise<void> {
  await ensureItem(itemId);

  await prisma.trackedItem.update({
    where: { id: itemId },
    data: { favorite },
  });
}

// id избранных предметов (для каталога и воркера).
export async function listFavoriteIds(): Promise<string[]> {
  const rows = await prisma.trackedItem.findMany({
    where: { favorite: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => row.id);
}

// В избранном ли предмет.
export async function isFavorite(itemId: string): Promise<boolean> {
  const row = await prisma.trackedItem.findUnique({
    where: { id: itemId },
    select: { favorite: true },
  });

  return row?.favorite ?? false;
}
