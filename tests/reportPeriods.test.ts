import { describe, expect, it } from "vitest";
import {
  clipToElapsedDays,
  financialYearPeriod,
  financialYearStartFor,
  likeForLikePrior,
  monthBuckets,
  monthPeriod,
  shiftRangeByYears,
} from "../lib/reportPeriods";

describe("financialYearStartFor", () => {
  it("switches the tax year on 6 April, not 5 April", () => {
    expect(financialYearStartFor("2026-04-05", "tax_year")).toBe(2025);
    expect(financialYearStartFor("2026-04-06", "tax_year")).toBe(2026);
    expect(financialYearStartFor("2026-01-01", "tax_year")).toBe(2025);
  });

  it("uses the calendar year for calendar_year", () => {
    expect(financialYearStartFor("2026-01-01", "calendar_year")).toBe(2026);
    expect(financialYearStartFor("2026-12-31", "calendar_year")).toBe(2026);
  });
});

describe("financialYearPeriod", () => {
  it("builds a tax year with a two-digit label", () => {
    const period = financialYearPeriod(2026, "tax_year", "2026-10-09");
    expect(period).toMatchObject({
      startDate: "2026-04-06",
      endDate: "2027-04-05",
      label: "2026/27",
      monthsTotal: 12,
    });
  });

  it("zero-pads the two-digit label across a century", () => {
    expect(financialYearPeriod(2099, "tax_year", "2099-06-01").label).toBe("2099/00");
  });

  it("builds a calendar year", () => {
    const period = financialYearPeriod(2026, "calendar_year", "2026-03-15");
    expect(period).toMatchObject({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      label: "2026",
      monthsTotal: 12,
    });
  });

  it("reports an in-progress period through today", () => {
    const period = financialYearPeriod(2026, "tax_year", "2026-10-09");
    expect(period.throughDate).toBe("2026-10-09");
    expect(period.isComplete).toBe(false);
    // Apr, May, Jun, Jul, Aug, Sep and Oct have started.
    expect(period.monthsElapsed).toBe(7);
  });

  it("reports a finished period through its end date", () => {
    const period = financialYearPeriod(2025, "tax_year", "2026-10-09");
    expect(period.throughDate).toBe("2026-04-05");
    expect(period.isComplete).toBe(true);
    expect(period.monthsElapsed).toBe(12);
  });

  it("reports a period that has not started from its start date with no months elapsed", () => {
    const period = financialYearPeriod(2027, "tax_year", "2026-10-09");
    expect(period.throughDate).toBe("2027-04-06");
    expect(period.isComplete).toBe(false);
    expect(period.monthsElapsed).toBe(0);
  });

  it("treats the last day of the period as complete", () => {
    const period = financialYearPeriod(2025, "tax_year", "2026-04-05");
    expect(period.isComplete).toBe(false);
    expect(financialYearPeriod(2025, "tax_year", "2026-04-06").isComplete).toBe(true);
  });
});

describe("monthPeriod", () => {
  it("covers the whole calendar month with a long label", () => {
    expect(monthPeriod(2026, 8, "2026-10-09")).toMatchObject({
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      label: "September 2026",
      throughDate: "2026-09-30",
      isComplete: true,
      monthsElapsed: 1,
      monthsTotal: 1,
    });
  });

  it("ends on the 29th in a leap February", () => {
    expect(monthPeriod(2024, 1, "2024-03-01").endDate).toBe("2024-02-29");
  });
});

