import { describe, expect, it } from "vitest";
import {
  calculateDefaultSyncRange,
  isPendingStateExpired,
  normalizeEnableBankingTransaction,
} from "../convex/lib/bankConnectionUtils";

describe("bank connection utils", () => {
  it("uses the day after lastSyncedThrough as the next sync start", () => {
    expect(
      calculateDefaultSyncRange({
        today: "2026-05-14",
        lastSyncedThrough: "2026-05-10",
      })
    ).toEqual({
      dateFrom: "2026-05-11",
      dateTo: "2026-05-14",
    });
  });

  it("falls back to the last 30 days for a new connection", () => {
    expect(
      calculateDefaultSyncRange({
        today: "2026-05-14",
      })
    ).toEqual({
      dateFrom: "2026-04-14",
      dateTo: "2026-05-14",
    });
  });

  it("detects expired pending connection state", () => {
    expect(isPendingStateExpired(1000, 1000)).toBe(true);
    expect(isPendingStateExpired(999, 1000)).toBe(false);
  });

  it("normalizes a credit transaction as income", () => {
    const normalized = normalizeEnableBankingTransaction({
      transaction: {
        entry_reference: "credit-1",
        booking_date: "2026-05-13",
        credit_debit_indicator: "CRDT",
        amount: { amount: "125.50", currency: "GBP" },
        remittance_information: "Sunday giving",
      },
      accountId: "account-1",
      accountName: "Metro Current",
      fundId: "fund-1",
    });

    expect(normalized).toEqual({
      date: "2026-05-13",
      description: "Sunday giving",
      amount: 125.5,
      type: "Income",
      accountId: "account-1",
      accountName: "Metro Current",
      fundId: "fund-1",
      providerTransactionId: "credit-1",
    });
  });

  it("normalizes a debit transaction as expenditure", () => {
    const normalized = normalizeEnableBankingTransaction({
      transaction: {
        transaction_id: "debit-1",
        value_date: "2026-05-12",
        credit_debit_indicator: "DBIT",
        transaction_amount: { amount: "49.99", currency: "GBP" },
        remittance_information: ["Stationery", "Invoice 123"],
      },
      accountId: "account-1",
      accountName: "Metro Current",
      fundId: null,
    });

    expect(normalized).toEqual({
      date: "2026-05-12",
      description: "Stationery Invoice 123",
      amount: 49.99,
      type: "Expenditure",
      accountId: "account-1",
      accountName: "Metro Current",
      fundId: null,
      providerTransactionId: "debit-1",
    });
  });

  it("rejects transactions without a usable date", () => {
    expect(() =>
      normalizeEnableBankingTransaction({
        transaction: {
          entry_reference: "missing-date",
          credit_debit_indicator: "CRDT",
          amount: { amount: "10.00", currency: "GBP" },
        },
        accountId: "account-1",
        accountName: "Metro Current",
        fundId: null,
      })
    ).toThrow("Enable Banking transaction is missing a date");
  });
});
