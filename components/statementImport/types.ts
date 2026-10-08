import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { PairSuggestion } from "../../lib/movementMatching";
import type { Transaction, TransactionType } from "../../types";

// The review only reads names and types, so seed data without ids is accepted too.
export type ReviewCategory = {
  _id?: string;
  name: string;
  transactionType?: "Income" | "Expenditure";
  isRetired?: boolean;
};

export type BankSyncCursor = {
  dateFrom: string;
  dateTo: string;
  accountIndex: number;
  continuationKey?: string;
};

export type PendingReviewTransaction = Partial<Transaction> & {
  reviewRowId?: string;
  requiresReview?: boolean;
  source?: "bank";
  providerTransactionId?: string;
  bankConnectionId?: Id<"bankConnections">;
  importKey?: string;
  pairWith?: PairSuggestion;
  pairBasis?: string;
  // Set only when the pipeline's suggestion was applied to this row. Corrections are
  // recorded from it, and it is trusted for buckets only while the category still matches.
  originalPrediction?: OriginalPrediction;
};

export type PipelinePredictionSource = "memory" | "rule" | "gemini" | "openrouter" | "openai" | "rag" | "none";

// What the categorisation pipeline said about a row, kept so corrections can be
// recorded against it once the row is imported. Keyed by reviewRowId.
export type OriginalPrediction = {
  category: string;
  fundId?: string;
  isGiftAidEligible?: boolean;
  donorName?: string | null;
  confidence: string;
  confidenceScore?: number;
  predictionSource: PipelinePredictionSource;
  ragScore?: number;
};

export type LedgerTransaction = FunctionReturnType<typeof api.queries.transactions.list>[number];

export type PipelineSuggestion = FunctionReturnType<typeof api.actions.ai.categorizeWithPipelinePreview>[number];
export type PipelineSuggestInput = FunctionArgs<typeof api.actions.ai.categorizeWithPipelinePreview>["transactions"][number];

export type CreateTransactionInput = FunctionArgs<typeof api.mutations.transactions.bulkCreate>["transactions"][number];
export type BulkCreateResult = FunctionReturnType<typeof api.mutations.transactions.bulkCreate>;
export type CorrectionInput = FunctionArgs<typeof api.mutations.transactions.recordCorrections>["corrections"][number];

export type SyncedBankTransaction = {
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  fundId?: string | null;
  providerTransactionId: string;
};

export type ConfirmImportResult =
  | { ok: true; created: number; skippedDuplicates: number }
  | { ok: false };
