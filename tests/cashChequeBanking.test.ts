import { describe, expect, it } from "vitest";
import {
  calculateCollectionBankingTotals,
  calculateReconciliationSummary,
  type CollectionBankingTransaction,
  getCollectionBankingStatus,
  normalizeBankTransactionSplits,
} from "../lib/cashChequeBanking";

const givingTransactions: CollectionBankingTransaction[] = [
  { _id: "c1-cash", cashCollectionId: "collection-1", paymentMethod: "Cash" as const, amount: 100, type: "Income" as const },
  { _id: "c1-cheque", cashCollectionId: "collection-1", paymentMethod: "Cheque" as const, amount: 40, type: "Income" as const },
  { _id: "c1-card", cashCollectionId: "collection-1", paymentMethod: "Card" as const, amount: 25, type: "Income" as const },
  { _id: "c1-pdq", cashCollectionId: "collection-1", paymentMethod: "PDQ" as const, amount: 30, type: "Income" as const },
  { _id: "c2-cash", cashCollectionId: "collection-2", paymentMethod: "Cash" as const, amount: 60, type: "Income" as const },
  { _id: "c2-void", cashCollectionId: "collection-2", paymentMethod: "Cash" as const, amount: 10, type: "Income" as const, isVoided: true },
  { _id: "expense", cashCollectionId: "collection-1", paymentMethod: "Cash" as const, amount: 5, type: "Expenditure" as const },
];

describe("cash/cheque banking helpers", () => {
  it("calculates collection expected totals using only active income cash and cheques", () => {
    expect(calculateCollectionBankingTotals("collection-1", givingTransactions)).toEqual({
      cashAmount: 100,
      chequeAmount: 40,
      totalAmount: 140,
    });
  });

  it("normalizes cash-only and cheque-only bank transaction splits", () => {
    expect(
      normalizeBankTransactionSplits([
        { transactionId: "bank-cash", transactionAmount: 100, medium: "cash" },
        { transactionId: "bank-cheque", transactionAmount: 40, medium: "cheque" },
      ])
    ).toEqual([
      { transactionId: "bank-cash", medium: "cash", cashAmount: 100, chequeAmount: 0 },
      { transactionId: "bank-cheque", medium: "cheque", cashAmount: 0, chequeAmount: 40 },
    ]);
  });

  it("normalizes mixed bank transaction splits", () => {
    expect(
      normalizeBankTransactionSplits([
        {
          transactionId: "bank-mixed",
          transactionAmount: 140,
          medium: "mixed",
          cashAmount: 100,
          chequeAmount: 40,
        },
      ])
    ).toEqual([
      { transactionId: "bank-mixed", medium: "mixed", cashAmount: 100, chequeAmount: 40 },
    ]);
  });

  it("rejects a mixed split that does not equal the bank transaction amount", () => {
    expect(() =>
      normalizeBankTransactionSplits([
        {
          transactionId: "bank-mixed",
          transactionAmount: 140,
          medium: "mixed",
          cashAmount: 100,
          chequeAmount: 39,
        },
      ])
    ).toThrow("Mixed bank split must equal the transaction amount");
  });

  it("rejects mixed split components that are not positive money amounts", () => {
    expect(() =>
      normalizeBankTransactionSplits([
        {
          transactionId: "bank-mixed-negative",
          transactionAmount: 100,
          medium: "mixed",
          cashAmount: -50,
          chequeAmount: 150,
        },
      ])
    ).toThrow("Mixed bank split amounts must be positive");

    expect(() =>
      normalizeBankTransactionSplits([
        {
          transactionId: "bank-mixed-zero",
          transactionAmount: 100,
          medium: "mixed",
          cashAmount: 0,
          chequeAmount: 100,
        },
      ])
    ).toThrow("Mixed bank split amounts must be positive");
  });

  it("calculates zero variance for one collection to many deposits", () => {
    const summary = calculateReconciliationSummary({
      collectionSplits: [{ cashCollectionId: "collection-1", cashAmount: 100, chequeAmount: 40 }],
      bankTransactionSplits: [
        { transactionId: "bank-cash", medium: "cash", cashAmount: 100, chequeAmount: 0 },
        { transactionId: "bank-cheque", medium: "cheque", cashAmount: 0, chequeAmount: 40 },
      ],
    });

    expect(summary).toEqual({
      expectedCashAmount: 100,
      expectedChequeAmount: 40,
      expectedTotal: 140,
      bankedCashAmount: 100,
      bankedChequeAmount: 40,
      bankedTotal: 140,
      varianceAmount: 0,
    });
  });

  it("calculates variance for many collections to one partial deposit", () => {
    const summary = calculateReconciliationSummary({
      collectionSplits: [
        { cashCollectionId: "collection-1", cashAmount: 100, chequeAmount: 40 },
        { cashCollectionId: "collection-2", cashAmount: 60, chequeAmount: 0 },
      ],
      bankTransactionSplits: [
        { transactionId: "bank-cash", medium: "cash", cashAmount: 150, chequeAmount: 0 },
      ],
    });

    expect(summary.varianceAmount).toBe(-50);
  });

  it("reports collection banking status from expected and banked totals", () => {
    expect(getCollectionBankingStatus(140, 0)).toBe("not_started");
    expect(getCollectionBankingStatus(140, 100)).toBe("partially_banked");
    expect(getCollectionBankingStatus(140, 140)).toBe("banked");
  });
});
