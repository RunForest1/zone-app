-- Алерты переходят со сделок на активные лоты: событие теперь описывает лот
-- (качество, точка, цена выкупа, средняя, прибыль), а дедуп — по ключу лота.
-- Старые события (по сделкам) несовместимы, да и переходные — очищаем.

DELETE FROM "AlertEvent";

-- DropIndex
DROP INDEX "AlertEvent_alertChatId_saleKey_key";

-- AlterTable
ALTER TABLE "AlertEvent" DROP COLUMN "saleKey",
ADD COLUMN     "average" BIGINT,
ADD COLUMN     "lotKey" TEXT NOT NULL,
ADD COLUMN     "lotPrice" BIGINT NOT NULL,
ADD COLUMN     "point" INTEGER NOT NULL,
ADD COLUMN     "quality" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "AlertEvent_alertChatId_lotKey_key" ON "AlertEvent"("alertChatId", "lotKey");
