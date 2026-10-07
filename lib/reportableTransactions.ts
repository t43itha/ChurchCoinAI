import { isActiveTransaction } from "./voidedTransactions";
import { roundMoney, sumMoney } from "../convex/lib/money";
import type { MovementKind } from "./movementCategories";

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
  movementKind?: MovementKind;
  movementId?: string;
  isJournal?: boolean;
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
  {
    // An app-created leg moving money between funds inside one bank account.
    matches: (row) => row.isJournal === true,
    effect: { bank: false, fund: true, activity: "transfer" },
  },
  {
    matches: (row) => row.movementKind === "transfer",
    effect: { bank: true, fund: true, activity: "transfer" },
  },
  {
    // Returned payments and loans move fund balances but are neither giving
    // nor spending, and never appear on the transfers line.
    matches: (row) => row.movementKind === "reversal" || row.movementKind === "loan",
    effect: { bank: true, fund: true, activity: "none" },
  },
];

export function ledgerEffect(row: LedgerRow): LedgerEffect {
  for (const rule of LEDGER_RULES) {
    if (rule.matches(row)) return { ...rule.effect };
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

// Campaign "raised": giving plus transfers into the fund. A transfer out does
// not reduce it, the same as spending.
export function sumRaised<T extends LedgerRow>(rows: T[]) {
  return sumMoney(
    rows.filter((row) => {
      const { activity } = ledgerEffect(row);
      return activity === "income" || (activity === "transfer" && row.type === "Income");
    }),
    (row) => row.amount
  );
}

export type FundTransfers = { fundId: string; in: number; out: number; net: number };

// Money in, out and net per fund on the transfers line. Across all funds the
// nets cancel once every transfer has both sides; anything left is unmatched.
export function transfersByFund<T extends LedgerRow & { fundId: string }>(rows: T[]) {
  const legsByFund = new Map<string, T[]>();
  for (const row of rows) {
    if (ledgerEffect(row).activity !== "transfer") continue;
    const legs = legsByFund.get(row.fundId);
    if (legs) legs.push(row);
    else legsByFund.set(row.fundId, [row]);
  }

  const funds: FundTransfers[] = [...legsByFund].map(([fundId, legs]) => {
    const moneyIn = sumMoney(legs.filter((row) => row.type === "Income"), (row) => row.amount);
    const moneyOut = sumMoney(legs.filter((row) => row.type === "Expenditure"), (row) => row.amount);
    return { fundId, in: moneyIn, out: moneyOut, net: roundMoney(moneyIn - moneyOut) };
  });
  return { funds, unmatched: sumMoney(funds, (fund) => fund.net) };
}

export type TransferSummary = {
  funds: Array<FundTransfers & { fund: string }>;
  unmatched: number;
};

// The "Transfers between funds" report section, with fund names, by name.
export function buildTransferSummary<T extends LedgerRow & { fundId: string }>(
  rows: T[],
  funds: Array<{ _id: string; name: string }>
): TransferSummary {
  const names = new Map(funds.map((fund) => [fund._id, fund.name]));
  const { funds: byFund, unmatched } = transfersByFund(rows);
  return {
    funds: byFund
      .map((transfers) => ({ ...transfers, fund: names.get(transfers.fundId) ?? "Unknown fund" }))
      .sort((a, b) => a.fund.localeCompare(b.fund)),
    unmatched,
  };
}

// A transfer, returned payment or loan leg not yet linked to its other side.
// Loan legs count too: the loan register links each receipt and repayment.
export function isUnlinkedMovementLeg(row: LedgerRow) {
  return (
    isActiveTransaction(row) &&
    (row.movementKind === "transfer" ||
      row.movementKind === "reversal" ||
      row.movementKind === "loan") &&
    row.movementId === undefined
  );
}
