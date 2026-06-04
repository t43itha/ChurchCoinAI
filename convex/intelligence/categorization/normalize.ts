import {
  CategorizationInput,
  NormalizedTransaction,
  TransactionType,
} from "./types";

const BANK_NOISE_PATTERNS = [
  /\bstanding\s+order\b/g,
  /\bfaster\s+payment\b/g,
  /\bpayment\b/g,
  /\btransfer\b/g,
  /\btfr\b/g,
  /\bref\b/g,
  /\breference\b/g,
  /\bft\b/g,
  /\bso\b/g,
  /\bfp\b/g,
  /\b[0-9]{3,}\b/g,
];

export const normalizeDescription = (description: string): string => {
  let normalized = description.toLowerCase();
  normalized = normalized.replace(/[-_/.,:;()]/g, " ");
  for (const pattern of BANK_NOISE_PATTERNS) {
    normalized = normalized.replace(pattern, " ");
  }
  return normalized.replace(/\s+/g, " ").trim();
};

export const amountBucket = (
  amount: number,
  transactionType: TransactionType
): string => {
  if (transactionType === "Expenditure") {
    return `exact:${amount.toFixed(2)}`;
  }
  const rounded = Math.round(amount / 10) * 10;
  return `band:${rounded}`;
};

export const extractPayeeHint = (
  normalizedDescription: string
): string | null => {
  const tokens = normalizedDescription.split(" ").filter(Boolean);
  const meaningful = tokens.filter((token) => token.length > 1);
  if (meaningful.length === 0) return null;
  return meaningful.slice(0, 3).join(" ");
};

export const normalizeTransaction = (
  transaction: CategorizationInput
): NormalizedTransaction => {
  const normalizedDescription = normalizeDescription(transaction.description);
  const tokens = normalizedDescription.split(" ").filter(Boolean);
  const bucket = amountBucket(transaction.amount, transaction.type);
  return {
    ...transaction,
    normalizedDescription,
    tokens,
    payeeHint: extractPayeeHint(normalizedDescription),
    amountBucket: bucket,
    signature: `${transaction.type}:${normalizedDescription}:${bucket}`,
  };
};
