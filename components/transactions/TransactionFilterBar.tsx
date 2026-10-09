import { ChevronLeft, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import type { Fund } from "../../types";
import { chip, linkBtn, txtInput } from "../wizard/ui";

export interface TransactionFilterBarProps {
  search: string;
  onSearch: (search: string) => void;
  month: number | null;
  year: number | null;
  onMonth: (month: number | null) => void;
  onYear: (year: number | null) => void;
  onStepMonth: (direction: -1 | 1) => void;
  monthOptions: { value: number; label: string }[];
  yearOptions: number[];
  fundId: string;
  funds: Fund[];
  onFund: (fundId: string) => void;
  // Count of the filters on the "+ Filter" sheet that are in use.
  moreCount: number;
  onOpenMore: () => void;
  hasFilters: boolean;
  onClear: () => void;
  // The giving view only filters by period.
  periodOnly?: boolean;
}

const navButton =
  "flex h-11 w-9 shrink-0 items-center justify-center text-grey-mid hover:text-ink disabled:cursor-not-allowed disabled:opacity-35";

// The bar above the list: search, period, fund, then "+ Filter" for the rest.
export default function TransactionFilterBar({
  search,
  onSearch,
  month,
  year,
  onMonth,
  onYear,
  onStepMonth,
  monthOptions,
  yearOptions,
  fundId,
  funds,
  onFund,
  moreCount,
  onOpenMore,
  hasFilters,
  onClear,
  periodOnly = false,
}: TransactionFilterBarProps) {
  const periodStepDisabled = month === null || year === null;

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {!periodOnly && (
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search transactions</span>
          <Search size={16} strokeWidth={1.9} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-grey-mid" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search descriptions, donors, amounts"
            className={`${txtInput} h-11 pl-10`}
          />
        </label>
      )}

      <div className={`${chip} gap-0 overflow-hidden px-0`}>
        <button type="button" onClick={() => onStepMonth(-1)} disabled={periodStepDisabled} aria-label="Previous month" className={navButton}>
          <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <label className="sr-only" htmlFor="filter-month">Month</label>
        <select
          id="filter-month"
          value={month ?? ""}
          onChange={(e) => onMonth(e.target.value === "" ? null : Number(e.target.value))}
          className="h-11 cursor-pointer appearance-none bg-transparent px-1 text-sm font-semibold text-ink outline-none"
        >
          <option value="">All months</option>
          {monthOptions.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="filter-year">Year</label>
        <select
          id="filter-year"
          value={year ?? ""}
          onChange={(e) => onYear(e.target.value === "" ? null : Number(e.target.value))}
          className="h-11 cursor-pointer appearance-none bg-transparent pl-1 pr-2 text-sm font-semibold text-ink outline-none"
        >
          <option value="">All years</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => onStepMonth(1)} disabled={periodStepDisabled} aria-label="Next month" className={navButton}>
          <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {!periodOnly && (
        <>
          <label className="sr-only" htmlFor="filter-fund">Fund</label>
          <select
            id="filter-fund"
            value={fundId}
            onChange={(e) => onFund(e.target.value)}
            className={`${chip} cursor-pointer appearance-none pr-4 ${fundId ? "text-ink" : ""}`}
          >
            <option value="">All funds</option>
            {funds.map((f) => (
              <option key={f._id} value={f._id}>
                {f.name}
              </option>
            ))}
          </select>

          <button type="button" onClick={onOpenMore} className={`${chip} gap-2 ${moreCount > 0 ? "border-ink text-ink" : ""}`}>
            <SlidersHorizontal size={15} strokeWidth={1.9} aria-hidden="true" />
            Filter
            {moreCount > 0 && <span className="font-mono text-xs">{moreCount}</span>}
          </button>
        </>
      )}

      {hasFilters && (
        <button type="button" onClick={onClear} className={linkBtn}>
          Clear
        </button>
      )}
    </div>
  );
}
