"use client";

import { useMemo, useState } from "react";
import {
  EMPTY_FILTERS,
  RANK_OPTIONS,
  SORT_OPTIONS,
  applyFilters,
  topCategories,
  type CatalogFilters,
  type ItemSummary,
  type SortValue,
} from "@/lib/items/catalog";
import { Button } from "./button";
import { CategoryNav } from "./category-nav";
import { FilterSelect } from "./filter-select";
import { ItemCard } from "./item-card";

// Сколько карточек показываем за раз.
const PAGE_SIZE = 120;

// Каталог: меню категорий слева, панель поиска/фильтров сверху, сетка карточек.
// Избранные предметы (звёздочка) всегда идут первыми.
export function ItemCatalog({
  items,
  favoriteIds,
}: {
  items: ItemSummary[];
  favoriteIds: string[];
}) {
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const categories = useMemo(() => topCategories(items), [items]);
  // Избранное приходит с сервера; после переключения звёздочки оно обновляется
  // (router.refresh в FavoriteButton), и порядок пересчитывается.
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const visible = useMemo(() => {
    const list = applyFilters(items, filters);
    // Избранные — первыми; порядок внутри групп сохраняем (сортировка стабильная).
    return [...list].sort(
      (a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)),
    );
  }, [items, filters, favorites]);
  const shown = visible.slice(0, limit);

  // «По разделам» не нужна внутри одной категории, «по рангу» — при одном ранге.
  const sortOptions = SORT_OPTIONS.map((option) => ({
    ...option,
    disabled:
      (option.value === "section" && filters.category !== "") ||
      (option.value === "rank" && filters.color !== ""),
  }));

  const changed =
    filters.query !== EMPTY_FILTERS.query ||
    filters.category !== EMPTY_FILTERS.category ||
    filters.color !== EMPTY_FILTERS.color ||
    filters.sort !== EMPTY_FILTERS.sort;

  function update(patch: Partial<CatalogFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setLimit(PAGE_SIZE);
  }

  function reset() {
    setFilters(EMPTY_FILTERS);
    setLimit(PAGE_SIZE);
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-6">
      <aside className="lg:sticky lg:top-6 lg:w-64 lg:shrink-0 lg:self-start">
        <CategoryNav
          categories={categories}
          total={items.length}
          value={filters.category}
          onSelect={(value) => update({ category: value })}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3 shadow-card">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-faint">
              Поиск
            </span>
            <input
              value={filters.query}
              onChange={(event) => update({ query: event.target.value })}
              placeholder="Название предмета"
              className="w-64 rounded-lg border border-line bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-faint focus:border-accent"
            />
          </label>

          <FilterSelect
            label="Ранг"
            value={filters.color}
            options={RANK_OPTIONS}
            onChange={(value) => update({ color: value })}
          />

          <FilterSelect
            label="Сортировка"
            value={filters.sort}
            options={sortOptions}
            onChange={(value) => update({ sort: value as SortValue })}
          />

          {changed ? (
            <Button variant="secondary" onClick={reset}>
              Сбросить
            </Button>
          ) : null}
        </div>

        <p className="text-sm text-muted">Найдено: {visible.length}</p>

        {shown.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted">
            Ничего не найдено
          </p>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
            {shown.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                favorite={favorites.has(item.id)}
              />
            ))}
          </div>
        )}

        {visible.length > limit ? (
          <div className="flex items-center gap-4">
            <Button onClick={() => setLimit((prev) => prev + PAGE_SIZE)}>
              Показать ещё
            </Button>
            <span className="text-sm text-muted">
              Показано {shown.length} из {visible.length}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
