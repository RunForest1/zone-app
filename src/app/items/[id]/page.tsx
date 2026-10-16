import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ItemHistory } from "@/app/components/item-history";
import { ItemLots } from "@/app/components/item-lots";
import { ItemIcon } from "@/app/components/item-icon";
import { Placeholder } from "@/app/components/placeholder";
import { parseFeature, parsePeriod } from "@/lib/auction/period";
import {
  categoryLabel,
  iconUrl,
  itemName,
  rankColor,
  rankLabel,
} from "@/lib/items/catalog";
import { itemsDatabase } from "@/lib/items/store";

// Готовим страницы для всех предметов заранее.
export function generateStaticParams() {
  return itemsDatabase.list().map((item) => ({ id: item.id }));
}

// Заголовок вкладки — имя предмета.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = itemsDatabase.get(id);

  if (!item) {
    return {};
  }

  return { title: itemName(item) };
}

// Детальная страница предмета.
// Обращение к params обёрнуто в Suspense — так навигация остаётся мгновенной
// (требование cacheComponents, см. /docs/messages/instant-shell-url-data).
export default function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<ItemFallback />}>
      <ItemContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ItemContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  // Период и фильтры рынка берём из адреса (?days=&qlt=&ptn=) — так они
  // работают без клиентского состояния и попадают в выборку данных.
  const days = parsePeriod(query.days);
  const quality = parseFeature(query.qlt);
  const point = parseFeature(query.ptn);
  const item = itemsDatabase.get(id);

  if (!item) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/"
        className="text-sm text-muted transition-colors hover:text-accent"
      >
        ← Назад в каталог
      </Link>

      <header
        style={{
          borderColor: rankColor(item.color),
          boxShadow: `0 4px 24px -6px ${rankColor(item.color)}66`,
        }}
        className="flex items-start gap-6 rounded-xl border bg-surface p-6"
      >
        <ItemIcon src={iconUrl(item)} alt={itemName(item)} size={96} />

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {itemName(item)}
          </h1>
          <p className="text-sm text-muted">
            {categoryLabel(item.category)} ·{" "}
            <span style={{ color: rankColor(item.color) }}>
              {rankLabel(item.color)}
            </span>
          </p>
        </div>
      </header>

      {/* История и лоты — отдельные Suspense: лоты (один запрос) показываются
          раньше, чем история (у «горячих» предметов это десятки страниц). */}
      <Suspense
        fallback={
          <Placeholder text="Загружаем историю продаж…" className="h-72" />
        }
      >
        <ItemHistory
          itemId={item.id}
          days={days}
          quality={quality}
          point={point}
        />
      </Suspense>

      <Suspense
        fallback={<Placeholder text="Загружаем лоты…" className="h-48" />}
      >
        <ItemLots itemId={item.id} quality={quality} point={point} />
      </Suspense>
    </div>
  );
}

// Заглушка на время загрузки страницы.
function ItemFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-4 w-32 rounded bg-surface-muted" />
      <div className="h-32 rounded-xl border border-line bg-surface shadow-card" />
      <div className="h-64 rounded-xl border border-line bg-surface shadow-card" />
    </div>
  );
}
