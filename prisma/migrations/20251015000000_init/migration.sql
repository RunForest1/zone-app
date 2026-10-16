-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "TrackedItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemSync" (
    "itemId" TEXT NOT NULL,
    "backfilledAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastSaleTime" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemSync_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" BIGSERIAL NOT NULL,
    "itemId" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "price" BIGINT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "quality" INTEGER,
    "point" INTEGER,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" BIGSERIAL NOT NULL,
    "itemId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "added" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_key_key" ON "Sale"("key");

-- CreateIndex
CREATE INDEX "Sale_itemId_time_idx" ON "Sale"("itemId", "time");

-- CreateIndex
CREATE INDEX "SyncLog_startedAt_idx" ON "SyncLog"("startedAt");

-- AddForeignKey
ALTER TABLE "ItemSync" ADD CONSTRAINT "ItemSync_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TrackedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TrackedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

