// Pure helpers shared by the report PDF and Excel exports: fund statement
// grouping, change labels and dates. Money totals use sumMoney.
import type { CategoryGroup } from "../types";
import {
  isUnrestrictedFund,
  percentChange,
  type FundStatement,
  type FundStatementRow,
  type FundStatementTotals,
} from "../lib/reportSummary";

// Fund rows split into the unrestricted and restricted groups, and whether any
// row has an "other" movement worth its own column.
export function splitFundRows(statement: FundStatement) {
  return {
    unrestricted: statement.rows.filter(isUnrestrictedFund),
    restricted: statement.rows.filter((row) => !isUnrestrictedFund(row)),
    showOther: statement.rows.some((row) => row.other !== 0),
  };
}

// Values for the fund columns after the name, in table order. The "Other"
// value is only included when the table has that column.
export function fundCellValues(totals: FundStatementTotals, showOther: boolean): number[] {
  return [
    totals.opening,
    totals.income,
    totals.expenditure,
    totals.transfers,
    ...(showOther ? [totals.other] : []),
    totals.closing,
  ];
}

// A comparison period's total for a main category. 0 when the category is absent.
export const priorTotalFor = (groups: CategoryGroup[], mainCategory: string) =>
  groups.find((group) => group.mainCategory === mainCategory)?.total ?? 0;

// "+12.5%", "−3.0%", or "—" when there is no base to compare with.
export function formatPercentChange(current: number, previous: number): string {
  const change = percentChange(current, previous);
  if (change === null) return "—";
  return `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}%`;
}

// yyyy-mm-dd as "6 Apr 2026". Built in UTC so the day never shifts with the
// viewer's time zone.
export function formatUkDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
