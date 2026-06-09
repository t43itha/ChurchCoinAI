import {
  categoryNamesForPrompt,
  resolveCategoryForTransaction,
} from "./categoryResolver";
import { confidenceLabel } from "./confidence";
import {
  CategoryLike,
  CategorizationEvidence,
  CategorizationInput,
  CategorizationSuggestion,
  FundLike,
} from "./types";

export const CATEGORIZATION_MODEL = "gemini-2.5-flash-lite";
export const COMPLEX_AI_MODEL = "gemini-2.5-flash";

const confidenceFromModelLabel = (label: unknown): number => {
  if (typeof label !== "string") return 0.65;

  switch (label.trim().toLowerCase()) {
    case "high":
      return 0.85;
    case "medium":
      return 0.68;
    case "low":
      return 0.55;
    default:
      return 0.65;
  }
};

const geminiEvidenceReason = (
  rawSuggestion: Record<string, unknown>
): string => {
  const rawReason = rawSuggestion.evidence ?? rawSuggestion.reason;
  if (typeof rawReason === "string" && rawReason.trim()) {
    return rawReason.trim();
  }

  return "Gemini fallback suggestion.";
};

export const buildGeminiCategorizationPrompt = (
  transactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[],
  evidence: CategorizationEvidence[]
): string => {
  const incomeCategories = categoryNamesForPrompt(categories, "Income");
  const expenditureCategories = categoryNamesForPrompt(
    categories,
    "Expenditure"
  );
  const fundNames = funds.map((fund) => fund.name);
  const evidenceReasons = evidence.map((item) => item.reason);

  return `You are a UK church finance categorisation assistant.
Return strict JSON suggestions for the provided transactions.

Income categories: ${incomeCategories.join(", ")}
Expenditure categories: ${expenditureCategories.join(", ")}
Funds: ${fundNames.join(", ")}

Rules:
- Income transactions must use only income categories.
- Expenditure transactions must use only expenditure categories.
- Do not invent category or fund names.
- If uncertain, choose an allowed category and mark confidence Low.

Relevant evidence reasons:
${evidenceReasons.map((reason) => `- ${reason}`).join("\n")}

Transactions JSON:
${JSON.stringify(transactions)}`;
};

export const validateGeminiSuggestion = (
  rawSuggestion: Record<string, unknown>,
  transaction: CategorizationInput,
  categories: CategoryLike[],
  funds: FundLike[]
): CategorizationSuggestion | null => {
  const categoryName =
    typeof rawSuggestion.category === "string" ? rawSuggestion.category : "";
  const category = resolveCategoryForTransaction(
    categoryName,
    transaction.type,
    categories
  );
  if (!category) return null;

  const suggestedFundName =
    typeof rawSuggestion.fundName === "string" ? rawSuggestion.fundName : "";
  if (!suggestedFundName.trim()) return null;

  const fund = funds.find(
    (item) =>
      item.name.trim().toLowerCase() ===
      suggestedFundName.trim().toLowerCase()
  );
  if (!fund) return null;

  const confidence = confidenceFromModelLabel(rawSuggestion.confidence);
  const donorName =
    typeof rawSuggestion.donorName === "string" && rawSuggestion.donorName.trim()
      ? rawSuggestion.donorName.trim()
      : null;

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
    isGiftAidEligible:
      typeof rawSuggestion.isGiftAidEligible === "boolean"
        ? rawSuggestion.isGiftAidEligible
        : false,
    donorName,
    predictionSource: "gemini",
    requiresReview: true,
    evidence: [
      { source: "gemini", reason: geminiEvidenceReason(rawSuggestion) },
    ],
  };
};
