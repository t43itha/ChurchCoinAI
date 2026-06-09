import { describe, expect, it } from "vitest";
import {
  filterReportableTransactions,
  isCashBankingDeposit,
  isReportableIncomeTransaction,
  sumReportableSigned,
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

describe("reportable transaction helpers", () => {
  it("identifies cash/cheque banking deposit transactions", () => {
    expect(isCashBankingDeposit(transactions[1])).toBe(true);
    expect(isCashBankingDeposit(transactions[0])).toBe(false);
    expect(isCashBankingDeposit(transactions[2])).toBe(false);
  });

  it("keeps original source giving reportable and excludes linked bank deposits", () => {
    expect(isReportableIncomeTransaction(transactions[0])).toBe(true);
    expect(isReportableIncomeTransaction(transactions[1])).toBe(false);
    expect(isReportableIncomeTransaction(transactions[2])).toBe(true);
    expect(isReportableIncomeTransaction(transactions[3])).toBe(false);
    expect(isReportableIncomeTransaction(transactions[4])).toBe(false);
  });

  it("filters active reportable transactions while keeping expenditure", () => {
    expect(filterReportableTransactions(transactions).map((t) => t._id)).toEqual(
      ["source-cash", "direct-bank-gift", "expense"]
    );
  });

  it("sums reportable income and expenditure without double-counting banking deposits", () => {
    expect(sumReportableSigned(transactions)).toBe(155);
  });
});
