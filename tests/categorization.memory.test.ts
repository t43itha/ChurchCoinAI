import { describe, expect, it } from "vitest";
import {
  buildMemorySuggestion,
  confidenceFromCounts,
  nextAcceptedMemoryState,
  shouldUseMemorySuggestion,
} from "../convex/intelligence/categorization/memory";
import { CategoryLike, FundLike } from "../convex/intelligence/categorization/types";

const categories: CategoryLike[] = [
  { _id: "category-income", name: "Offerings", transactionType: "Income" },
  {
    _id: "category-expense",
    name: "Utilities",
    transactionType: "Expenditure",
  },
];

const funds: FundLike[] = [{ _id: "fund-general", name: "General Fund" }];

const transaction = {
  description: "Standing order from Jane Smith",
  amount: 50,
  type: "Income" as const,
  normalizedDescription: "standing order from jane smith",
  tokens: ["standing", "order", "jane", "smith"],
  payeeHint: "jane smith",
  amountBucket: "50",
  signature: "income:standing-order:jane-smith",
};

describe("categorization memory helpers", () => {
  it("increases confidence with accepted examples", () => {
    expect(confidenceFromCounts(1, 0)).toBe(0.86);
    expect(confidenceFromCounts(3, 0)).toBe(0.93);
    expect(confidenceFromCounts(5, 0)).toBe(0.95);
  });

  it("penalizes corrections", () => {
    expect(confidenceFromCounts(5, 2)).toBeLessThan(0.95);
  });

  it("caps correction penalties at the effective minimum", () => {
    expect(confidenceFromCounts(5, 4)).toBe(0.63);
    expect(confidenceFromCounts(5, 99)).toBe(0.63);
  });

  it("uses only strong memory records", () => {
    expect(shouldUseMemorySuggestion({ acceptedCount: 3, confidence: 0.93 })).toBe(true);
    expect(shouldUseMemorySuggestion({ acceptedCount: 1, confidence: 0.86 })).toBe(false);
  });

  it("requires confidence at the memory suggestion threshold", () => {
    expect(shouldUseMemorySuggestion({ acceptedCount: 3, confidence: 0.9 })).toBe(true);
    expect(shouldUseMemorySuggestion({ acceptedCount: 3, confidence: 0.89 })).toBe(false);
  });

  it("does not build a suggestion below the memory threshold", () => {
    const suggestion = buildMemorySuggestion(
      {
        category: "Offerings",
        fundId: "fund-general",
        acceptedCount: 2,
        confidence: 0.86,
        transactionType: "Income",
      },
      transaction,
      categories,
      funds
    );

    expect(suggestion).toBeNull();
  });

  it("does not build a suggestion when the transaction type differs", () => {
    const suggestion = buildMemorySuggestion(
      {
        category: "Utilities",
        fundId: "fund-general",
        acceptedCount: 3,
        confidence: 0.93,
        transactionType: "Expenditure",
      },
      transaction,
      categories,
      funds
    );

    expect(suggestion).toBeNull();
  });

  it("builds a memory suggestion from a valid memory record", () => {
    const suggestion = buildMemorySuggestion(
      {
        category: "Offerings",
        fundId: "fund-general",
        isGiftAidEligible: true,
        donorName: "Jane Smith",
        acceptedCount: 3,
        confidence: 0.93,
        transactionType: "Income",
      },
      transaction,
      categories,
      funds
    );

    expect(suggestion).toEqual({
      description: "Standing order from Jane Smith",
      amount: 50,
      type: "Income",
      category: "Offerings",
      categoryTransactionType: "Income",
      fundName: "General Fund",
      fundId: "fund-general",
      confidence: 0.93,
      confidenceLabel: "High",
      isGiftAidEligible: true,
      donorName: "Jane Smith",
      predictionSource: "memory",
      requiresReview: false,
      evidence: [
        {
          source: "memory",
          reason: "Matched 3 accepted categorisations.",
        },
      ],
    });
  });

  it("does not increment accepted count twice for the same source transaction", () => {
    const next = nextAcceptedMemoryState(
      {
        transactionType: "Income",
        category: "Offerings",
        fundId: "fund-general",
        isGiftAidEligible: true,
        donorName: "Jane Smith",
        acceptedCount: 3,
        correctedCount: 0,
        acceptedSourceTransactionIds: ["tx-1"],
      },
      {
        transactionType: "Income",
        category: "Offerings",
        fundId: "fund-general",
        isGiftAidEligible: true,
        donorName: "Jane Smith",
        sourceTransactionId: "tx-1",
      }
    );

    expect(next.acceptedCount).toBe(3);
    expect(next.acceptedSourceTransactionIds).toEqual(["tx-1"]);
    expect(next.confidence).toBe(confidenceFromCounts(3, 0));
  });

  it("treats the legacy source transaction id as already accepted", () => {
    const next = nextAcceptedMemoryState(
      {
        transactionType: "Income",
        category: "Offerings",
        fundId: "fund-general",
        acceptedCount: 3,
        correctedCount: 0,
        sourceTransactionId: "tx-1",
      },
      {
        transactionType: "Income",
        category: "Offerings",
        fundId: "fund-general",
        sourceTransactionId: "tx-1",
      }
    );

    expect(next.acceptedCount).toBe(3);
    expect(next.acceptedSourceTransactionIds).toEqual(["tx-1"]);
  });

  it("records omitted source transactions without idempotency checks", () => {
    const next = nextAcceptedMemoryState(
      {
        transactionType: "Income",
        category: "Offerings",
        fundId: "fund-general",
        acceptedCount: 3,
        correctedCount: 0,
        acceptedSourceTransactionIds: ["tx-1"],
      },
      {
        transactionType: "Income",
        category: "Offerings",
        fundId: "fund-general",
      }
    );

    expect(next.acceptedCount).toBe(4);
    expect(next.acceptedSourceTransactionIds).toEqual(["tx-1"]);
    expect(next.confidence).toBe(confidenceFromCounts(4, 0));
  });

  it("resets accepted count when the accepted outcome changes", () => {
    const next = nextAcceptedMemoryState(
      {
        transactionType: "Income",
        category: "Offerings",
        fundId: "fund-general",
        isGiftAidEligible: true,
        donorName: "Jane Smith",
        acceptedCount: 4,
        correctedCount: 1,
        acceptedSourceTransactionIds: ["tx-1", "tx-2"],
      },
      {
        transactionType: "Income",
        category: "Gift Day",
        fundId: "fund-general",
        isGiftAidEligible: true,
        donorName: "Jane Smith",
        sourceTransactionId: "tx-3",
      }
    );

    expect(next.acceptedCount).toBe(1);
    expect(next.correctedCount).toBe(2);
    expect(next.acceptedSourceTransactionIds).toEqual(["tx-3"]);
    expect(next.confidence).toBe(confidenceFromCounts(1, 2));
  });
});
