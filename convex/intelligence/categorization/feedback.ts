import { Id } from "../../_generated/dataModel";
import { normalizeTransaction } from "./normalize";
import { CategorizationSource, TransactionType } from "./types";

export type FeedbackEventInput = {
  organizationId: Id<"organizations">;
  transactionId: Id<"transactions">;
  transaction: {
    description: string;
    amount: number;
    type: TransactionType;
  };
  source: CategorizationSource;
  confidence: number;
  originalCategory?: string;
  finalCategory: string;
  originalFundId?: Id<"funds">;
  finalFundId: Id<"funds">;
  originalGiftAidEligible?: boolean;
  finalGiftAidEligible?: boolean;
  originalDonorName?: string;
  finalDonorName?: string;
  learned: boolean;
  createdAt: number;
};

export const buildFeedbackEvent = (input: FeedbackEventInput) => {
  const normalized = normalizeTransaction(input.transaction);

  return {
    organizationId: input.organizationId,
    transactionId: input.transactionId,
    signature: normalized.signature,
    transactionType: input.transaction.type,
    source: input.source,
    confidence: input.confidence,
    originalCategory: input.originalCategory,
    finalCategory: input.finalCategory,
    categoryChanged:
      (input.originalCategory ?? null) !== (input.finalCategory || null),
    originalFundId: input.originalFundId,
    finalFundId: input.finalFundId,
    fundChanged: (input.originalFundId ?? null) !== input.finalFundId,
    originalGiftAidEligible: input.originalGiftAidEligible,
    finalGiftAidEligible: input.finalGiftAidEligible,
    giftAidChanged:
      (input.originalGiftAidEligible ?? null) !==
      (input.finalGiftAidEligible ?? null),
    originalDonorName: input.originalDonorName,
    finalDonorName: input.finalDonorName,
    donorNameChanged:
      (input.originalDonorName ?? null) !== (input.finalDonorName ?? null),
    learned: input.learned,
    createdAt: input.createdAt,
  };
};
