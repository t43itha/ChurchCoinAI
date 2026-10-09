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

const LONG_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const SHORT_MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

function fromIso(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function toIso(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function monthLabel(time: number): string {
  return SHORT_MONTH.format(time).replace("Sept", "Sep");
}

function buildPeriod(label: string, range: DateRange, today: string): ReportPeriod {
  const buckets = monthBuckets(range);
  const throughDate =
    today < range.startDate ? range.startDate : today > range.endDate ? range.endDate : today;
  const hasStarted = today >= range.startDate;

  return {
    startDate: range.startDate,
    endDate: range.endDate,
    label,
    throughDate,
    isComplete: today > range.endDate,
    monthsElapsed: hasStarted
      ? buckets.filter((bucket) => bucket.startDate <= throughDate).length
      : 0,
    monthsTotal: buckets.length,
  };
}

// month is 0-indexed (0 = January).
export function monthPeriod(year: number, month: number, today: string): ReportPeriod {
  const range = {
    startDate: toIso(Date.UTC(year, month, 1)),
    endDate: toIso(Date.UTC(year, month + 1, 0)),
  };
  return buildPeriod(LONG_MONTH_YEAR.format(Date.UTC(year, month, 1)), range, today);
}

// UK tax year: 6 April startYear to 5 April startYear + 1, labelled "2026/27".
// Calendar year: 1 January to 31 December startYear, labelled "2026".
export function financialYearPeriod(
  startYear: number,
  reportingPeriod: ReportingPeriod,
  today: string
): ReportPeriod {
  if (reportingPeriod === "calendar_year") {
    return buildPeriod(
      String(startYear),
      { startDate: `${startYear}-01-01`, endDate: `${startYear}-12-31` },
      today
    );
  }

  const endYear = startYear + 1;
  return buildPeriod(
    `${startYear}/${String(endYear % 100).padStart(2, "0")}`,
    { startDate: `${startYear}-04-06`, endDate: `${endYear}-04-05` },
    today
  );
}

// The start year of the financial year containing `date`.
export function financialYearStartFor(date: string, reportingPeriod: ReportingPeriod): number {
  const year = Number(date.slice(0, 4));
  if (reportingPeriod === "calendar_year") return year;
  return date >= `${year}-04-06` ? year : year - 1;
}

// Moves both ends by whole years. 29 February becomes 28 February.
export function shiftRangeByYears(range: DateRange, years: number): DateRange {
  const shift = (iso: string): string => {
    const [year, month, day] = iso.split("-").map(Number);
    const targetYear = year + years;
    const targetDay = month === 2 && day === 29 && !isLeapYear(targetYear) ? 28 : day;
    return toIso(Date.UTC(targetYear, month - 1, targetDay));
  };
  return { startDate: shift(range.startDate), endDate: shift(range.endDate) };
}

// The same elapsed span one year earlier: startDate..throughDate shifted back a
// year. For a finished period this is the whole prior period.
export function likeForLikePrior(period: ReportPeriod): DateRange {
  return shiftRangeByYears({ startDate: period.startDate, endDate: period.throughDate }, -1);
}

// One bucket per calendar month, starting at the period's first day. A tax year
// gives 12 buckets: Apr (6-30 Apr) ... Mar, and the final bucket also absorbs
// the trailing 1-5 April so every day of the period belongs to exactly one bucket.
export function monthBuckets(range: DateRange): MonthBucket[] {
  const start = new Date(fromIso(range.startDate));
  const endTime = fromIso(range.endDate);
  const end = new Date(endTime);
  const startYear = start.getUTCFullYear();
  const startMonth = start.getUTCMonth();
  const monthCount =
    (end.getUTCFullYear() - startYear) * 12 + (end.getUTCMonth() - startMonth) + 1;
  const endsPartialMonth = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0) !== endTime;
  const bucketCount = monthCount > 12 && endsPartialMonth ? monthCount - 1 : monthCount;

  return Array.from({ length: bucketCount }, (_, index) => {
    const firstOfMonth = Date.UTC(startYear, startMonth + index, 1);
    const lastOfMonth = Date.UTC(startYear, startMonth + index + 1, 0);
    return {
      startDate: index === 0 ? range.startDate : toIso(firstOfMonth),
      endDate: index === bucketCount - 1 ? range.endDate : toIso(lastOfMonth),
      label: monthLabel(firstOfMonth),
    };
  });
}

export function isWithinRange(date: string, range: DateRange): boolean {
  return date >= range.startDate && date <= range.endDate;
}
