-- Фильтры уведомлений: качество/точка становятся диапазонами (наборы значений),
-- а прибыль — от средней по совершенным сделкам с учётом комиссии площадки 5%.

-- AlertChat: одиночные quality/point → наборы qualities/points.
ALTER TABLE "AlertChat"
  ADD COLUMN "qualities" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "points" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- Переносим уже настроенные одиночные значения в наборы.
UPDATE "AlertChat" SET "qualities" = ARRAY["quality"::integer] WHERE "quality" IS NOT NULL;
UPDATE "AlertChat" SET "points" = ARRAY["point"::integer] WHERE "point" IS NOT NULL;

ALTER TABLE "AlertChat"
  DROP COLUMN "quality",
  DROP COLUMN "point";

-- AlertEvent: average/median/deals → lastPrice + stats (рынок за 7/14/30 дней).
ALTER TABLE "AlertEvent"
  DROP COLUMN "average",
  DROP COLUMN "median",
  DROP COLUMN "deals",
  ADD COLUMN "lastPrice" BIGINT,
  ADD COLUMN "stats" JSONB;
