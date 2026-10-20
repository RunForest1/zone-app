"use server";

import { setFavorite } from "@/lib/db/sales";

// Переключает избранное: избранные предметы воркер синкает постоянно,
// и в каталоге они идут первыми.
export async function toggleFavorite(
  itemId: string,
  favorite: boolean,
): Promise<void> {
  if (!itemId) {
    return;
  }

  await setFavorite(itemId, favorite);
}
