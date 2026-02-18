import { describe, expect, it } from "vitest";
import {
  assertValidTransactionAmount,
  assertValidTransactionDate,
} from "../convex/lib/transactionValidation";

describe("transaction validation", () => {
  it("accepts positive finite amounts", () => {
    expect(() => assertValidTransactionAmount(1)).not.toThrow();
    expect(() => assertValidTransactionAmount(100.5)).not.toThrow();
  });

  it("rejects zero, negative, and non-finite amounts", () => {
    expect(() => assertValidTransactionAmount(0)).toThrow(
      "Transaction amount must be greater than 0"
    );
    expect(() => assertValidTransactionAmount(-20)).toThrow(
      "Transaction amount must be greater than 0"
    );
    expect(() => assertValidTransactionAmount(Number.NaN)).toThrow(
      "Transaction amount must be greater than 0"
    );
  });

  it("accepts valid date format", () => {
    expect(() => assertValidTransactionDate("2026-02-18")).not.toThrow();
  });

  it("rejects invalid date formats", () => {
    expect(() => assertValidTransactionDate("18-02-2026")).toThrow(
      "Transaction date must use YYYY-MM-DD format"
    );
    expect(() => assertValidTransactionDate("2026/02/18")).toThrow(
      "Transaction date must use YYYY-MM-DD format"
    );
  });
});
