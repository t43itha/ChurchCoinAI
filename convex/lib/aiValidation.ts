export const safeJsonParse = <T>(raw: string, fieldName: string): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${fieldName} must be valid JSON`);
  }
};

type GiftAidEligibleTransaction = {
  donorName?: string | null;
  amount: number;
};

export const validateGiftAidEligibleTransactions = (
  value: unknown
): GiftAidEligibleTransaction[] => {
  if (!Array.isArray(value)) {
    throw new Error("eligibleTransactions must be a JSON array");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`eligibleTransactions[${index}] must be an object`);
    }
    const row = item as Record<string, unknown>;
    if (typeof row.amount !== "number" || !Number.isFinite(row.amount)) {
      throw new Error(
        `eligibleTransactions[${index}].amount must be a finite number`
      );
    }
    if (row.amount <= 0) {
      throw new Error(`eligibleTransactions[${index}].amount must be > 0`);
    }
    if (
      row.donorName !== undefined &&
      row.donorName !== null &&
      typeof row.donorName !== "string"
    ) {
      throw new Error(
        `eligibleTransactions[${index}].donorName must be a string when provided`
      );
    }
    return {
      amount: row.amount,
      donorName:
        typeof row.donorName === "string" ? row.donorName : "Unknown Donor",
    };
  });
};

export type { GiftAidEligibleTransaction };
