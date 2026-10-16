// Иконка предмета. Если картинки нет — показываем пустую заглушку.
export function ItemIcon({
  src,
  alt,
  size = 64,
}: {
  src: string | null;
  alt: string;
  size?: number;
}) {
  if (!src) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-lg bg-surface-muted"
        aria-hidden
      />
    );
  }

  // Иконки в базе небольшие (128px), поэтому обычный img с ленивой загрузкой.
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      className="object-contain"
    />
  );
}
