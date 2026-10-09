import { describe, expect, it } from "vitest";
import { gapPounds, monthName, periodLabel } from "../components/reconcile/format";
import {
  RAIL_ORDER,
  hasPendingEdits,
  holdsUnsavedEdits,
  previousMonthRange,
  previousStepFor,
  railStateFor,
  resolveStep,
  startStepFor,
} from "../components/reconcile/steps";

describe("hasPendingEdits", () => {
  const saved = { fundId: "fund-general", periodStart: "2026-03-01", periodEnd: "2026-03-31", opening: "1000", closing: "1300" };

  it("has nothing pending when no value has been typed", () => {
    expect(hasPendingEdits({}, saved)).toBe(false);
  });

  it("treats a value typed back to the saved one as not pending", () => {
    expect(hasPendingEdits({ closing: "1300" }, saved)).toBe(false);
    expect(hasPendingEdits({ closing: undefined }, saved)).toBe(false);
  });

  it("reports a changed closing balance or period as pending", () => {
    expect(hasPendingEdits({ closing: "1450" }, saved)).toBe(true);
    expect(hasPendingEdits({ periodEnd: "2026-03-30" }, saved)).toBe(true);
  });

  it("reports a pending edit alongside values that match the saved session", () => {
    expect(hasPendingEdits({ opening: "1000", closing: "1450" }, saved)).toBe(true);
  });
});

describe("holdsUnsavedEdits", () => {
  it("is true only for the account and balances steps, whose edits are saved by their Next button", () => {
    expect(holdsUnsavedEdits("account")).toBe(true);
    expect(holdsUnsavedEdits("balances")).toBe(true);
    expect(holdsUnsavedEdits("tick")).toBe(false);
    expect(holdsUnsavedEdits("finish")).toBe(false);
    expect(holdsUnsavedEdits("done")).toBe(false);
  });
});

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

describe("resolveStep", () => {
  it("keeps the position the user picked", () => {
    expect(resolveStep("tick", "draft")).toBe("tick");
    expect(resolveStep("balances", "completed")).toBe("balances");
  });

  it("opens a completed session on its summary when nothing was picked", () => {
    expect(resolveStep(null, "completed")).toBe("done");
  });

  it("falls back to where an open session opens if a stale summary position is left behind", () => {
    expect(resolveStep("done", "reopened")).toBe("tick");
    expect(resolveStep("done", "draft")).toBe("tick");
  });
});

describe("previousStepFor", () => {
  it("steps back one rail item for an open session", () => {
    expect(previousStepFor("finish", false)).toBe("tick");
    expect(previousStepFor("balances", false)).toBe("account");
    expect(previousStepFor("account", false)).toBeUndefined();
  });

  it("walks a completed session back to its summary rather than the locked account step", () => {
    expect(previousStepFor("finish", true)).toBe("tick");
    expect(previousStepFor("tick", true)).toBe("balances");
    expect(previousStepFor("balances", true)).toBe("done");
  });

  it("has no step before the summary", () => {
    expect(previousStepFor("done", true)).toBeUndefined();
    expect(previousStepFor("done", false)).toBeUndefined();
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
