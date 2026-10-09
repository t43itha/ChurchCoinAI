import { describe, it, expect } from "vitest";
import {
  toPence,
  computeClearedSplitPence,
  computeClearedTotalPence,
  computeDifferencePence,
  canCompleteSession,
  parseBalance,
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

describe("computeClearedSplitPence", () => {
  it("splits cleared lines into money in and money out, both positive", () => {
    const cleared = [tx(100, "Income"), tx(40.5, "Expenditure"), tx(25.1, "Income")];
    expect(computeClearedSplitPence(cleared)).toEqual({ inPence: 12510, outPence: 4050 });
  });
  it("is zero on both sides for no lines", () => {
    expect(computeClearedSplitPence([])).toEqual({ inPence: 0, outPence: 0 });
  });
  it("agrees with the signed total", () => {
    const cleared = [tx(0.1, "Income"), tx(0.2, "Expenditure")];
    const { inPence, outPence } = computeClearedSplitPence(cleared);
    expect(inPence - outPence).toBe(computeClearedTotalPence(cleared));
  });
});

describe("parseBalance", () => {
  it("reads a typed balance in pounds, including negatives", () => {
    expect(parseBalance("1250.40")).toBe(1250.4);
    expect(parseBalance("-35")).toBe(-35);
  });
  it("returns null for text that is not a number", () => {
    expect(parseBalance("")).toBeNull();
    expect(parseBalance("abc")).toBeNull();
  });
  it("reads the whole amount as typed on a statement, with a £ sign or thousands separators", () => {
    expect(parseBalance("£1,250.40")).toBe(1250.4);
    expect(parseBalance(" 1,250.40 ")).toBe(1250.4);
    expect(parseBalance("-£35.5")).toBe(-35.5);
  });
  it("rejects partial numbers instead of reading their first digits", () => {
    expect(parseBalance("12abc")).toBeNull();
    expect(parseBalance("1.2.3")).toBeNull();
    expect(parseBalance("1.234")).toBeNull();
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
    expect(computeDifferencePence(1000, 1400, cleared)).toBe(10000); // ledger shows £100 more than statement closing balance
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
