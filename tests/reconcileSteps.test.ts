import { describe, expect, it } from "vitest";
import { gapPounds, monthName, periodLabel } from "../components/reconcile/format";
import {
  RAIL_ORDER,
  previousMonthRange,
  railStateFor,
  startStepFor,
} from "../components/reconcile/steps";

describe("railStateFor", () => {
  it("marks steps before the current one as done, the current one as now, and later ones as to do", () => {
    expect(railStateFor("account", "balances")).toBe("done");
    expect(railStateFor("balances", "balances")).toBe("now");
    expect(railStateFor("tick", "balances")).toBe("todo");
    expect(railStateFor("finish", "balances")).toBe("todo");
  });

  it("marks every step done once the walkthrough reaches done", () => {
    for (const kind of RAIL_ORDER) {
      expect(railStateFor(kind, "done")).toBe("done");
    }
  });
});

describe("startStepFor", () => {
  it("opens a new reconciliation on the account step", () => {
    expect(startStepFor(null)).toBe("account");
  });

  it("opens a draft on the tick step", () => {
    expect(startStepFor("draft")).toBe("tick");
  });

  it("opens a reopened session on the tick step so it can be changed again", () => {
    expect(startStepFor("reopened")).toBe("tick");
  });

  it("opens a completed session on the done step", () => {
    expect(startStepFor("completed")).toBe("done");
  });
});

describe("previousMonthRange", () => {
  it("returns the whole calendar month before today", () => {
    expect(previousMonthRange("2026-10-09")).toEqual({ periodStart: "2026-09-01", periodEnd: "2026-09-30" });
  });

  it("goes back to December of the previous year in January", () => {
    expect(previousMonthRange("2026-01-15")).toEqual({ periodStart: "2025-12-01", periodEnd: "2025-12-31" });
  });

  it("ends February on the 29th in a leap year", () => {
    expect(previousMonthRange("2028-03-02")).toEqual({ periodStart: "2028-02-01", periodEnd: "2028-02-29" });
  });

  it("ends February on the 28th in a common year", () => {
    expect(previousMonthRange("2027-03-02")).toEqual({ periodStart: "2027-02-01", periodEnd: "2027-02-28" });
  });

  it("does not treat a century year as a leap year", () => {
    expect(previousMonthRange("2100-03-01")).toEqual({ periodStart: "2100-02-01", periodEnd: "2100-02-28" });
  });

  it("uses the date parts alone, so a month boundary is not shifted by timezone", () => {
    expect(previousMonthRange("2026-08-01")).toEqual({ periodStart: "2026-07-01", periodEnd: "2026-07-31" });
  });
});

describe("periodLabel", () => {
  // The month abbreviation comes from the runtime's en-GB locale data ("Sep" or "Sept"), so match either.
  it("gives one year for a period inside a single year", () => {
    expect(periodLabel("2026-09-01", "2026-09-30")).toMatch(/^1 Sept? – 30 Sept? 2026$/);
  });

  it("repeats the year on both ends when the period crosses a new year", () => {
    expect(periodLabel("2025-12-01", "2026-01-31")).toMatch(/^1 Dec 2025 – 31 Jan 2026$/);
  });
});

describe("monthName", () => {
  it("names the month of a period start", () => {
    expect(monthName("2026-09-01")).toBe("September");
  });
});

describe("gapPounds", () => {
  it("returns the size of the gap in pounds, without its direction", () => {
    expect(gapPounds(12550)).toBe(125.5);
    expect(gapPounds(-12550)).toBe(125.5);
    expect(gapPounds(0)).toBe(0);
  });
});
