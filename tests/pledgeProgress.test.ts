import { describe, expect, it } from "vitest";
import {
  automaticPledgeStatus,
  countPledgeInstalments,
  pledgeFulfillmentTarget,
} from "../lib/pledgeProgress";

describe("pledge fulfilment target", () => {
  it("completes a one-off pledge at its amount", () => {
    expect(
      pledgeFulfillmentTarget({
        amount: 150,
        frequency: "One-off",
        startDate: "2026-01-01",
      })
    ).toBe(150);
  });

  it("does not auto-complete an open-ended monthly pledge", () => {
    expect(
      pledgeFulfillmentTarget({
        amount: 150,
        frequency: "Monthly",
        startDate: "2026-01-01",
      })
    ).toBeNull();
  });

  it("counts every month from the start through the end date", () => {
    expect(countPledgeInstalments("Monthly", "2026-01-15", "2026-03-01")).toBe(3);
    expect(
      pledgeFulfillmentTarget({
        amount: 100,
        frequency: "Monthly",
        startDate: "2026-01-15",
        endDate: "2026-03-01",
      })
    ).toBe(300);
  });

  it("counts weekly and annual windows inclusively", () => {
    expect(countPledgeInstalments("Weekly", "2026-01-01", "2026-01-15")).toBe(3);
    expect(countPledgeInstalments("Annual", "2024-04-06", "2026-04-05")).toBe(3);
  });
});

describe("automatic pledge status", () => {
  const openEnded = {
    status: "Active" as const,
    amount: 50,
    frequency: "Monthly" as const,
    startDate: "2026-01-01",
  };

  it("leaves an open-ended pledge unchanged even after receipts pass one instalment", () => {
    expect(automaticPledgeStatus(openEnded, 500)).toBeNull();
  });

  it("does not reopen an explicit completion", () => {
    expect(
      automaticPledgeStatus(
        { ...openEnded, status: "Completed", completionOverride: true },
        0
      )
    ).toBeNull();
    expect(
      automaticPledgeStatus(
        {
          status: "Completed",
          completionOverride: true,
          amount: 100,
          frequency: "One-off",
          startDate: "2026-01-01",
        },
        0
      )
    ).toBeNull();
  });

  it("reopens an automatic completion when the target is no longer met", () => {
    expect(
      automaticPledgeStatus(
        {
          status: "Completed",
          amount: 100,
          frequency: "One-off",
          startDate: "2026-01-01",
        },
        40
      )
    ).toBe("Active");
  });

  it("completes a one-off pledge once the amount is received", () => {
    expect(
      automaticPledgeStatus(
        {
          status: "Active",
          amount: 100,
          frequency: "One-off",
          startDate: "2026-01-01",
        },
        100
      )
    ).toBe("Completed");
  });
});
