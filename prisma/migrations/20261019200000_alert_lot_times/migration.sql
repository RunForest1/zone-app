-- Начало и окончание лота: показываем в уведомлении (по Москве).

-- AlterTable
ALTER TABLE "AlertEvent"
  ADD COLUMN "lotStart" TIMESTAMP(3),
  ADD COLUMN "lotEnd" TIMESTAMP(3);
