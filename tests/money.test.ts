import { describe, expect, it } from "vitest";
import { meetsMoneyTarget, roundMoney } from "../convex/lib/money";

describe("roundMoney", () => {
  it("rounds to two decimal places", () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
    expect(roundMoney(99.999)).toBe(100);
  });

  it("normalises float arithmetic artefacts", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1.1 + 2.2)).toBe(3.3);
  });

  it("leaves clean amounts unchanged", () => {
    expect(roundMoney(25)).toBe(25);
    expect(roundMoney(19.99)).toBe(19.99);
  });
});

describe("meetsMoneyTarget", () => {
  it("treats float drift just below the target as met", () => {
    // 10 × £0.10 summed as floats is 0.9999999999999999, not 1
    const total = Array(10).fill(0.1).reduce((sum, x) => sum + x, 0);
    expect(total).toBeLessThan(1);
    expect(meetsMoneyTarget(total, 1)).toBe(true);
  });

  it("is met at or above the target", () => {
    expect(meetsMoneyTarget(100, 100)).toBe(true);
    expect(meetsMoneyTarget(100.01, 100)).toBe(true);
  });

  it("is not met when genuinely short", () => {
    expect(meetsMoneyTarget(99.99, 100)).toBe(false);
    expect(meetsMoneyTarget(0, 100)).toBe(false);
  });
});
