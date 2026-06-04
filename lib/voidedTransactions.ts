export type VoidableTransaction = {
  amount: number;
  type: "Income" | "Expenditure";
  isVoided?: boolean;
};

export function isActiveTransaction(transaction: { isVoided?: boolean }) {
  return transaction.isVoided !== true;
}

export function filterActiveTransactions<T extends { isVoided?: boolean }>(
  transactions: T[]
) {
  return transactions.filter(isActiveTransaction);
}

export function sumActiveIncome<T extends VoidableTransaction>(
  transactions: T[]
) {
  return filterActiveTransactions(transactions)
    .filter((transaction) => transaction.type === "Income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function sumActiveSigned<T extends VoidableTransaction>(
  transactions: T[]
) {
  return filterActiveTransactions(transactions).reduce((sum, transaction) => {
    return transaction.type === "Income"
      ? sum + transaction.amount
      : sum - transaction.amount;
  }, 0);
}
