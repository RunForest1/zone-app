import { connection } from "next/server";
import {
  availableValues,
  filterEntries,
  summarize,
} from "@/lib/auction/market";
import { loadHistory, loadLots, windowOf } from "@/lib/auction/data";
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
  // Ждём запрос: после connection() код выполняется только в рантайме,
  // поэтому Date.now() допустим и окно считается по календарным датам.
  await connection();
  const now = Date.now();

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

  // Варианты фильтров берём по всем данным, чтобы список не сужался после выбора.
  const qualities = availableValues([...lots, ...points], "qlt");
  const pointValues = availableValues([...lots, ...points], "ptn");

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
