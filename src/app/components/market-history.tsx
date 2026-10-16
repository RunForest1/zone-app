"use client";

import Link from "next/link";
import type { AuctionLot } from "@/lib/auction";
import type { HistorySummary } from "@/lib/auction/market";
import { PERIODS, marketHref, type MarketQuery } from "@/lib/auction/period";
import { qualityLabel } from "@/lib/auction/quality";
import { formatDay, formatPrice } from "@/lib/format";
import { Panel } from "./panel";
import { PriceChart } from "./price-chart";

// Фильтры рынка и «История продаж»: средняя, медиана, график.
// Фильтры живут в адресе, поэтому работают и без клиентского JS.
export function MarketHistory({
  days,
  quality,
  point,
  qualities,
  pointValues,
  lots,
  summary,
}: {
  days: number;
  quality: string;
  point: string;
  qualities: number[];
  pointValues: number[];
  lots: AuctionLot[];
  summary: HistorySummary;
}) {
  const query: MarketQuery = { days, quality, point };

  const minOffer = minOfferOf(lots);
  const average = summary.average;
  const profit =
    average !== null && minOffer !== null ? average - minOffer : null;
  const margin =
    profit !== null && average ? Math.round((profit / average) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      {qualities.length > 0 || pointValues.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 shadow-card">
          {qualities.length > 0 ? (
            <Chips
              label="Качество"
              options={[
                { value: "", label: "Все" },
                ...qualities.map((value) => ({
                  value: String(value),
                  label: `${qualityLabel(value)} (${value})`,
                })),
              ]}
              active={quality}
              href={(value) => marketHref(query, { quality: value })}
            />
          ) : null}

          {pointValues.length > 0 ? (
            <Chips
              label="Точка"
              options={[
                { value: "", label: "Все" },
                ...pointValues.map((value) => ({
                  value: String(value),
                  label: String(value),
                })),
              ]}
              active={point}
              href={(value) => marketHref(query, { point: value })}
            />
          ) : null}
        </div>
      ) : null}

      <Panel title="История продаж">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((value) => (
              <Link
                key={value}
                href={marketHref(query, { days: value })}
                scroll={false}
                className={chipClass(value === days)}
              >
                {value} дней
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat
              label="Средняя цена"
              value={money(average)}
              hint={dealsHint(summary)}
            />
            <Stat label="Медиана" value={money(summary.median)} />
            <Stat label="Последняя сделка" value={money(summary.last)} />
            <Stat label="Мин. предложение" value={money(minOffer)} />
            <Stat label="Прибыль (маржа)" value={profitText(profit, margin)} />
          </div>

          {summary.from && summary.to ? (
            <p className="text-xs text-faint">{coverage(summary, days)}</p>
          ) : null}

          <PriceChart points={summary.series} />
        </div>
      </Panel>
    </div>
  );
}

// Ряд фильтров-ссылок (работает и без клиентского JS).
function Chips({
  label,
  options,
  active,
  href,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  active: string;
  href: (value: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-faint">{label}</span>
      {options.map((option) => (
        <Link
          key={option.value}
          href={href(option.value)}
          scroll={false}
          className={chipClass(option.value === active)}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

function chipClass(active: boolean): string {
  if (active) {
    return "rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent";
  }

  return "rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground";
}

// Минимальный выкуп среди активных лотов.
function minOfferOf(lots: AuctionLot[]): number | null {
  const offers = lots.map((lot) => lot.buyoutPrice).filter((value) => value > 0);

  if (offers.length === 0) {
    return null;
  }

  return Math.min(...offers);
}

function money(value: number | null): string {
  return value === null ? "—" : formatPrice(value);
}

// Подпись о покрытии: какие даты реально попали в выборку.
function coverage(summary: HistorySummary, days: number): string {
  const from = summary.from ?? "";
  const to = summary.to ?? "";
  const span = new Date(to).getTime() - new Date(from).getTime();
  const covered = Number.isNaN(span) ? 0 : span / (24 * 60 * 60 * 1000);
  const label = `Данные: ${formatDay(from)} – ${formatDay(to)}`;

  if (covered + 0.5 < days) {
    return `${label} · период ${days} дн. покрыт не полностью (лимит выборки)`;
  }

  return label;
}

// Подпись к средней: сколько сделок и сколько штук продано за период.
function dealsHint(summary: HistorySummary): string {
  if (summary.count === 0) {
    return "";
  }

  return `${summary.count} ${dealsWord(summary.count)} · ${summary.sold} шт`;
}

// Русское склонение слова «сделка».
function dealsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "сделка";
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "сделки";
  }

  return "сделок";
}

// Прибыль и маржа в процентах от средней цены.
function profitText(profit: number | null, margin: number | null): string {
  if (profit === null) {
    return "—";
  }

  return `${formatPrice(profit)} (${margin ?? 0}%)`;
}

// Показатель статистики.
function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-background px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-faint">{label}</div>
      <div className="text-sm font-medium">{value}</div>
      {hint ? <div className="text-xs text-faint">{hint}</div> : null}
    </div>
  );
}
