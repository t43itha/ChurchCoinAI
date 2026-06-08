import { describe, expect, it } from "vitest";
import {
  calculateDefaultSyncRange,
  isPendingStateExpired,
  normalizeEnableBankingTransaction,
  normalizeGoCardlessTransaction,
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
    expect(isPendingStateExpired({ now: 1000, expiresAt: 1000 })).toBe(true);
    expect(isPendingStateExpired({ now: 999, expiresAt: 1000 })).toBe(false);
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

  it("falls back to transaction sign when the credit debit indicator is missing", () => {
    const income = normalizeEnableBankingTransaction({
      transaction: {
        transaction_id: "signed-income-1",
        booking_date: "2026-05-12",
        amount: { amount: "-25.00", currency: "GBP" },
      },
      accountId: "account-1",
      accountName: "Metro Current",
      fundId: null,
    });

    const expenditure = normalizeEnableBankingTransaction({
      transaction: {
        transaction_id: "signed-expenditure-1",
        booking_date: "2026-05-12",
        amount: { amount: "25.00", currency: "GBP" },
      },
      accountId: "account-1",
      accountName: "Metro Current",
      fundId: null,
    });

    expect(income.type).toBe("Income");
    expect(income.amount).toBe(25);
    expect(expenditure.type).toBe("Expenditure");
    expect(expenditure.amount).toBe(25);
  });

  it("falls back to a default description for whitespace-only descriptions", () => {
    const normalized = normalizeEnableBankingTransaction({
      transaction: {
        transaction_id: "blank-description-1",
        booking_date: "2026-05-12",
        credit_debit_indicator: "CRDT",
        amount: { amount: "10.00", currency: "GBP" },
        remittance_information: "   ",
      },
      accountId: "account-1",
      accountName: "Metro Current",
      fundId: null,
    });

    expect(normalized.description).toBe("Bank transaction");
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

  it("rejects transactions with a malformed date", () => {
    expect(() =>
      normalizeEnableBankingTransaction({
        transaction: {
          entry_reference: "invalid-date",
          booking_date: "13/05/2026",
          credit_debit_indicator: "CRDT",
          amount: { amount: "10.00", currency: "GBP" },
        },
        accountId: "account-1",
        accountName: "Metro Current",
        fundId: null,
      })
    ).toThrow("Enable Banking transaction has an invalid date");
  });

  it("rejects transactions with malformed amount strings", () => {
    expect(() =>
      normalizeEnableBankingTransaction({
        transaction: {
          entry_reference: "malformed-amount",
          booking_date: "2026-05-13",
          credit_debit_indicator: "CRDT",
          amount: { amount: "12.34GBP", currency: "GBP" },
        },
        accountId: "account-1",
        accountName: "Metro Current",
        fundId: null,
      })
    ).toThrow("Enable Banking transaction has an invalid amount");
  });
});

describe("GoCardless transaction normalization", () => {
  it("normalizes a positive GoCardless amount as income", () => {
    const normalized = normalizeGoCardlessTransaction({
      transaction: {
        transactionId: "gc-income-1",
        bookingDate: "2026-06-01",
        transactionAmount: { amount: "125.50", currency: "GBP" },
        remittanceInformationUnstructured: "Sunday giving",
      },
      accountId: "account-1",
      accountName: "Metro Business Current",
      fundId: "fund-1",
    });

    expect(normalized).toEqual({
      date: "2026-06-01",
      description: "Sunday giving",
      amount: 125.5,
      type: "Income",
      accountId: "account-1",
      accountName: "Metro Business Current",
      fundId: "fund-1",
      providerTransactionId: "gc-income-1",
    });
  });

  it("normalizes a negative GoCardless amount as expenditure", () => {
    const normalized = normalizeGoCardlessTransaction({
      transaction: {
        transactionId: "gc-expense-1",
        valueDate: "2026-06-02",
        transactionAmount: { amount: "-49.99", currency: "GBP" },
        remittanceInformationUnstructuredArray: ["Stationery", "Invoice 123"],
      },
      accountId: "account-1",
      accountName: "Metro Business Current",
      fundId: null,
    });

    expect(normalized).toEqual({
      date: "2026-06-02",
      description: "Stationery Invoice 123",
      amount: 49.99,
      type: "Expenditure",
      accountId: "account-1",
      accountName: "Metro Business Current",
      fundId: null,
      providerTransactionId: "gc-expense-1",
    });
  });

  it("falls back to GoCardless booking date-time when date fields are absent", () => {
    const normalized = normalizeGoCardlessTransaction({
      transaction: {
        transactionId: "gc-datetime-1",
        bookingDateTime: "2026-06-05T14:30:00.000Z",
        transactionAmount: { amount: "75.00", currency: "GBP" },
        remittanceInformationUnstructured: "Standing order",
      },
      accountId: "account-1",
      accountName: "Metro Business Current",
      fundId: null,
    });

    expect(normalized.date).toBe("2026-06-05");
  });

  it("uses the best available GoCardless description fallback", () => {
    const normalized = normalizeGoCardlessTransaction({
      transaction: {
        entryReference: "gc-description-1",
        bookingDate: "2026-06-03",
        transactionAmount: { amount: "10.00", currency: "GBP" },
        remittanceInformationUnstructured: "   ",
        additionalInformation: "Gift Aid receipt",
      },
      accountId: "account-1",
      accountName: "Metro Business Current",
      fundId: null,
    });

    expect(normalized.description).toBe("Gift Aid receipt");
  });

  it("falls back to a default description for blank GoCardless descriptions", () => {
    const normalized = normalizeGoCardlessTransaction({
      transaction: {
        transactionId: "gc-blank-description-1",
        bookingDate: "2026-06-04",
        transactionAmount: { amount: "10.00", currency: "GBP" },
        remittanceInformationUnstructuredArray: [" ", ""],
      },
      accountId: "account-1",
      accountName: "Metro Business Current",
      fundId: null,
    });

    expect(normalized.description).toBe("Bank transaction");
  });

  it("rejects GoCardless transactions without a usable date", () => {
    expect(() =>
      normalizeGoCardlessTransaction({
        transaction: {
          transactionId: "gc-missing-date",
          transactionAmount: { amount: "10.00", currency: "GBP" },
        },
        accountId: "account-1",
        accountName: "Metro Business Current",
        fundId: null,
      })
    ).toThrow("GoCardless transaction is missing a date");
  });

  it("rejects GoCardless transactions with malformed dates", () => {
    expect(() =>
      normalizeGoCardlessTransaction({
        transaction: {
          transactionId: "gc-invalid-date",
          bookingDate: "01/06/2026",
          transactionAmount: { amount: "10.00", currency: "GBP" },
        },
        accountId: "account-1",
        accountName: "Metro Business Current",
        fundId: null,
      })
    ).toThrow("GoCardless transaction has an invalid date");
  });

  it("rejects GoCardless transactions without identifiers", () => {
    expect(() =>
      normalizeGoCardlessTransaction({
        transaction: {
          bookingDate: "2026-06-01",
          transactionAmount: { amount: "10.00", currency: "GBP" },
        },
        accountId: "account-1",
        accountName: "Metro Business Current",
        fundId: null,
      })
    ).toThrow("GoCardless transaction is missing an identifier");
  });

  it("rejects GoCardless transactions with malformed amounts", () => {
    expect(() =>
      normalizeGoCardlessTransaction({
        transaction: {
          transactionId: "gc-malformed-amount",
          bookingDate: "2026-06-01",
          transactionAmount: { amount: "12.34GBP", currency: "GBP" },
        },
        accountId: "account-1",
        accountName: "Metro Business Current",
        fundId: null,
      })
    ).toThrow("GoCardless transaction has an invalid amount");
  });
});
