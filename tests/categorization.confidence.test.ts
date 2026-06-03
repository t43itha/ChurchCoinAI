import { describe, expect, it } from "vitest";
import {
  confidenceLabel,
  defaultConfidenceForSource,
  isHighConfidence,
} from "../convex/intelligence/categorization/confidence";

describe("categorization confidence helpers", () => {
  it("maps numeric confidence to labels", () => {
    expect(confidenceLabel(0.95)).toBe("High");
    expect(confidenceLabel(0.85)).toBe("High");
    expect(confidenceLabel(0.7)).toBe("Medium");
    expect(confidenceLabel(0.64)).toBe("Low");
  });

  it("identifies high confidence suggestions", () => {
    expect(isHighConfidence(0.9)).toBe(true);
    expect(isHighConfidence(0.849)).toBe(false);
  });

  it("assigns conservative source defaults", () => {
    expect(defaultConfidenceForSource("memory")).toBe(0.95);
    expect(defaultConfidenceForSource("rule")).toBe(0.9);
    expect(defaultConfidenceForSource("rag")).toBe(0.86);
    expect(defaultConfidenceForSource("gemini")).toBe(0.72);
    expect(defaultConfidenceForSource("none")).toBe(0);
  });
});