describe("monthBuckets", () => {
  it("splits a tax year into 12 buckets with the trailing April days in March", () => {
    const buckets = monthBuckets({ startDate: "2026-04-06", endDate: "2027-04-05" });
    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toEqual({ startDate: "2026-04-06", endDate: "2026-04-30", label: "Apr" });
    expect(buckets[1]).toEqual({ startDate: "2026-05-01", endDate: "2026-05-31", label: "May" });
    expect(buckets[10]).toEqual({ startDate: "2027-02-01", endDate: "2027-02-28", label: "Feb" });
    expect(buckets[11]).toEqual({ startDate: "2027-03-01", endDate: "2027-04-05", label: "Mar" });
  });

  it("splits a calendar year into 12 buckets", () => {
    const buckets = monthBuckets({ startDate: "2026-01-01", endDate: "2026-12-31" });
    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toEqual({ startDate: "2026-01-01", endDate: "2026-01-31", label: "Jan" });
    expect(buckets[11]).toEqual({ startDate: "2026-12-01", endDate: "2026-12-31", label: "Dec" });
  });

  it("keeps buckets contiguous so every day belongs to exactly one bucket", () => {
    const buckets = monthBuckets({ startDate: "2026-04-06", endDate: "2027-04-05" });
    for (let index = 1; index < buckets.length; index++) {
      const previousEnd = new Date(`${buckets[index - 1].endDate}T00:00:00Z`);
      previousEnd.setUTCDate(previousEnd.getUTCDate() + 1);
      expect(buckets[index].startDate).toBe(previousEnd.toISOString().slice(0, 10));
    }
  });

  it("gives a single bucket for a range inside one month", () => {
    expect(monthBuckets({ startDate: "2026-02-01", endDate: "2026-02-14" })).toEqual([
      { startDate: "2026-02-01", endDate: "2026-02-14", label: "Feb" },
    ]);
  });

  it("keeps a short trailing month as its own bucket when the total does not exceed 12", () => {
    expect(monthBuckets({ startDate: "2026-01-01", endDate: "2026-02-05" })).toEqual([
      { startDate: "2026-01-01", endDate: "2026-01-31", label: "Jan" },
      { startDate: "2026-02-01", endDate: "2026-02-05", label: "Feb" },
    ]);
  });
});

describe("shiftRangeByYears", () => {
  it("moves both ends by whole years", () => {
    expect(shiftRangeByYears({ startDate: "2026-04-06", endDate: "2026-10-09" }, -1)).toEqual({
      startDate: "2025-04-06",
      endDate: "2025-10-09",
    });
  });

  it("turns 29 February into 28 February in a non-leap year", () => {
    expect(shiftRangeByYears({ startDate: "2024-02-29", endDate: "2024-02-29" }, -1)).toEqual({
      startDate: "2023-02-28",
      endDate: "2023-02-28",
    });
  });

  it("keeps 29 February when the target year is leap", () => {
    expect(shiftRangeByYears({ startDate: "2024-02-29", endDate: "2024-03-01" }, 4)).toEqual({
      startDate: "2028-02-29",
      endDate: "2028-03-01",
    });
  });
});

describe("likeForLikePrior", () => {
  it("compares the elapsed part of an in-progress year with the same span last year", () => {
    const period = financialYearPeriod(2026, "tax_year", "2026-10-09");
    expect(likeForLikePrior(period)).toEqual({
      startDate: "2025-04-06",
      endDate: "2025-10-09",
    });
  });

  it("returns the whole prior period for a finished year", () => {
    const period = financialYearPeriod(2025, "tax_year", "2026-10-09");
    expect(likeForLikePrior(period)).toEqual({
      startDate: "2024-04-06",
      endDate: "2025-04-05",
    });
  });
});

describe("clipToElapsedDays", () => {
  it("cuts a comparison month to the days an in-progress month has run", () => {
    const october = monthPeriod(2026, 9, "2026-10-08");
    expect(clipToElapsedDays(monthPeriod(2026, 8, "2026-10-08"), october)).toEqual({
      startDate: "2026-09-01",
      endDate: "2026-09-08",
    });
  });

  it("never runs past a shorter comparison month", () => {
    const march = monthPeriod(2026, 2, "2026-03-31");
    const elapsedMarch = { ...march, isComplete: false, throughDate: "2026-03-30" };
    expect(clipToElapsedDays(monthPeriod(2026, 1, "2026-03-31"), elapsedMarch)).toEqual({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });
  });

  it("leaves a finished period's comparison whole", () => {
    const september = monthPeriod(2026, 8, "2026-10-08");
    expect(clipToElapsedDays(monthPeriod(2026, 7, "2026-10-08"), september)).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
  });
});
