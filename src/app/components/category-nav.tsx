"use client";

import type { CategoryInfo } from "@/lib/items/catalog";

// Левое меню категорий. Выбирает одну категорию верхнего уровня.
export function CategoryNav({
  categories,
  total,
  value,
  onSelect,
}: {
  categories: CategoryInfo[];
  total: number;
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <nav className="flex flex-col gap-0.5 rounded-xl border border-line bg-surface p-2 shadow-card">
      <span className="px-3 pb-1 pt-2 text-xs uppercase tracking-wide text-faint">
        Разделы
      </span>

      <CategoryButton
        label="Все предметы"
        count={total}
        active={value === ""}
        onClick={() => onSelect("")}
      />

      {categories.map((category) => (
        <CategoryButton
          key={category.value}
          label={category.label}
          count={category.count}
          active={value === category.value}
          onClick={() => onSelect(category.value)}
        />
      ))}
    </nav>
  );
}

// Пункт меню категорий.
function CategoryButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const classes = active
    ? "bg-accent-soft font-medium text-accent"
    : "text-muted hover:bg-surface-muted hover:text-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-sm transition-colors ${classes}`}
    >
      <span>{label}</span>
      <span className="text-xs text-faint">{count}</span>
    </button>
  );
}
