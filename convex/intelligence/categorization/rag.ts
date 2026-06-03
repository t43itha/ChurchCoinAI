import { resolveCategoryForTransaction } from "./categoryResolver";
import { confidenceLabel } from "./confidence";
import {
  CategoryLike,
  CategorizationInput,
  CategorizationSuggestion,
  FundLike,
  TransactionType,
} from "./types";

export type CategorizationRagMetadata = {
  transactionId?: string;
  category: string;
  fundId: string;
  type: TransactionType;
  isGiftAidEligible?: boolean;
  donorName?: string;
  acceptedCount?: number;
};

export const buildRagEntryKey = (
  organizationId: string,
  signature: string
): string => `memory:${organizationId}:${signature}`;

export const metadataToSuggestion = (
  metadata: CategorizationRagMetadata,
  transaction: CategorizationInput,
  score: number,
  categories: CategoryLike[],
  funds: FundLike[]
): CategorizationSuggestion | null => {
  if (metadata.type !== transaction.type) return null;

  const category = resolveCategoryForTransaction(
    metadata.category,
    transaction.type,
    categories
  );
  const fund = funds.find((item) => String(item._id) === String(metadata.fundId));
  if (!category || !fund) return null;

  const confidence = score >= 0.95 ? 0.92 : 0.86;

  return {
    description: transaction.description,
    amount: transaction.amount,
    type: transaction.type,
    category: category.name,
    categoryTransactionType: category.transactionType,
    fundName: fund.name,
    fundId: String(fund._id),
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    isGiftAidEligible: metadata.isGiftAidEligible ?? false,
    donorName: metadata.donorName || null,
    predictionSource: "rag",
    ragScore: score,
    requiresReview: confidence < 0.9,
    evidence: [
      {
        source: "rag",
        reason: `Semantic match from ${
          metadata.acceptedCount ?? 1
        } accepted categorisation(s).`,
        score,
      },
    ],
  };
};
