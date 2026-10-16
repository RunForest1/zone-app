// Заглушка под ещё не готовый блок интерфейса.
export function Placeholder({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface-muted/60 text-sm text-muted ${
        className ?? ""
      }`}
    >
      {text}
    </div>
  );
}
