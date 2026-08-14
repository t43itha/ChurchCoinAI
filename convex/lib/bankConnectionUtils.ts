export type ChurchCoinPendingBankTransaction = {
  date: string;
  description: string;
  amount: number;
  type: "Income" | "Expenditure";
  accountId: string;
  accountName: string;
  fundId: string | null;
  providerTransactionId: string;
};

const nonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export type CalculateSyncRangeArgs = {
  today: string;
  lastSyncedThrough?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

export const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  return toIsoDate(new Date(date.getTime() + days * DAY_MS));
};

export const calculateDefaultSyncRange = ({
  today,
  lastSyncedThrough,
}: CalculateSyncRangeArgs) => ({
  dateFrom: lastSyncedThrough ? addDays(lastSyncedThrough, 1) : addDays(today, -30),
  dateTo: today,
});

export const isPendingStateExpired = ({
  expiresAt,
  now = Date.now(),
}: {
  expiresAt: number;
  now?: number;
}) => now >= expiresAt;

const getYapilyAccountIdentification = (account: YapilyAccountLike) => {
  if (!Array.isArray(account.accountIdentifications)) return undefined;
  const preferredTypes = ["ACCOUNT_NUMBER", "IBAN", "BBAN"];
  const identifications = account.accountIdentifications.filter(
    (item): item is { type?: unknown; identification?: unknown } =>
      Boolean(item && typeof item === "object")
  );
  const preferred = preferredTypes
    .map((type) =>
      identifications.find(
        (item) => nonEmptyString(item.type)?.toUpperCase() === type
      )
    )
    .find(Boolean);
  return nonEmptyString(preferred?.identification);
};

export const normalizeYapilyAccount = (account: YapilyAccountLike) => {
  const accountId = nonEmptyString(account.id);
  if (!accountId) throw new Error("Yapily account is missing id");

  const accountNames = Array.isArray(account.accountNames)
    ? account.accountNames
        .filter(
          (item): item is { name?: unknown } =>
            Boolean(item && typeof item === "object")
        )
        .map((item) => nonEmptyString(item.name))
        .filter((name): name is string => Boolean(name))
    : [];
  const identifier = getYapilyAccountIdentification(account);

  return {
    accountId,
    providerAccountHash: undefined,
    providerAccountHashes: undefined,
    name:
      nonEmptyString(account.nickname) ||
      nonEmptyString(account.description) ||
      accountNames[0] ||
      nonEmptyString(account.type) ||
      "Bank account",
    mask: identifier?.replace(/\s+/g, "").slice(-4) || undefined,
    type: nonEmptyString(account.type),
    currency: nonEmptyString(account.currency),
  };
};

const getYapilyTransactionAmount = (transaction: YapilyTransactionLike) => {
  const transactionAmount =
    transaction.transactionAmount && typeof transaction.transactionAmount === "object"
      ? (transaction.transactionAmount as { amount?: unknown }).amount
      : undefined;
  const rawAmount = transactionAmount ?? transaction.amount;
  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string" && rawAmount.trim()
        ? Number(rawAmount.trim())
        : Number.NaN;

  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("Yapily transaction has an invalid amount");
  }
  return amount;
};

export const normalizeYapilyTransaction = ({
  transaction,
  accountId,
  accountName,
  fundId,
}: {
  transaction: YapilyTransactionLike;
  accountId: string;
  accountName: string;
  fundId?: string | null;
}): ChurchCoinPendingBankTransaction => {
  const rawDate =
    nonEmptyString(transaction.bookingDateTime) ||
    nonEmptyString(transaction.date) ||
    nonEmptyString(transaction.valueDateTime);
  if (!rawDate) throw new Error("Yapily transaction is missing a date");
  const parsedDate = new Date(rawDate);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Yapily transaction has an invalid date");
  }
  const date = toIsoDate(parsedDate);

  const enrichment =
    transaction.enrichment && typeof transaction.enrichment === "object"
      ? (transaction.enrichment as {
          transactionHash?: { hash?: unknown };
        })
      : undefined;
  const providerTransactionId =
    nonEmptyString(transaction.id) ||
    nonEmptyString(enrichment?.transactionHash?.hash);
  if (!providerTransactionId) {
    throw new Error("Yapily transaction is missing an identifier");
  }

  const transactionInformation = Array.isArray(transaction.transactionInformation)
    ? transaction.transactionInformation
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .join(" ")
    : undefined;
  const amount = getYapilyTransactionAmount(transaction);

  return {
    date,
    description:
      nonEmptyString(transaction.description) ||
      transactionInformation ||
      nonEmptyString(transaction.reference) ||
      "Bank transaction",
    amount: Math.abs(amount),
    type: amount > 0 ? "Income" : "Expenditure",
    accountId,
    accountName,
    fundId: fundId ?? null,
    providerTransactionId,
  };
};
import type {
  YapilyAccountLike,
  YapilyTransactionLike,
} from "./yapily";
