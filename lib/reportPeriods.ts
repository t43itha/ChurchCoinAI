// Report periods: a calendar month, or a financial year that follows the
// organisation's reporting period. Dates are ISO yyyy-mm-dd strings and every
// range is inclusive at both ends. All date maths is UTC.

export type ReportingPeriod = "tax_year" | "calendar_year";

export type DateRange = {
  startDate: string;
  endDate: string;
};

export type ReportPeriod = DateRange & {
  // "September 2026", "2026" or "2026/27".
  label: string;
  // The last day the figures can cover: today while the period is in progress,
  // endDate once it has finished, startDate when it has not started.
  throughDate: string;
  isComplete: boolean;
  // Month buckets (see monthBuckets) with at least one day on or before throughDate.
  monthsElapsed: number;
  monthsTotal: number;
};

export type MonthBucket = DateRange & {
  // Short month name of the bucket's first day: "Apr".
  label: string;
};

// month is 0-indexed (0 = January).
export function monthPeriod(year: number, month: number, today: string): ReportPeriod {
  throw new Error("not implemented");
}

// UK tax year: 6 April startYear to 5 April startYear + 1, labelled "2026/27".
// Calendar year: 1 January to 31 December startYear, labelled "2026".
export function financialYearPeriod(
  startYear: number,
  reportingPeriod: ReportingPeriod,
  today: string
): ReportPeriod {
  throw new Error("not implemented");
}

// The start year of the financial year containing `date`.
export function financialYearStartFor(date: string, reportingPeriod: ReportingPeriod): number {
  throw new Error("not implemented");
}

// Moves both ends by whole years. 29 February becomes 28 February.
export function shiftRangeByYears(range: DateRange, years: number): DateRange {
  throw new Error("not implemented");
}

// The same elapsed span one year earlier: startDate..throughDate shifted back a
// year. For a finished period this is the whole prior period.
export function likeForLikePrior(period: ReportPeriod): DateRange {
  throw new Error("not implemented");
}

// One bucket per calendar month, starting at the period's first day. A tax year
// gives 12 buckets: Apr (6-30 Apr) ... Mar, and the final bucket also absorbs
// the trailing 1-5 April so every day of the period belongs to exactly one bucket.
export function monthBuckets(range: DateRange): MonthBucket[] {
  throw new Error("not implemented");
}

export function isWithinRange(date: string, range: DateRange): boolean {
  return date >= range.startDate && date <= range.endDate;
}
