"use server";

import { trackItem as trackItemInDb } from "@/lib/db/sales";

// Помечает предмет отслеживаемым: воркер начнёт следить за его историей.
// Вызывается при открытии карточки предмета.
export async function trackItem(itemId: string): Promise<void> {
  if (!itemId) {
    return;
  }

  await trackItemInDb(itemId);
}
