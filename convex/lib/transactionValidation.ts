const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const assertValidTransactionAmount = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Transaction amount must be greater than 0");
  }
};

export const assertValidTransactionDate = (date: string) => {
  if (!DATE_REGEX.test(date)) {
    throw new Error("Transaction date must use YYYY-MM-DD format");
  }
};
