"use client";

import type { ReactNode } from "react";

// Кнопка интерфейса: основная (акцентная) или второстепенная.
export function Button({
  children,
  variant = "primary",
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const classes =
    variant === "primary"
      ? "bg-accent text-white hover:brightness-95"
      : "border border-line bg-surface text-foreground hover:bg-surface-muted";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${classes}`}
    >
      {children}
    </button>
  );
}
