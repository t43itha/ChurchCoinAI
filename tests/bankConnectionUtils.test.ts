import { describe, expect, it } from "vitest";
import {
  calculateDefaultSyncRange,
  isPendingStateExpired,
} from "../convex/lib/bankConnectionUtils";

describe("bank connection utils", () => {
  it("uses the day after lastSyncedThrough as the next sync start", () => {
    expect(
      calculateDefaultSyncRange({
        today: "2026-05-14",
        lastSyncedThrough: "2026-05-10",
      })
    ).toEqual({
      dateFrom: "2026-05-11",
      dateTo: "2026-05-14",
    });
  });

  it("falls back to the last 30 days for a new connection", () => {
    expect(calculateDefaultSyncRange({ today: "2026-05-14" })).toEqual({
      dateFrom: "2026-04-14",
      dateTo: "2026-05-14",
    });
  });

  it("detects expired pending connection state", () => {
    expect(isPendingStateExpired({ now: 1000, expiresAt: 1000 })).toBe(true);
    expect(isPendingStateExpired({ now: 999, expiresAt: 1000 })).toBe(false);
  });
});
