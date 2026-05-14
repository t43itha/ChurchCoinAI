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

export const isPendingStateExpired = (now: number, expiresAt: number) =>
  now >= expiresAt;

const getTransactionAmount = (transaction: EnableBankingTransactionLike) => {
  const rawAmount =
    transaction.amount?.amount ?? transaction.transaction_amount?.amount;
  const numericAmount =
    typeof rawAmount === "number" ? rawAmount : Number.parseFloat(rawAmount ?? "");

  if (!Number.isFinite(numericAmount) || numericAmount === 0) {
    throw new Error("Enable Banking transaction has an invalid amount");
  }

  return numericAmount;
};

const getTransactionDescription = (transaction: EnableBankingTransactionLike) => {
  const remittance = transaction.remittance_information;
  if (Array.isArray(remittance)) {
    return remittance.filter(Boolean).join(" ").trim() || "Bank transaction";
  }

  return (
    remittance ||
    transaction.additional_information ||
    transaction.creditor_name ||
    transaction.debtor_name ||
    "Bank transaction"
  ).trim();
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
