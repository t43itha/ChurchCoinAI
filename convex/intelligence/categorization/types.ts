import { Id } from "../../_generated/dataModel";

export type TransactionType = "Income" | "Expenditure";

export type CategorizationSource =
  | "memory"
  | "rule"
  | "rag"
  | "gemini"
  | "openrouter"
  | "openai"
  | "jev"
  | "none";

export type ConfidenceLabel = "High" | "Medium" | "Low";

export type CategoryLike = {
  _id?: Id<"categories"> | string;
  name: string;
  mainCategory?: string;
  transactionType?: TransactionType;
  displayOrder?: number;
};

export type FundLike = {
  _id: Id<"funds"> | string;
  name: string;
  description?: string;
  type?: string;
};

export type CategorizationInput = {
  // Internal provider plan, never accepted from a public action argument.
  requestedFields?: CategorizationField[];
  fundName?: string;
  rowId?: string;
  category?: string;
  fundId?: string;
  donorName?: string | null;
  description: string;
  amount: number;
  type: TransactionType;
};

export type CategorizationField = "category" | "fund" | "donor";
export type DecisionMetadata = {
  model: string;
  requestId?: string;
  templateVersion: string;
  categoryProbability?: number;
  fundProbability?: number;
  categoryConfidence?: number;
  fundConfidence?: number;
  fieldSources?: Partial<Record<CategorizationField, CategorizationSource | "existing">>;
  fallbackReasons?: string[];
};

export type NormalizedTransaction = CategorizationInput & {
  normalizedDescription: string;
  tokens: string[];
  payeeHint: string | null;
  amountBucket: string;
  signature: string;
};

export type CategorizationEvidence = {
  source: CategorizationSource;
  reason: string;
  matchedDescription?: string;
  score?: number;
};

export type CategorizationSuggestion = {
  rowId?: string;
  decisionMetadata?: DecisionMetadata;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  categoryTransactionType?: TransactionType;
  fundName: string;
  fundId?: string;
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  isGiftAidEligible: boolean;
  donorName?: string | null;
  predictionSource: CategorizationSource;
  ragScore?: number;
  requiresReview: boolean;
  evidence: CategorizationEvidence[];
};
