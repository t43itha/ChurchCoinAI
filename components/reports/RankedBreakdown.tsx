import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { percentChange, type RankedCategory } from "../../lib/reportSummary";
import { INCOME_SERIES, SPENDING_SERIES } from "./palette";
import { formatCurrency, formatPercentChange } from "./format";

export interface RankedBreakdownProps {
  title: string;
  side: "income" | "spending";
  total: number;
  rows: RankedCategory[];
  comparisonLabel?: string;
  emptyText: string;
  changeColumnLabel?: string;
}

const HEADER_CELL = "text-xs font-bold text-grey-mid";

// Stacked on phones (label / amount / change, bar full width underneath); one row from sm up.
const gridClass = (showChange: boolean): string =>
  showChange
    ? "grid grid-cols-[1fr_auto_auto] sm:grid-cols-[minmax(120px,1.3fr)_minmax(80px,2fr)_96px_64px]"
    : "grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(120px,1.3fr)_minmax(80px,2fr)_96px]";

const changeClass = (side: RankedBreakdownProps["side"], change: number | null): string => {
  if (change === null || change === 0) return "text-grey-mid";
  if (side === "spending") {
    return Math.abs(change) >= 25 ? "font-semibold text-amber" : "text-grey-mid";
  }
  return change > 0 ? "text-sage" : "text-error";
};

export const RankedBreakdown: React.FC<RankedBreakdownProps> = ({
  title,
  side,
  total,
  rows,
  comparisonLabel,
  emptyText,
  changeColumnLabel = "Change",
}) => {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const seriesColour = side === "income" ? INCOME_SERIES : SPENDING_SERIES;
  const showChange = rows.some((row) => row.previous !== undefined);
  const largest = Math.max(0, ...rows.map((row) => row.total));
  const rowGrid = `${gridClass(showChange)} gap-x-2.5`;

  const toggle = (mainCategory: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(mainCategory)) next.delete(mainCategory);
      else next.add(mainCategory);
      return next;
    });
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: seriesColour }} />
          {title} · {formatCurrency(total)}
        </p>
        {comparisonLabel && <span className="text-xs text-grey-mid">{comparisonLabel}</span>}
      </div>

      {rows.length === 0 ? (
        <p className="py-3 text-sm text-grey-mid">{emptyText}</p>
      ) : (
        <>
          <div className={`${rowGrid} mb-1 items-end border-b border-[#efeee9] pb-1.5`}>
            <span className={HEADER_CELL}>Category</span>
            <span aria-hidden="true" className="hidden sm:block" />
            <span className={`${HEADER_CELL} text-right`}>Amount</span>
            {showChange && <span className={`${HEADER_CELL} text-right`}>{changeColumnLabel}</span>}
          </div>

          <ul>
            {rows.map((row) => {
              const isOpen = expanded.has(row.mainCategory);
              const hasSubs = row.subcategories.length > 0;
              const widthPct = largest > 0 ? Math.max(0, (row.total / largest) * 100) : 0;
              const change = row.previous === undefined ? null : percentChange(row.total, row.previous);
              const cells = (
                <>
                  <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] text-ink">
                    {hasSubs && (
                      <ChevronRight
                        size={14}
                        aria-hidden="true"
                        className={`shrink-0 text-grey-mid transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                    )}
                    <span className="truncate">{row.mainCategory}</span>
                  </span>
                  <span className="order-last col-span-full block h-2.5 overflow-hidden rounded bg-grey-light sm:order-none sm:col-span-1">
                    <span className="block h-full rounded-r" style={{ width: `${widthPct}%`, backgroundColor: seriesColour }} />
                  </span>
                  <span className="text-right font-mono text-[13px] font-medium text-ink">{formatCurrency(row.total)}</span>
                  {showChange && (
                    <span className={`text-right text-xs ${changeClass(side, change)}`}>{formatPercentChange(change)}</span>
                  )}
                </>
              );

              return (
                <li key={row.mainCategory} className="border-b border-[#f5f4f0] last:border-b-0">
                  {hasSubs ? (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggle(row.mainCategory)}
                      className={`${rowGrid} w-full cursor-pointer gap-y-1.5 py-[7px] text-left hover:bg-grey-light/60`}
                    >
                      {cells}
                    </button>
                  ) : (
                    <div className={`${rowGrid} gap-y-1.5 py-[7px]`}>{cells}</div>
                  )}
                  {hasSubs && isOpen && (
                    <ul className="mb-2 ml-5 border-l border-[#efeee9] pl-3">
                      {row.subcategories.map((sub) => (
                        <li key={sub.name} className="flex justify-between gap-3 py-1 text-[12.5px] text-grey-mid">
                          <span>{sub.name}</span>
                          <span className="font-mono">{formatCurrency(sub.total)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};
