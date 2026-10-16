"use client";

import { useMemo, useState } from "react";
import type { AuctionLot } from "@/lib/auction";
import { qualityColor, qualityLabel } from "@/lib/auction/quality";
import { formatDateTime, formatPrice } from "@/lib/format";
import { Button } from "./button";

// Сколько лотов на странице.
const PAGE_SIZE = 20;

// Колонки, по которым можно сортировать.
type SortKey =
  "amount" | "startPrice" | "buyoutPrice" | "qlt" | "ptn" | "endTime";

// Активные лоты: переключение страниц сверху, сортировка кликом по заголовку.
export function LotsTable({ lots }: { lots: AuctionLot[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("endTime");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const hasQuality = lots.some(
    (lot) => typeof lot.additional?.qlt === "number",
  );
  const hasPoint = lots.some((lot) => typeof lot.additional?.ptn === "number");

  const sorted = useMemo(() => {
    const factor = order === "asc" ? 1 : -1;
    const copy = [...lots];

    copy.sort((a, b) => {
      const left = sortValue(a, sortKey);
      const right = sortValue(b, sortKey);

      if (typeof left === "string" || typeof right === "string") {
        return factor * String(left).localeCompare(String(right));
      }

      return factor * (left - right);
    });

    return copy;
  }, [lots, sortKey, order]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const from = (current - 1) * PAGE_SIZE;
  const to = Math.min(from + PAGE_SIZE, sorted.length);
  const visible = sorted.slice(from, to);

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setOrder("asc");
    }

    setPage(1);
  }

  // Заголовок колонки со стрелкой сортировки.
  function head(label: string, key: SortKey) {
    const arrow = sortKey === key ? (order === "asc" ? "↑" : "↓") : "";

    return (
      <th key={key} className="py-2 pr-4 font-normal">
        <button
          type="button"
          onClick={() => toggle(key)}
          className="flex items-center gap-1 text-xs uppercase tracking-wide text-faint transition-colors hover:text-foreground"
        >
          {label}
          <span>{arrow}</span>
        </button>
      </th>
    );
  }

  if (lots.length === 0) {
    return <p className="text-sm text-muted">Активных лотов нет</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => setPage(current - 1)}
          disabled={current <= 1}
        >
          Назад
        </Button>
        <span className="text-xs text-faint">
          {from + 1}–{to} из {sorted.length} · страница {current} из {pages}
        </span>
        <Button
          variant="secondary"
          onClick={() => setPage(current + 1)}
          disabled={current >= pages}
        >
          Вперёд
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              {head("Кол-во", "amount")}
              {head("Старт", "startPrice")}
              {head("Выкуп", "buyoutPrice")}
              {hasQuality ? head("Качество", "qlt") : null}
              {hasPoint ? head("Точка", "ptn") : null}
              {head("Окончание", "endTime")}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((lot, index) => (
              <tr key={index}>
                <td className="py-2 pr-4 text-muted">{lot.amount}</td>
                <td className="py-2 pr-4">{formatPrice(lot.startPrice)}</td>
                <td className="py-2 pr-4">{formatPrice(lot.buyoutPrice)}</td>
                {hasQuality ? (
                  <td className="py-2 pr-4">{qualityCell(lot)}</td>
                ) : null}
                {hasPoint ? (
                  <td className="py-2 pr-4 text-muted">
                    {lot.additional?.ptn ?? "—"}
                  </td>
                ) : null}
                <td className="py-2 text-muted">
                  {formatDateTime(lot.endTime)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Значение колонки для сортировки.
function sortValue(lot: AuctionLot, key: SortKey): number | string {
  if (key === "amount") {
    return lot.amount;
  }

  if (key === "startPrice") {
    return lot.startPrice;
  }

  if (key === "buyoutPrice") {
    return lot.buyoutPrice;
  }

  if (key === "qlt") {
    return lot.additional?.qlt ?? -1;
  }

  if (key === "ptn") {
    return lot.additional?.ptn ?? -1;
  }

  return lot.endTime;
}

// Качество лота словом в его цвете.
function qualityCell(lot: AuctionLot) {
  const value = lot.additional?.qlt;

  if (typeof value !== "number") {
    return <span className="text-muted">—</span>;
  }

  return (
    <span style={{ color: qualityColor(value) }}>{qualityLabel(value)}</span>
  );
}
