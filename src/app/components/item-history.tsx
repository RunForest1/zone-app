import { connection } from "next/server";
import { trackItem } from "@/app/actions";
import {
  availableValues,
  featureRange,
  filterEntries,
  summarize,
} from "@/lib/auction/market";
import {
  ensureHistory,
  loadHistory,
  loadLots,
  windowOf,
} from "@/lib/auction/data";
import { Placeholder } from "./placeholder";
import { MarketHistory } from "./market-history";

// Блок «История продаж»: тянет лоты и историю, считает статистику и ряд графика.
export async function ItemHistory({
  itemId,
  days,
  quality,
  point,
}: {
  itemId: string;
  days: number;
  quality: string;
  point: string;
}) {
  // Ждём запрос: после connection() код выполняется только в рантайме —
  // это нужно и для Date.now(), и для записи в БД (Prisma внутри зовёт new Date()
  // для createdAt/updatedAt, а нестабильные значения в пререндере запрещены).
  await connection();
  const now = Date.now();

  // Открыли карточку — помечаем предмет отслеживаемым, чтобы воркер
  // подтянул и дальше поддерживал его историю в БД.
  // Ошибку не глотаем молча: без БД/миграций история не появится,
  // и причина должна быть видна в логах контейнера web.
  try {
    await trackItem(itemId);
  } catch (error) {
    console.error("[track] не удалось пометить предмет:", itemId, error);
  }

  // Если история по предмету ещё не собиралась, забираем её из API прямо
  // сейчас (за 30 дней) и кладём в БД — страница не ждёт воркера.
  try {
    await ensureHistory(itemId);
  } catch (error) {
    console.error("[history] не удалось загрузить историю:", itemId, error);
  }

  let lots;
  let points;

  try {
    [lots, points] = await Promise.all([
      loadLots(itemId),
      // Округлённое время — ключ кэша: запросы внутри одного окна (5 минут)
      // переиспользуют один и тот же результат.
      loadHistory(itemId, days, windowOf(now)),
    ]);
  } catch {
    return (
      <Placeholder
        text="Не удалось загрузить данные аукциона"
        className="h-72"
      />
    );
  }

  if (lots.length === 0 && points.length === 0) {
    return <Placeholder text="Данных по предмету нет" className="h-72" />;
  }

  // Фильтр показываем, только если признак вообще есть в данных, но значения
  // перечисляем полным диапазоном (заточка 0–15, качество 0–5), чтобы вариант
  // не «пропадал» из списка, когда по нему пока не было сделок.
  const entries = [...lots, ...points];
  const qualities =
    availableValues(entries, "qlt").length > 0 ? featureRange("qlt") : [];
  const pointValues =
    availableValues(entries, "ptn").length > 0 ? featureRange("ptn") : [];

  return (
    <MarketHistory
      days={days}
      quality={quality}
      point={point}
      qualities={qualities}
      pointValues={pointValues}
      lots={filterEntries(lots, quality, point)}
      summary={summarize(filterEntries(points, quality, point))}
    />
  );
}
