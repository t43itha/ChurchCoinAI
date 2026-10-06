import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  getTrialProgress,
  PRODUCT_TRIAL_DURATION_MS,
} from "../lib/trial";

const START = Date.UTC(2026, 7, 13, 9);
const END = START + PRODUCT_TRIAL_DURATION_MS;

describe("product trial display", () => {
  it("starts on day one with thirteen display days left", () => {
    const progress = getTrialProgress(END, START);
    expect(progress.dayNumber).toBe(1);
    expect(progress.daysLeft).toBe(13);
    expect(progress.progressPercent).toBeCloseTo(100 / 14);
    expect(progress.hasExpired).toBe(false);
  });

  it("advances once per elapsed 24-hour period", () => {
    const progress = getTrialProgress(END, START + 2 * DAY_MS + 1);
    expect(progress.dayNumber).toBe(3);
    expect(progress.daysLeft).toBe(11);
  });

  it("marks the exact server expiry boundary as expired", () => {
    const progress = getTrialProgress(END, END);
    expect(progress.dayNumber).toBe(14);
    expect(progress.daysLeft).toBe(0);
    expect(progress.progressPercent).toBe(100);
    expect(progress.hasExpired).toBe(true);
  });
});
