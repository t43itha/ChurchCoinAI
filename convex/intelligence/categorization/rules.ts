import { resolveCategoryForTransaction } from "./categoryResolver";
import { confidenceLabel, confidenceNeedsReview } from "./confidence";
import { normalizeDescription } from "./normalize";
import {
  CategoryLike,
  CategorizationInput,
  CategorizationSuggestion,
  FundLike,
  TransactionType,
} from "./types";

type RuleDefinition = {
  id: string;
  transactionType: TransactionType;
  pattern: RegExp;
  category: string;
  confidence: number;
  giftAidEligible?: boolean;
  reason: string;
};

const RULES: RuleDefinition[] = [
  {
    id: "bank-charges",
    transactionType: "Expenditure",
    pattern: /\bbank\s+(charge|fee|charges|fees)\b|\bmonthly\s+fee\b/,
    category: "Bank Charges",
    confidence: 0.94,
    reason: "Bank fee pattern matched.",
  },
  {
    id: "utilities",
    transactionType: "Expenditure",
    pattern:
      /\b(?:utility|utilities|electric|gas|water|thames|british\s+gas|eon)\b/,
    category: "Utilities",
    confidence: 0.9,
    reason: "Utility supplier pattern matched.",
  },
  {
    id: "tithes",
    transactionType: "Income",
    pattern: /\b(?:tithe|tithes|first\s+fruit|firstfruit)\b/,
    category: "Tithes & First Fruits",
    confidence: 0.92,
    giftAidEligible: true,
    reason: "Giving reference matched tithe or first fruit.",
  },
  {
    id: "thanksgiving",
    transactionType: "Income",
    pattern: /\bthanksgivings?\b/,
    category: "Thanksgiving",
    confidence: 0.9,
    giftAidEligible: true,
    reason: "Giving reference matched thanksgiving.",
  },
  {
    id: "offerings",
    transactionType: "Income",
    pattern: /\b(?:offering|offerings|donation)\b/,
    category: "Offerings",
    confidence: 0.86,
    giftAidEligible: true,
    reason: "Giving reference matched offering or donation.",
  },
];

const selectFund = (description: string, funds: FundLike[]) => {
  const normalized = normalizeDescription(description);
  const mentioned = funds
    .filter((fund) => {
      const fundName = normalizeDescription(fund.name);
      return fundName.length > 0 && normalized.includes(fundName);
    })
    .sort((left, right) => right.name.length - left.name.length);
  if (mentioned[0]) return mentioned[0];
  return (
    funds.find((fund) => normalizeDescription(fund.name) === "general fund") ??
    null
  );
};

export const applyDeterministicRules = (
  transaction: CategorizationInput,
  categories: CategoryLike[],
  funds: FundLike[]
): CategorizationSuggestion | null => {
  const normalized = normalizeDescription(transaction.description);
  const defaultFund = selectFund(transaction.description, funds);
  if (!defaultFund) return null;

  for (const rule of RULES) {
    if (rule.transactionType !== transaction.type) continue;
    if (!rule.pattern.test(normalized)) continue;

    const category = resolveCategoryForTransaction(
      rule.category,
      transaction.type,
      categories
    );
    if (!category) return null;

    return {
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      category: category.name,
      categoryTransactionType: category.transactionType,
      fundName: defaultFund.name,
      fundId: String(defaultFund._id),
      confidence: rule.confidence,
      confidenceLabel: confidenceLabel(rule.confidence),
      isGiftAidEligible: rule.giftAidEligible ?? false,
      donorName: null,
      predictionSource: "rule",
      requiresReview: confidenceNeedsReview(rule.confidence),
      evidence: [{ source: "rule", reason: rule.reason }],
    };
  }

  return null;
};
