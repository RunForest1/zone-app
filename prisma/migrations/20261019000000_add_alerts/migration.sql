-- Подписки телеграм-бота (AlertChat) и лог-очередь его уведомлений (AlertEvent).
-- Сгенерировано `prisma migrate diff` из изменения schema.prisma
-- (добавлены модели AlertChat и AlertEvent), применяется через `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "AlertChat" (
    "id" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "title" TEXT,
    "minProfit" BIGINT NOT NULL DEFAULT 50000,
    "minMargin" DOUBLE PRECISION,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ranks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "alertChatId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "saleKey" TEXT NOT NULL,
    "profit" BIGINT NOT NULL,
    "margin" DOUBLE PRECISION,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlertChat_telegramChatId_key" ON "AlertChat"("telegramChatId");

-- CreateIndex
CREATE INDEX "AlertEvent_itemId_idx" ON "AlertEvent"("itemId");

-- CreateIndex
CREATE INDEX "AlertEvent_sentAt_idx" ON "AlertEvent"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "AlertEvent_alertChatId_saleKey_key" ON "AlertEvent"("alertChatId", "saleKey");

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_alertChatId_fkey" FOREIGN KEY ("alertChatId") REFERENCES "AlertChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Контекст рынка на момент сделки: средняя, медиана, число сделок.
-- AlterTable
ALTER TABLE "AlertEvent" ADD COLUMN     "average" BIGINT,
ADD COLUMN     "median" BIGINT,
ADD COLUMN     "deals" INTEGER NOT NULL DEFAULT 0;
