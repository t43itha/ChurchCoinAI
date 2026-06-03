import { resolveCategoryForTransaction } from "./categoryResolver";
import { confidenceLabel } from "./confidence";
import {
  CategoryLike,
  CategorizationSuggestion,
  FundLike,
  NormalizedTransaction,
  TransactionType,
} from "./types";

export type MemoryConfidenceInput = {
  acceptedCount: number;
  confidence: number;
};

export type CategorizationMemorySuggestionInput = MemoryConfidenceInput & {
  category: string;
  fundId: string;
  isGiftAidEligible?: boolean;
  donorName?: string;
  transactionType: TransactionType;
};

export const confidenceFromCounts = (
  acceptedCount: number,
  correctedCount: number
): number => {
  const base = acceptedCount >= 5 ? 0.95 : acceptedCount >= 3 ? 0.93 : 0.86;
  const penalty = Math.min(correctedCount * 0.08, 0.32);
  return Math.max(0.5, Number((base - penalty).toFixed(2)));
};

export const shouldUseMemorySuggestion = (
  memory: MemoryConfidenceInput
): boolean => memory.acceptedCount >= 3 && memory.confidence >= 0.9;

export const buildMemorySuggestion = (
  memory: CategorizationMemorySuggestionInput,
  transaction: NormalizedTransaction,
  categories: CategoryLike[],
  funds: FundLike[]
): CategorizationSuggestion | null => {
  if (memory.transactionType !== transaction.type) return null;
  if (!shouldUseMemorySuggestion(memory)) return null;

  const category = resolveCategoryForTransaction(
    memory.category,
    transaction.type,
    categories
  );
  const fund = funds.find((item) => String(item._id) === String(memory.fundId));
  if (!category || !fund) return null;

  return {
    description: transaction.description,
    amount: transaction.amount,
    type: transaction.type,
    category: category.name,
    categoryTransactionType: category.transactionType,
    fundName: fund.name,
    fundId: String(fund._id),
    confidence: memory.confidence,
    confidenceLabel: confidenceLabel(memory.confidence),
    isGiftAidEligible: memory.isGiftAidEligible ?? false,
    donorName: memory.donorName || null,
    predictionSource: "memory",
    requiresReview: false,
    evidence: [
      {
        source: "memory",
        reason: `Matched ${memory.acceptedCount} accepted categorisations.`,
      },
    ],
  };
};
