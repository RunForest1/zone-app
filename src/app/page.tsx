import { ItemCatalog } from "@/app/components/item-catalog";
import { toSummary } from "@/lib/items/catalog";
import { itemsDatabase } from "@/lib/items/store";

export const metadata = {
  title: "Каталог предметов",
};

// Каталог: собираем краткие версии предметов и отдаём в клиентский фильтр.
export default function Page() {
  const items = itemsDatabase.list().map(toSummary);

  return <ItemCatalog items={items} />;
}
