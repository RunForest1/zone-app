import type { ReactNode } from "react";

// Блок страницы с заголовком (белая панель).
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
      <h2 className="mb-3 text-xs uppercase tracking-wide text-faint">
        {title}
      </h2>
      {children}
    </section>
  );
}
