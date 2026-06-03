import { resolveCategoryForTransaction } from "./categoryResolver";
import { confidenceLabel } from "./confidence";
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
    pattern: /\butility|utilities|electric|gas|water|thames|british\s+gas|eon\b/,
    category: "Utilities",
    confidence: 0.9,
    reason: "Utility supplier pattern matched.",
  },
  {
    id: "tithes",
    transactionType: "Income",
    pattern: /\btithe|tithes|first\s+fruit|firstfruit\b/,
    category: "Tithes & First Fruits",
    confidence: 0.92,
    giftAidEligible: true,
    reason: "Giving reference matched tithe or first fruit.",
  },
  {
    id: "offerings",
    transactionType: "Income",
    pattern: /\boffering|offerings|thanksgiving|donation\b/,
    category: "Offerings",
    confidence: 0.86,
    giftAidEligible: true,
    reason: "Giving reference matched offering or donation.",
  },
];

export const applyDeterministicRules = (
  transaction: CategorizationInput,
  categories: CategoryLike[],
  funds: FundLike[]
): CategorizationSuggestion | null => {
  const normalized = normalizeDescription(transaction.description);
  const defaultFund = funds[0];
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
      requiresReview: rule.confidence < 0.95,
      evidence: [{ source: "rule", reason: rule.reason }],
    };
  }

  return null;
};
