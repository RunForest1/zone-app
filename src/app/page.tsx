import { Suspense } from "react";
import { connection } from "next/server";
import { ItemCatalog } from "@/app/components/item-catalog";
import { listFavoriteIds } from "@/lib/db/sales";
import { toSummary } from "@/lib/items/catalog";
import { itemsDatabase } from "@/lib/items/store";

export const metadata = {
  title: "Каталог предметов",
};

// Каталог: краткие версии предметов + список избранного (из БД).
// Избранное читается на каждый запрос, поэтому список оборачиваем в Suspense —
// иначе dev-валидация «мгновенной навигации» ругается (cacheComponents).
export default function Page() {
  return (
    <Suspense fallback={<CatalogFallback />}>
      <CatalogContent />
    </Suspense>
  );
}

async function CatalogContent() {
  await connection();

  const items = itemsDatabase.list().map(toSummary);
  let favoriteIds: string[] = [];

  try {
    favoriteIds = await listFavoriteIds();
  } catch (error) {
    // Без БД каталог всё равно показываем — просто без избранного.
    console.error("[catalog] не удалось прочитать избранное:", error);
  }

  return <ItemCatalog items={items} favoriteIds={favoriteIds} />;
}

// Заглушка на время чтения избранного.
function CatalogFallback() {
  return (
    <div className="h-96 rounded-xl border border-line bg-surface shadow-card" />
  );
}
