// Pure helpers shared by the report PDF and Excel exports: fund statement
// grouping, change labels and dates. Money totals use sumMoney.
import type { CategoryGroup, ReportComparison } from "../types";
import {
  isUnrestrictedFund,
  percentChange,
  type FundStatement,
  type FundStatementTotals,
} from "../lib/reportSummary";
import type { DateRange, ReportPeriod } from "../lib/reportPeriods";

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

// Short month of a yyyy-mm-dd date: "Oct". Built in UTC; "Sept" is shortened to
// "Sep" to match the rest of the reports.
function shortMonth(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day))
    .toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })
    .replace("Sept", "Sep");
}

// Day and short month of a yyyy-mm-dd date: "1 Oct".
function formatDayMonth(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${shortMonth(iso)}`;
}

// "1 Oct – 9 Oct 2026". The year is shown once when both ends share it.
export function formatDateRange(range: DateRange): string {
  const sameYear = range.startDate.slice(0, 4) === range.endDate.slice(0, 4);
  return sameYear
    ? `${formatDayMonth(range.startDate)} – ${formatUkDate(range.endDate)}`
    : `${formatUkDate(range.startDate)} – ${formatUkDate(range.endDate)}`;
}

// A comparison's label, with its dates when it does not cover the whole month
// it names: "September 2026" for a finished month, "September 2026 (1–9 Sep)"
// when only the first nine days are compared.
export function comparisonLabel(comparison: ReportComparison): string {
  const { label, range } = comparison;
  const [year, month, startDay] = range.startDate.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDay = Number(range.endDate.slice(8, 10));
  if (startDay === 1 && endDay === lastDay) return label;

  const sameMonth = range.startDate.slice(0, 7) === range.endDate.slice(0, 7);
  const dates = sameMonth
    ? `${startDay}–${endDay} ${shortMonth(range.endDate)}`
    : `${formatDayMonth(range.startDate)} – ${formatDayMonth(range.endDate)}`;
  return `${label} (${dates})`;
}

// "In progress: 1 Oct – 9 Oct 2026" for a period that has not finished, else null.
export function inProgressLine(period: ReportPeriod): string | null {
  if (period.isComplete) return null;
  return `In progress: ${formatDateRange({ startDate: period.startDate, endDate: period.throughDate })}`;
}
