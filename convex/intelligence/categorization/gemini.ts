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
  CategorizationSource,
  FundLike,
} from "./types";

export const CATEGORIZATION_MODEL = "gemini-2.5-flash-lite";
export const COMPLEX_AI_MODEL = "gemini-2.5-flash";

export { CATEGORIZATION_RULES } from "../../../lib/categorizationPolicy";
import { accountingCriteria } from "../../../lib/categorizationPolicy";

export const confidenceFromModelLabel = (label: unknown): number => {
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

const aiEvidenceReason = (
  rawSuggestion: Record<string, unknown>,
  source: Extract<CategorizationSource, "gemini" | "openrouter" | "openai">
): string => {
  const rawReason = rawSuggestion.evidence ?? rawSuggestion.reason;
  if (typeof rawReason === "string" && rawReason.trim()) {
    return rawReason.trim();
  }

  if (source === "openrouter") return "Luna suggestion via OpenRouter.";
  if (source === "openai") return "Luna suggestion via OpenAI.";
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
Return strict JSON suggestions for the provided transactions. Copy each rowId exactly; never match rows by description.

Income categories: ${incomeCategories.join(", ")}
Expenditure categories: ${expenditureCategories.join(", ")}
Funds: ${fundNames.join(", ")}

${accountingCriteria(categories, funds)}

Relevant evidence reasons:
${evidenceReasons.map((reason) => `- ${reason}`).join("\n")}

Transactions JSON:
${JSON.stringify(transactions)}`;
};

export const validateGeminiSuggestion = (
  rawSuggestion: Record<string, unknown>,
  transaction: CategorizationInput,
  categories: CategoryLike[],
  funds: FundLike[],
  predictionSource: Extract<
    CategorizationSource,
    "gemini" | "openrouter" | "openai"
  > = "gemini"
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
  let donorName =
    typeof rawSuggestion.donorName === "string" && rawSuggestion.donorName.trim()
      ? rawSuggestion.donorName.trim()
      : null;

  let isGiftAidEligible =
    typeof rawSuggestion.isGiftAidEligible === "boolean"
      ? rawSuggestion.isGiftAidEligible
      : false;

  // Purchases are trading income, not donations. Keep this deterministic even
  // when a bank reference contains a customer's name or a stray [GA] marker.
  if (category.name === "Merchandise" || transaction.type === "Expenditure") {
    donorName = null;
    isGiftAidEligible = false;
  }

  return {
    ...(transaction.rowId ? { rowId: transaction.rowId } : {}),
    description: transaction.description,
    amount: transaction.amount,
    type: transaction.type,
    category: category.name,
    categoryTransactionType: category.transactionType,
    fundName: fund.name,
    fundId: String(fund._id),
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    isGiftAidEligible,
    donorName,
    predictionSource,
    requiresReview: true,
    evidence: [
      {
        source: predictionSource,
        reason: aiEvidenceReason(rawSuggestion, predictionSource),
      },
    ],
  };
};
