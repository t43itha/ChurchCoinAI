import { describe, expect, it } from "vitest";
import {
  filterFundBalanceRows,
  filterIncomeAndExpenditure,
  hasBankEffect,
  isReportableIncomeTransaction,
  ledgerEffect,
  sumFundBalance,
  sumReportableIncome,
} from "../lib/reportableTransactions";

const transactions = [
  {
    _id: "source-cash",
    amount: 100,
    type: "Income" as const,
    cashBankingRole: "source_giving" as const,
  },
  {
    _id: "bank-deposit",
    amount: 100,
    type: "Income" as const,
    cashBankingRole: "bank_deposit" as const,
  },
  { _id: "direct-bank-gift", amount: 75, type: "Income" as const },
  { _id: "expense", amount: 20, type: "Expenditure" as const },
  { _id: "voided-income", amount: 50, type: "Income" as const, isVoided: true },
];

describe("ledgerEffect", () => {
  it.each([
    {
      row: { amount: 50, type: "Income" as const, isVoided: true },
      effect: { bank: false, fund: false, activity: "none" },
    },
    {
      row: { amount: 50, type: "Expenditure" as const, isVoided: true },
      effect: { bank: false, fund: false, activity: "none" },
    },
    {
      row: { amount: 100, type: "Income" as const, cashBankingRole: "bank_deposit" as const },
      effect: { bank: true, fund: false, activity: "none" },
    },
    {
      row: { amount: 100, type: "Income" as const, cashBankingRole: "source_giving" as const },
      effect: { bank: true, fund: true, activity: "income" },
    },
    {
      row: { amount: 75, type: "Income" as const },
      effect: { bank: true, fund: true, activity: "income" },
    },
    {
      row: { amount: 20, type: "Expenditure" as const },
      effect: { bank: true, fund: true, activity: "expenditure" },
    },
  ])("classifies $row as $effect", ({ row, effect }) => {
    expect(ledgerEffect(row)).toEqual(effect);
  });
});

describe("ledger effect views", () => {
  it("keeps original source giving as income and excludes linked bank deposits", () => {
    expect(isReportableIncomeTransaction(transactions[0])).toBe(true);
    expect(isReportableIncomeTransaction(transactions[1])).toBe(false);
    expect(isReportableIncomeTransaction(transactions[2])).toBe(true);
    expect(isReportableIncomeTransaction(transactions[3])).toBe(false);
    expect(isReportableIncomeTransaction(transactions[4])).toBe(false);
  });

  it("filters active income and expenditure while dropping banking deposits", () => {
    expect(filterIncomeAndExpenditure(transactions).map((t) => t._id)).toEqual(
      ["source-cash", "direct-bank-gift", "expense"]
    );
  });

  it("keeps the same rows for fund balances", () => {
    expect(filterFundBalanceRows(transactions).map((t) => t._id)).toEqual(
      ["source-cash", "direct-bank-gift", "expense"]
    );
  });

  it("keeps banking deposits but not voided rows for bank reconciliation", () => {
    expect(transactions.filter(hasBankEffect).map((t) => t._id)).toEqual(
      ["source-cash", "bank-deposit", "direct-bank-gift", "expense"]
    );
  });

  it("sums income and fund balances without double-counting banking deposits", () => {
    expect(sumReportableIncome(transactions)).toBe(175);
    expect(sumFundBalance(transactions)).toBe(155);
  });

  it("rounds accumulated report totals to the nearest penny", () => {
    const fractionalTransactions = [
      { amount: 0.1, type: "Income" as const },
      { amount: 0.2, type: "Income" as const },
      { amount: 0.1, type: "Expenditure" as const },
    ];

    expect(sumReportableIncome(fractionalTransactions)).toBe(0.3);
    expect(sumFundBalance(fractionalTransactions)).toBe(0.2);
  });
});
