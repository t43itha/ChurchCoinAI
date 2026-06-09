import { describe, it, expect } from "vitest";
import {
  toPence,
  computeClearedTotalPence,
  computeDifferencePence,
  canCompleteSession,
} from "../lib/reconciliation";

const tx = (amount: number, type: "Income" | "Expenditure") => ({ amount, type });

describe("toPence", () => {
  it("converts pounds to integer pence", () => {
    expect(toPence(10.5)).toBe(1050);
  });
  it("handles float artifacts", () => {
    expect(toPence(0.1 + 0.2)).toBe(30);
  });
  it("handles negatives", () => {
    expect(toPence(-5.25)).toBe(-525);
  });
});

describe("computeClearedTotalPence", () => {
  it("sums income minus expenditure", () => {
    const cleared = [tx(100, "Income"), tx(40.5, "Expenditure"), tx(25, "Income")];
    expect(computeClearedTotalPence(cleared)).toBe(8450); // 100 + 25 - 40.50
  });
  it("returns 0 for empty list", () => {
    expect(computeClearedTotalPence([])).toBe(0);
  });
});

describe("computeDifferencePence", () => {
  // difference = (opening + cleared movement) - closing
  it("is zero when statement balances", () => {
    const cleared = [tx(500, "Income"), tx(200, "Expenditure")];
    expect(computeDifferencePence(1000, 1300, cleared)).toBe(0);
  });
  it("is positive when ledger has more than statement", () => {
    const cleared = [tx(500, "Income")];
    expect(computeDifferencePence(1000, 1400, cleared)).toBe(10000); // £100 over
  });
  it("is negative when items are missing from ledger", () => {
    expect(computeDifferencePence(1000, 1100, [])).toBe(-10000);
  });
  it("survives float-unfriendly amounts", () => {
    const cleared = [tx(0.1, "Income"), tx(0.2, "Income")];
    expect(computeDifferencePence(0, 0.3, cleared)).toBe(0);
  });
});

describe("canCompleteSession", () => {
  it("allows completion only at exactly zero difference", () => {
    expect(canCompleteSession(0)).toBe(true);
    expect(canCompleteSession(1)).toBe(false);
    expect(canCompleteSession(-1)).toBe(false);
  });
});
