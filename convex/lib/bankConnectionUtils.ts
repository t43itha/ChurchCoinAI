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

export type EnableBankingAccountResourceLike = {
  uid?: unknown;
  identification_hash?: unknown;
  identification_hashes?: unknown;
  name?: unknown;
  account_id?: {
    iban?: unknown;
    bban?: unknown;
  };
  all_account_ids?: Array<{
    identification?: unknown;
    scheme_name?: unknown;
  }>;
  account_servicer?: {
    name?: unknown;
  };
  details?: unknown;
  cash_account_type?: unknown;
  product?: unknown;
  currency?: unknown;
};

type LegacyEnableBankingAccountDetails = {
  name?: unknown;
  currency?: unknown;
  product?: unknown;
  cash_account_type?: unknown;
  iban?: unknown;
  bban?: unknown;
};

const nonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const getLegacyAccountDetails = (
  account: EnableBankingAccountResourceLike
): LegacyEnableBankingAccountDetails | undefined =>
  account.details && typeof account.details === "object"
    ? account.details as LegacyEnableBankingAccountDetails
    : undefined;

const getAccountIdentifier = (account: EnableBankingAccountResourceLike) => {
  const legacyDetails = getLegacyAccountDetails(account);
  return (
    nonEmptyString(account.account_id?.iban) ||
    nonEmptyString(account.account_id?.bban) ||
    account.all_account_ids
      ?.map((accountId) => nonEmptyString(accountId.identification))
      .find(Boolean) ||
    nonEmptyString(legacyDetails?.iban) ||
    nonEmptyString(legacyDetails?.bban)
  );
};

export const normalizeEnableBankingAccount = (
  account: EnableBankingAccountResourceLike
) => {
  const accountId = nonEmptyString(account.uid);
  if (!accountId) {
    throw new Error("Enable Banking account is missing uid");
  }

  const identificationHashes = Array.isArray(account.identification_hashes)
    ? account.identification_hashes
        .map(nonEmptyString)
        .filter((hash): hash is string => Boolean(hash))
    : undefined;
  const legacyDetails = getLegacyAccountDetails(account);
  const identifier = getAccountIdentifier(account);

  return {
    accountId,
    providerAccountHash: nonEmptyString(account.identification_hash),
    providerAccountHashes: identificationHashes?.length
      ? identificationHashes
      : undefined,
    name:
      nonEmptyString(account.name) ||
      nonEmptyString(account.product) ||
      nonEmptyString(account.account_servicer?.name) ||
      nonEmptyString(legacyDetails?.name) ||
      nonEmptyString(legacyDetails?.product) ||
      identifier ||
      "Bank account",
    mask: identifier?.replace(/\s+/g, "").slice(-4) || undefined,
    type:
      nonEmptyString(account.cash_account_type) ||
      nonEmptyString(account.product) ||
      nonEmptyString(legacyDetails?.cash_account_type) ||
      nonEmptyString(legacyDetails?.product),
    currency:
      nonEmptyString(account.currency) ||
      nonEmptyString(legacyDetails?.currency),
  };
};

export type EnableBankingAmount = {
  amount?: string | number;
  currency?: string;
};

export type EnableBankingTransactionLike = {
  entry_reference?: string;
  transaction_id?: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  credit_debit_indicator?: string;
  amount?: EnableBankingAmount;
  transaction_amount?: EnableBankingAmount;
  remittance_information?: string | string[];
  creditor_name?: string;
  debtor_name?: string;
  additional_information?: string;
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

const getTransactionAmount = (transaction: EnableBankingTransactionLike) => {
  const rawAmount =
    transaction.amount?.amount ?? transaction.transaction_amount?.amount;
  const numericAmount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string" && rawAmount.trim() !== ""
        ? Number(rawAmount.trim())
        : Number.NaN;

  if (!Number.isFinite(numericAmount) || numericAmount === 0) {
    throw new Error("Enable Banking transaction has an invalid amount");
  }

  return numericAmount;
};

const getTransactionDescription = (transaction: EnableBankingTransactionLike) => {
  const normalizeDescription = (description?: string) => {
    const normalized = description?.trim();
    return normalized || undefined;
  };

  const remittance = transaction.remittance_information;
  if (Array.isArray(remittance)) {
    return (
      remittance.map((part) => part.trim()).filter(Boolean).join(" ") ||
      "Bank transaction"
    );
  }

  return (
    normalizeDescription(remittance) ||
    normalizeDescription(transaction.additional_information) ||
    normalizeDescription(transaction.creditor_name) ||
    normalizeDescription(transaction.debtor_name) ||
    "Bank transaction"
  );
};

const assertValidTransactionDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Enable Banking transaction has an invalid date");
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || toIsoDate(parsedDate) !== date) {
    throw new Error("Enable Banking transaction has an invalid date");
  }
};

const getTransactionType = (
  transaction: EnableBankingTransactionLike,
  amount: number
): "Income" | "Expenditure" => {
  const indicator = transaction.credit_debit_indicator?.toUpperCase();
  if (indicator === "CRDT" || indicator === "CREDIT") return "Income";
  if (indicator === "DBIT" || indicator === "DEBIT") return "Expenditure";
  return amount < 0 ? "Income" : "Expenditure";
};

export const normalizeEnableBankingTransaction = ({
  transaction,
  accountId,
  accountName,
  fundId,
}: {
  transaction: EnableBankingTransactionLike;
  accountId: string;
  accountName: string;
  fundId?: string | null;
}): ChurchCoinPendingBankTransaction => {
  const date =
    transaction.booking_date ||
    transaction.value_date ||
    transaction.transaction_date;
  if (!date) {
    throw new Error("Enable Banking transaction is missing a date");
  }
  assertValidTransactionDate(date);

  const amount = getTransactionAmount(transaction);
  const providerTransactionId =
    transaction.entry_reference || transaction.transaction_id;
  if (!providerTransactionId) {
    throw new Error("Enable Banking transaction is missing an identifier");
  }

  return {
    date,
    description: getTransactionDescription(transaction),
    amount: Math.abs(amount),
    type: getTransactionType(transaction, amount),
    accountId,
    accountName,
    fundId: fundId ?? null,
    providerTransactionId,
  };
};
