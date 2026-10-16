import Link from "next/link";
import {
  categoryLabel,
  rankColor,
  rankLabel,
  type ItemSummary,
} from "@/lib/items/catalog";
import { ItemIcon } from "./item-icon";

// Карточка предмета. Рамка и мягкое свечение — в цвет ранга предмета.
export function ItemCard({ item }: { item: ItemSummary }) {
  const color = rankColor(item.color);

  return (
    <Link
      href={`/items/${item.id}`}
      style={{ borderColor: color, boxShadow: `0 2px 14px -2px ${color}80` }}
      className="flex flex-col gap-3 rounded-xl border bg-surface p-3 transition-transform hover:-translate-y-0.5"
    >
      <div className="flex h-24 items-center justify-center rounded-lg bg-surface-muted/60">
        <ItemIcon src={item.icon} alt={item.name} size={72} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="line-clamp-2 text-sm font-medium">{item.name}</span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted">
            {categoryLabel(item.category)}
          </span>
          <span style={{ color }} className="shrink-0 text-xs font-medium">
            {rankLabel(item.color)}
          </span>
        </span>
      </div>
    </Link>
  );
}
