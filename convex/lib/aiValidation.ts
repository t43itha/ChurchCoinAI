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

// AI usage is charged in units of work: one unit per transaction row (or
// embedding), and at least AI_CALL_UNITS for any model request, so a request
// costs the same whether it carries one row or a full 20-row import batch.
export const AI_CALL_UNITS = 20;

export const AI_USAGE_WINDOW_MS = 60_000;

const DEFAULT_AI_USAGE_LIMITS = {
  // A 500-row statement import costs 500 units within about a minute.
  userPerMinute: 600,
  organizationPerMinute: 1_000,
  // One church's day: a full import costs about 1,000 units (500 to
  // categorise, 500 to index), so this covers several imports plus dozens of
  // reports, and keeps one church to 5% of the deployment's day.
  organizationPerDay: 10_000,
  // Deployment-wide ceiling: about 10,000 model requests a day.
  deploymentPerDay: 200_000,
};

export type AIUsageLimits = typeof DEFAULT_AI_USAGE_LIMITS;

export const positiveInteger = (raw: string | undefined, fallback: number) => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

export function aiUsageLimits(env: Record<string, string | undefined> = process.env): AIUsageLimits {
  return {
    userPerMinute: positiveInteger(env.AI_USER_UNITS_PER_MINUTE, DEFAULT_AI_USAGE_LIMITS.userPerMinute),
    organizationPerMinute: positiveInteger(env.AI_ORG_UNITS_PER_MINUTE, DEFAULT_AI_USAGE_LIMITS.organizationPerMinute),
    organizationPerDay: positiveInteger(env.AI_ORG_DAILY_UNITS, DEFAULT_AI_USAGE_LIMITS.organizationPerDay),
    deploymentPerDay: positiveInteger(env.AI_DAILY_UNITS, DEFAULT_AI_USAGE_LIMITS.deploymentPerDay),
  };
}

export const requestUnits = (rows: number) => Math.max(AI_CALL_UNITS, rows);

export const AI_INPUT_LIMITS = {
  items: 500,
  text: 4_000,
  json: 100_000,
} as const;

/**
 * Rejects oversized AI action input before any model or search call.
 * Arrays hold at most 500 items (the statement import cap), strings at most
 * 4,000 characters, and the named JSON payload fields at most 100,000.
 */
export function limitAIInput(args: Record<string, unknown>, jsonFields: readonly string[] = []) {
  const visit = (value: unknown, path: string, max: number) => {
    if (typeof value === "string") {
      if (value.length > max) throw new Error(`${path} is too long (maximum ${max} characters)`);
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`${path} must be a finite number`);
    } else if (Array.isArray(value)) {
      if (value.length > AI_INPUT_LIMITS.items) {
        throw new Error(`${path} has too many items (maximum ${AI_INPUT_LIMITS.items})`);
      }
      value.forEach((item, index) => visit(item, `${path}[${index}]`, AI_INPUT_LIMITS.text));
    } else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) visit(item, `${path}.${key}`, AI_INPUT_LIMITS.text);
    }
  };
  for (const [key, value] of Object.entries(args)) {
    visit(value, key, jsonFields.includes(key) ? AI_INPUT_LIMITS.json : AI_INPUT_LIMITS.text);
  }
}
