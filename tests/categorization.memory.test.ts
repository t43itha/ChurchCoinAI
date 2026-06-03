import { describe, expect, it } from "vitest";
import {
  confidenceFromCounts,
  shouldUseMemorySuggestion,
} from "../convex/intelligence/categorization/memory";

describe("categorization memory helpers", () => {
  it("increases confidence with accepted examples", () => {
    expect(confidenceFromCounts(1, 0)).toBe(0.86);
    expect(confidenceFromCounts(3, 0)).toBe(0.93);
    expect(confidenceFromCounts(5, 0)).toBe(0.95);
  });

  it("penalizes corrections", () => {
    expect(confidenceFromCounts(5, 2)).toBeLessThan(0.95);
  });

  it("caps correction penalties at the effective minimum", () => {
    expect(confidenceFromCounts(5, 4)).toBe(0.63);
    expect(confidenceFromCounts(5, 99)).toBe(0.63);
  });

  it("uses only strong memory records", () => {
    expect(shouldUseMemorySuggestion({ acceptedCount: 3, confidence: 0.93 })).toBe(true);
    expect(shouldUseMemorySuggestion({ acceptedCount: 1, confidence: 0.86 })).toBe(false);
  });

  it("requires confidence at the memory suggestion threshold", () => {
    expect(shouldUseMemorySuggestion({ acceptedCount: 3, confidence: 0.9 })).toBe(true);
    expect(shouldUseMemorySuggestion({ acceptedCount: 3, confidence: 0.89 })).toBe(false);
  });
});
