"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleFavorite } from "@/app/actions";

// Кнопка-звёздочка: переключает избранное. Props только сериализуемые
// (функций нет), поэтому компонент можно импортировать и из серверных страниц.
// Состояние оптимистичное: звезда меняется сразу, затем обновляем данные.
export function FavoriteButton({
  itemId,
  favorite,
  className,
}: {
  itemId: string;
  favorite: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [shown, setShown] = useState<boolean | null>(null);
  const [, startTransition] = useTransition();
  const value = shown ?? favorite;

  function onClick(event: React.MouseEvent) {
    // Кнопка часто лежит внутри ссылки-карточки — не даём перейти.
    event.preventDefault();
    event.stopPropagation();

    const next = !value;
    setShown(next);

    startTransition(async () => {
      try {
        await toggleFavorite(itemId, next);
        // Обновляем серверные данные (порядок в каталоге, состояние страницы).
        router.refresh();
      } catch {
        // Не сохранилось — возвращаем прежнее состояние.
        setShown(!next);
      }
    });
  }

  return (
    <button
      type="button"
      aria-pressed={value}
      aria-label={value ? "Убрать из избранного" : "В избранное"}
      title={value ? "Убрать из избранного" : "В избранное"}
      onClick={onClick}
      className={className}
    >
      {value ? "★" : "☆"}
    </button>
  );
}
