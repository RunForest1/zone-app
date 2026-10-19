import type { Context } from "grammy";

// Проверка, что команду шлёт разрешённый пользователь.
// Список Telegram user.id — в ALERT_ADMIN_USER_IDS (через запятую).
// Пустой список означает «никому»: безопаснее, чем пускать всех.

// Разрешённые user.id строкой.
function allowedIds(): string[] {
  return (process.env.ALERT_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isAllowedUser(ctx: Context): boolean {
  const id = ctx.from?.id;

  if (id === undefined) {
    return false;
  }

  return allowedIds().includes(String(id));
}
