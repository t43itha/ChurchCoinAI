import { isActiveTransaction } from "./voidedTransactions";

const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

export type BankingMedium = "cash" | "cheque" | "mixed";
export type CashBankingStatus = "not_started" | "partially_banked" | "banked";

export type CollectionBankingTransaction = {
  _id: string;
  cashCollectionId?: string;
  paymentMethod?: "Cash" | "Cheque" | "Bank" | "Card" | "Online" | "PDQ";
  amount: number;
  type: "Income" | "Expenditure";
  isVoided?: boolean;
};

export type CollectionSplit = {
  cashCollectionId: string;
  cashAmount: number;
  chequeAmount: number;
};

export type BankTransactionSplitInput = {
  transactionId: string;
  transactionAmount: number;
  medium: BankingMedium;
  cashAmount?: number;
  chequeAmount?: number;
};

export type BankTransactionSplit = {
  transactionId: string;
  medium: BankingMedium;
  cashAmount: number;
  chequeAmount: number;
};

export type ReconciliationSummary = {
  expectedCashAmount: number;
  expectedChequeAmount: number;
  expectedTotal: number;
  bankedCashAmount: number;
  bankedChequeAmount: number;
  bankedTotal: number;
  varianceAmount: number;
};

export function calculateCollectionBankingTotals(
  cashCollectionId: string,
  transactions: CollectionBankingTransaction[]
) {
  const totals = transactions
    .filter(
      (transaction) =>
        transaction.cashCollectionId === cashCollectionId &&
        transaction.type === "Income" &&
        isActiveTransaction(transaction)
    )
    .reduce(
      (acc, transaction) => {
        if (transaction.paymentMethod === "Cash") {
          acc.cashAmount += transaction.amount;
        }
        if (transaction.paymentMethod === "Cheque") {
          acc.chequeAmount += transaction.amount;
        }
        return acc;
      },
      { cashAmount: 0, chequeAmount: 0 }
    );

  return {
    cashAmount: roundMoney(totals.cashAmount),
    chequeAmount: roundMoney(totals.chequeAmount),
    totalAmount: roundMoney(totals.cashAmount + totals.chequeAmount),
  };
}

export function normalizeBankTransactionSplits(
  splits: BankTransactionSplitInput[]
): BankTransactionSplit[] {
  return splits.map((split) => {
    if (split.transactionAmount <= 0) {
      throw new Error("Bank transaction amount must be greater than zero");
    }

    if (split.medium === "cash") {
      return {
        transactionId: split.transactionId,
        medium: split.medium,
        cashAmount: roundMoney(split.transactionAmount),
        chequeAmount: 0,
      };
    }

    if (split.medium === "cheque") {
      return {
        transactionId: split.transactionId,
        medium: split.medium,
        cashAmount: 0,
        chequeAmount: roundMoney(split.transactionAmount),
      };
    }

    const cashAmount = roundMoney(split.cashAmount ?? 0);
    const chequeAmount = roundMoney(split.chequeAmount ?? 0);
    const splitTotal = roundMoney(cashAmount + chequeAmount);

    if (splitTotal !== roundMoney(split.transactionAmount)) {
      throw new Error("Mixed bank split must equal the transaction amount");
    }

    return {
      transactionId: split.transactionId,
      medium: split.medium,
      cashAmount,
      chequeAmount,
    };
  });
}

export function calculateReconciliationSummary({
  collectionSplits,
  bankTransactionSplits,
}: {
  collectionSplits: CollectionSplit[];
  bankTransactionSplits: BankTransactionSplit[];
}): ReconciliationSummary {
  const expectedCashAmount = roundMoney(
    collectionSplits.reduce((sum, split) => sum + split.cashAmount, 0)
  );
  const expectedChequeAmount = roundMoney(
    collectionSplits.reduce((sum, split) => sum + split.chequeAmount, 0)
  );
  const bankedCashAmount = roundMoney(
    bankTransactionSplits.reduce((sum, split) => sum + split.cashAmount, 0)
  );
  const bankedChequeAmount = roundMoney(
    bankTransactionSplits.reduce((sum, split) => sum + split.chequeAmount, 0)
  );
  const expectedTotal = roundMoney(expectedCashAmount + expectedChequeAmount);
  const bankedTotal = roundMoney(bankedCashAmount + bankedChequeAmount);

  return {
    expectedCashAmount,
    expectedChequeAmount,
    expectedTotal,
    bankedCashAmount,
    bankedChequeAmount,
    bankedTotal,
    varianceAmount: roundMoney(bankedTotal - expectedTotal),
  };
}

export function getCollectionBankingStatus(
  expectedTotal: number,
  bankedTotal: number
): CashBankingStatus {
  if (bankedTotal <= 0) {
    return "not_started";
  }

  if (roundMoney(bankedTotal) >= roundMoney(expectedTotal)) {
    return "banked";
  }

  return "partially_banked";
}
