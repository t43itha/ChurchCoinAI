import { describe, expect, it } from "vitest";
import { getWeekEndingSunday } from "../lib/dateUtils";

describe("getWeekEndingSunday", () => {
  it("returns the following Sunday for a Friday service date during UK summer time", () => {
    expect(getWeekEndingSunday("2026-05-15")).toBe("2026-05-17");
  });

  it("keeps Sunday service dates as the same week ending date", () => {
    expect(getWeekEndingSunday("2026-05-17")).toBe("2026-05-17");
  });
});
