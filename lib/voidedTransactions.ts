// Void-only helpers for operational code (reconciliation, cash banking, void UI).
// They keep cash banking deposits, so never use them for totals, reports, or
// matching: use lib/reportableTransactions instead. ESLint enforces this.
export function isActiveTransaction(transaction: { isVoided?: boolean }) {
  return transaction.isVoided !== true;
}

export function filterActiveTransactions<T extends { isVoided?: boolean }>(
  transactions: T[]
) {
  return transactions.filter(isActiveTransaction);
}
