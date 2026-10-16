import { filterEntries } from "@/lib/auction/market";
import { loadLots } from "@/lib/auction/data";
import { LotsTable } from "./lots-table";
import { Panel } from "./panel";
import { Placeholder } from "./placeholder";

// Блок «Текущий аукцион»: лоты берутся из кэша, поэтому появляются
// быстрее, чем история (её страниц обычно намного больше).
export async function ItemLots({
  itemId,
  quality,
  point,
}: {
  itemId: string;
  quality: string;
  point: string;
}) {
  let lots;

  try {
    lots = await loadLots(itemId);
  } catch {
    return <Placeholder text="Не удалось загрузить лоты" className="h-48" />;
  }

  return (
    <Panel title="Текущий аукцион">
      <LotsTable lots={filterEntries(lots, quality, point)} />
    </Panel>
  );
}
