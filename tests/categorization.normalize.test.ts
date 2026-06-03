import { describe, expect, it } from "vitest";
import {
  amountBucket,
  normalizeDescription,
  normalizeTransaction,
} from "../convex/intelligence/categorization/normalize";

describe("transaction normalization", () => {
  it("normalizes common bank noise and punctuation", () => {
    expect(normalizeDescription("FT-J SMITH   TITHE Ref: 1234")).toBe(
      "j smith tithe"
    );
  });

  it("uses exact amount buckets for expenses", () => {
    expect(amountBucket(12.5, "Expenditure")).toBe("exact:12.50");
  });

  it("uses rounded amount buckets for income", () => {
    expect(amountBucket(102.49, "Income")).toBe("band:100");
    expect(amountBucket(107.5, "Income")).toBe("band:110");
  });

  it("creates type-safe deterministic signatures", () => {
    const normalized = normalizeTransaction({
      description: "Standing Order - J Smith Tithe",
      amount: 100,
      type: "Income",
    });

    expect(normalized.signature).toBe("Income:j smith tithe:band:100");
    expect(normalized.tokens).toContain("smith");
  });
});
