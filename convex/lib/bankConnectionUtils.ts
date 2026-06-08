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

export type GoCardlessAmount = {
  amount?: string | number;
  currency?: string;
};

export type GoCardlessTransactionLike = {
  transactionId?: string;
  internalTransactionId?: string;
  entryReference?: string;
  bookingDate?: string;
  valueDate?: string;
  bookingDateTime?: string;
  valueDateTime?: string;
  transactionAmount?: GoCardlessAmount;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  additionalInformation?: string;
  creditorName?: string;
  debtorName?: string;
};

export type CalculateSyncRangeArgs = {
  today: string;
  lastSyncedThrough?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const normalizeDescription = (description?: string) => {
  const normalized = description?.trim();
  return normalized || undefined;
};

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

const assertValidProviderTransactionDate = (date: string, provider: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${provider} transaction has an invalid date`);
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || toIsoDate(parsedDate) !== date) {
    throw new Error(`${provider} transaction has an invalid date`);
  }
};

const normalizeProviderTransactionDateTime = (
  dateTime: string,
  provider: string
) => {
  const normalized = dateTime.trim();
  const date = normalized.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}T/.test(normalized)) {
    throw new Error(`${provider} transaction has an invalid date`);
  }

  assertValidProviderTransactionDate(date, provider);

  const parsedDateTime = new Date(normalized);
  if (Number.isNaN(parsedDateTime.getTime())) {
    throw new Error(`${provider} transaction has an invalid date`);
  }

  return date;
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
  assertValidProviderTransactionDate(date, "Enable Banking");

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

const getGoCardlessTransactionAmount = (
  transaction: GoCardlessTransactionLike
) => {
  const rawAmount = transaction.transactionAmount?.amount;
  const numericAmount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string" && rawAmount.trim() !== ""
        ? Number(rawAmount.trim())
        : Number.NaN;

  if (!Number.isFinite(numericAmount) || numericAmount === 0) {
    throw new Error("GoCardless transaction has an invalid amount");
  }

  return numericAmount;
};

const getGoCardlessTransactionDescription = (
  transaction: GoCardlessTransactionLike
) => {
  const remittanceArray = transaction.remittanceInformationUnstructuredArray;
  const joinedRemittance = Array.isArray(remittanceArray)
    ? remittanceArray.map((part) => part.trim()).filter(Boolean).join(" ")
    : undefined;

  return (
    normalizeDescription(transaction.remittanceInformationUnstructured) ||
    normalizeDescription(joinedRemittance) ||
    normalizeDescription(transaction.additionalInformation) ||
    normalizeDescription(transaction.creditorName) ||
    normalizeDescription(transaction.debtorName) ||
    "Bank transaction"
  );
};

const getGoCardlessTransactionDate = (transaction: GoCardlessTransactionLike) => {
  if (transaction.bookingDate) {
    assertValidProviderTransactionDate(transaction.bookingDate, "GoCardless");
    return transaction.bookingDate;
  }

  if (transaction.valueDate) {
    assertValidProviderTransactionDate(transaction.valueDate, "GoCardless");
    return transaction.valueDate;
  }

  if (transaction.bookingDateTime) {
    return normalizeProviderTransactionDateTime(
      transaction.bookingDateTime,
      "GoCardless"
    );
  }

  if (transaction.valueDateTime) {
    return normalizeProviderTransactionDateTime(
      transaction.valueDateTime,
      "GoCardless"
    );
  }

  return undefined;
};

export const normalizeGoCardlessTransaction = ({
  transaction,
  accountId,
  accountName,
  fundId,
}: {
  transaction: GoCardlessTransactionLike;
  accountId: string;
  accountName: string;
  fundId?: string | null;
}): ChurchCoinPendingBankTransaction => {
  const date = getGoCardlessTransactionDate(transaction);
  if (!date) {
    throw new Error("GoCardless transaction is missing a date");
  }

  const amount = getGoCardlessTransactionAmount(transaction);
  const providerTransactionId =
    normalizeDescription(transaction.transactionId) ||
    normalizeDescription(transaction.internalTransactionId) ||
    normalizeDescription(transaction.entryReference);

  if (!providerTransactionId) {
    throw new Error("GoCardless transaction is missing an identifier");
  }

  return {
    date,
    description: getGoCardlessTransactionDescription(transaction),
    amount: Math.abs(amount),
    type: amount > 0 ? "Income" : "Expenditure",
    accountId,
    accountName,
    fundId: fundId ?? null,
    providerTransactionId,
  };
};
