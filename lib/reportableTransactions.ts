import { filterActiveTransactions, isActiveTransaction } from "./voidedTransactions";

export type ReportableTransaction = {
  amount: number;
  type: "Income" | "Expenditure";
  isVoided?: boolean;
  cashBankingRole?: "source_giving" | "bank_deposit";
  category?: string;
};

export function isCashBankingDeposit(transaction: {
  cashBankingRole?: "source_giving" | "bank_deposit";
}) {
  return transaction.cashBankingRole === "bank_deposit";
}

export function isReportableIncomeTransaction<T extends ReportableTransaction>(
  transaction: T
) {
  return (
    isActiveTransaction(transaction) &&
    transaction.type === "Income" &&
    !isCashBankingDeposit(transaction)
  );
}

export function isReportableTransaction<T extends ReportableTransaction>(
  transaction: T
) {
  if (!isActiveTransaction(transaction)) {
    return false;
  }

  if (transaction.type === "Income") {
    return !isCashBankingDeposit(transaction);
  }

  return true;
}

export function filterReportableTransactions<T extends ReportableTransaction>(
  transactions: T[]
) {
  return filterActiveTransactions(transactions).filter(isReportableTransaction);
}

export function sumReportableIncome<T extends ReportableTransaction>(
  transactions: T[]
) {
  return filterReportableTransactions(transactions)
    .filter((transaction) => transaction.type === "Income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function sumReportableSigned<T extends ReportableTransaction>(
  transactions: T[]
) {
  return filterReportableTransactions(transactions).reduce(
    (sum, transaction) =>
      transaction.type === "Income"
        ? sum + transaction.amount
        : sum - transaction.amount,
    0
  );
}
