import { isActiveTransaction } from "./voidedTransactions";
import { sumMoney } from "../convex/lib/money";

export type LedgerActivity = "income" | "expenditure" | "transfer" | "none";

// What a row does: counts towards the bank balance and reconciliation, counts
// towards its fund's balance, and where it appears in income and spending reports.
export type LedgerEffect = {
  bank: boolean;
  fund: boolean;
  activity: LedgerActivity;
};

export type LedgerRow = {
  amount: number;
  type: "Income" | "Expenditure";
  isVoided?: boolean;
  cashBankingRole?: "source_giving" | "bank_deposit";
};

// First match wins. Rows matching none of these are plain income or expenditure.
const LEDGER_RULES: { matches: (row: LedgerRow) => boolean; effect: LedgerEffect }[] = [
  {
    matches: (row) => !isActiveTransaction(row),
    effect: { bank: false, fund: false, activity: "none" },
  },
  {
    // Banking cash already recorded as giving: the money reaches the bank, but
    // the source giving rows already count it towards the fund and income.
    // Deposits are always income; older reopen code left the tag on rows that
    // were later edited to expenditure, and those still count as expenditure.
    matches: (row) => row.cashBankingRole === "bank_deposit" && row.type === "Income",
    effect: { bank: true, fund: false, activity: "none" },
  },
];

export function ledgerEffect(row: LedgerRow): LedgerEffect {
  for (const rule of LEDGER_RULES) {
    if (rule.matches(row)) return rule.effect;
  }
  return {
    bank: true,
    fund: true,
    activity: row.type === "Income" ? "income" : "expenditure",
  };
}

// For display and filtering by void status only. Totals, reports, and matching
// must use the ledgerEffect views below, which also exclude cash banking deposits.
export function isVoidedTransaction(transaction: { isVoided?: boolean }) {
  return !isActiveTransaction(transaction);
}

export function filterIncomeAndExpenditure<T extends LedgerRow>(rows: T[]) {
  return rows.filter((row) => {
    const { activity } = ledgerEffect(row);
    return activity === "income" || activity === "expenditure";
  });
}

export function filterFundBalanceRows<T extends LedgerRow>(rows: T[]) {
  return rows.filter((row) => ledgerEffect(row).fund);
}

export function sumFundBalance<T extends LedgerRow>(rows: T[]) {
  return sumMoney(filterFundBalanceRows(rows), (row) =>
    row.type === "Income" ? row.amount : -row.amount
  );
}

export function isReportableIncomeTransaction<T extends LedgerRow>(row: T) {
  return ledgerEffect(row).activity === "income";
}

export function sumReportableIncome<T extends LedgerRow>(rows: T[]) {
  return sumMoney(rows.filter(isReportableIncomeTransaction), (row) => row.amount);
}

export function hasBankEffect(row: LedgerRow) {
  return ledgerEffect(row).bank;
}
