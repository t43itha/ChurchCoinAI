import { describe, expect, it } from "vitest";
import {
  filterActiveTransactions,
  isActiveTransaction,
  sumActiveIncome,
  sumActiveSigned,
} from "../lib/voidedTransactions";

const transactions = [
  { amount: 100, type: "Income" as const },
  { amount: 40, type: "Income" as const, isVoided: true },
  { amount: 25, type: "Expenditure" as const },
  { amount: 10, type: "Expenditure" as const, isVoided: true },
];

describe("voided transaction helpers", () => {
  it("treats only explicitly voided transactions as inactive", () => {
    expect(isActiveTransaction({ isVoided: true })).toBe(false);
    expect(isActiveTransaction({ isVoided: false })).toBe(true);
    expect(isActiveTransaction({})).toBe(true);
  });

  it("filters explicitly voided transactions out of active calculations", () => {
    expect(filterActiveTransactions(transactions)).toEqual([
      transactions[0],
      transactions[2],
    ]);
  });

  it("sums only active income transactions", () => {
    expect(sumActiveIncome(transactions)).toBe(100);
  });

  it("sums active income as positive and active expenditure as negative", () => {
    expect(sumActiveSigned(transactions)).toBe(75);
  });
});
