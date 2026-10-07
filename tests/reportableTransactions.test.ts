import { describe, expect, it } from "vitest";
import {
  filterFundBalanceRows,
  filterIncomeAndExpenditure,
  hasBankEffect,
  isReportableIncomeTransaction,
  isUnlinkedMovementLeg,
  ledgerEffect,
  sumFundBalance,
  sumRaised,
  sumReportableIncome,
  transfersByFund,
  type LedgerRow,
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
      row: { amount: 100, type: "Income" as const, cashBankingRole: "bank_deposit" as const, isVoided: true },
      effect: { bank: false, fund: false, activity: "none" },
    },
    {
      // Older reopen code left the deposit tag on rows later edited to expenditure.
      row: { amount: 100, type: "Expenditure" as const, cashBankingRole: "bank_deposit" as const },
      effect: { bank: true, fund: true, activity: "expenditure" },
    },
    {
      row: { amount: 100, type: "Income" as const, cashBankingRole: "bank_deposit" as const, movementKind: "loan" as const },
      effect: { bank: true, fund: false, activity: "none" },
    },
    {
      row: { amount: 300, type: "Expenditure" as const, movementKind: "transfer" as const, isJournal: true },
      effect: { bank: false, fund: true, activity: "transfer" },
    },
    {
      row: { amount: 300, type: "Income" as const, movementKind: "transfer" as const },
      effect: { bank: true, fund: true, activity: "transfer" },
    },
    {
      row: { amount: 300, type: "Expenditure" as const, movementKind: "transfer" as const },
      effect: { bank: true, fund: true, activity: "transfer" },
    },
    {
      row: { amount: 300, type: "Expenditure" as const, movementKind: "transfer" as const, isVoided: true },
      effect: { bank: false, fund: false, activity: "none" },
    },
    {
      row: { amount: 40, type: "Income" as const, movementKind: "reversal" as const },
      effect: { bank: true, fund: true, activity: "none" },
    },
    {
      row: { amount: 5000, type: "Income" as const, movementKind: "loan" as const },
      effect: { bank: true, fund: true, activity: "none" },
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

describe("movement views", () => {
  const movements = [
    { _id: "gift", fundId: "general", amount: 1000, type: "Income" as const },
    { _id: "out", fundId: "general", amount: 300, type: "Expenditure" as const, movementKind: "transfer" as const },
    { _id: "in", fundId: "building", amount: 300, type: "Income" as const, movementKind: "transfer" as const },
    { _id: "bounced", fundId: "general", amount: 40, type: "Expenditure" as const, movementKind: "reversal" as const },
    { _id: "loan", fundId: "building", amount: 5000, type: "Income" as const, movementKind: "loan" as const },
  ];

  it("keeps movements out of income and spending", () => {
    expect(filterIncomeAndExpenditure(movements).map((t) => t._id)).toEqual(["gift"]);
    expect(sumReportableIncome(movements)).toBe(1000);
  });

  it("still moves fund balances", () => {
    expect(sumFundBalance(movements.filter((t) => t.fundId === "general"))).toBe(660);
    expect(sumFundBalance(movements.filter((t) => t.fundId === "building"))).toBe(5300);
  });

  it("counts giving and transfers in as raised, but not transfers out, returns or loans", () => {
    expect(sumRaised(movements.filter((t) => t.fundId === "general"))).toBe(1000);
    expect(sumRaised(movements.filter((t) => t.fundId === "building"))).toBe(300);
  });

  it("nets transfers per fund and shows the unmatched difference", () => {
    expect(transfersByFund(movements)).toEqual({
      funds: [
        { fundId: "general", in: 0, out: 300, net: -300 },
        { fundId: "building", in: 300, out: 0, net: 300 },
      ],
      unmatched: 0,
    });
    expect(transfersByFund(movements.filter((t) => t._id !== "in")).unmatched).toBe(-300);
  });

  it("flags transfer, returned payment and loan legs waiting for their other side", () => {
    const leg = (extra: Partial<LedgerRow>): LedgerRow => ({ amount: 10, type: "Income", ...extra });
    expect(isUnlinkedMovementLeg(leg({ movementKind: "transfer" }))).toBe(true);
    expect(isUnlinkedMovementLeg(leg({ movementKind: "reversal" }))).toBe(true);
    expect(isUnlinkedMovementLeg(leg({ movementKind: "loan" }))).toBe(true);
    expect(isUnlinkedMovementLeg(leg({ movementKind: "loan", movementId: "m1" }))).toBe(false);
    expect(isUnlinkedMovementLeg(leg({ movementKind: "loan", isVoided: true }))).toBe(false);
    expect(isUnlinkedMovementLeg(leg({ movementKind: "transfer", movementId: "m1" }))).toBe(false);
    expect(isUnlinkedMovementLeg(leg({ movementKind: "transfer", isVoided: true }))).toBe(false);
    expect(isUnlinkedMovementLeg(leg({}))).toBe(false);
  });
});
