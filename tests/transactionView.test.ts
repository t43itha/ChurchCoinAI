import { describe, expect, it } from "vitest";
import {
  editDraftProblem,
  editingAfterSave,
  errorMessage,
  filterTransactions,
  formatSignedAmount,
  groupByDay,
  needsYou,
  parseStatusFilter,
  periodTotals,
  type TransactionFilters,
} from "../components/transactions/transactionView";
import type { Transaction } from "../types";

const row = (overrides: Partial<Transaction>): Transaction =>
  ({
    _id: "tx",
    date: "2026-10-06",
    description: "Sunday collection",
    amount: 100,
    type: "Income",
    category: "Offerings",
    fundId: "general",
    isReconciled: false,
    ...overrides,
  }) as Transaction;

const noFilters: TransactionFilters = {
  search: "",
  month: null,
  year: null,
  category: "",
  fundId: "",
  status: "all",
};
const none = new Set<string>();

describe("filterTransactions", () => {
  it("sorts newest first", () => {
    const rows = [row({ _id: "a", date: "2026-10-01" }), row({ _id: "b", date: "2026-10-09" })];
    expect(filterTransactions(rows, noFilters, none).map((t) => t._id)).toEqual(["b", "a"]);
  });

  it("searches description, category, donor and amount, ignoring case", () => {
    const rows = [
      row({ _id: "a", description: "Tithe envelopes" }),
      row({ _id: "b", description: "Other", donorName: "J Okafor" }),
      row({ _id: "c", description: "Other", amount: 42.5 }),
    ];
    const search = (term: string) =>
      filterTransactions(rows, { ...noFilters, search: term }, none).map((t) => t._id);
    expect(search("TITHE")).toEqual(["a"]);
    expect(search("okafor")).toEqual(["b"]);
    expect(search("42.5")).toEqual(["c"]);
  });

  it("filters by month, year, fund and category", () => {
    const rows = [
      row({ _id: "a", date: "2026-10-06", fundId: "general", category: "Offerings" }),
      row({ _id: "b", date: "2026-09-06", fundId: "general", category: "Offerings" }),
      row({ _id: "c", date: "2026-10-06", fundId: "building", category: "Donations" }),
    ];
    const ids = (filters: Partial<TransactionFilters>) =>
      filterTransactions(rows, { ...noFilters, ...filters }, none).map((t) => t._id);
    expect(ids({ month: 9, year: 2026 })).toEqual(["a", "c"]);
    expect(ids({ fundId: "building" })).toEqual(["c"]);
    expect(ids({ category: "Offerings" })).toEqual(["a", "b"]);
  });

  it("applies each status option", () => {
    const rows = [
      row({ _id: "voided", isVoided: true }),
      row({ _id: "reconciled", isReconciled: true }),
      row({ _id: "income-no-pledge" }),
      row({ _id: "income-pledged", pledgeId: "p1" }),
      row({ _id: "waiting", movementKind: "transfer", type: "Expenditure" }),
      row({ _id: "retired", category: "Old category" }),
    ];
    const ids = (status: TransactionFilters["status"]) =>
      filterTransactions(rows, { ...noFilters, status }, new Set(["Old category"])).map((t) => t._id).sort();
    expect(ids("active")).not.toContain("voided");
    expect(ids("voided")).toEqual(["voided"]);
    expect(ids("reconciled")).toEqual(["reconciled"]);
    expect(ids("unreconciled")).not.toContain("reconciled");
    // Any income without a pledge, voided or not.
    expect(ids("unlinked")).toEqual(["income-no-pledge", "reconciled", "retired", "voided"]);
    expect(ids("awaiting-link")).toEqual(["waiting"]);
    expect(ids("needs-reclassifying")).toEqual(["retired"]);
  });
});

describe("needsYou", () => {
  const retired = new Set(["Old category"]);

  it("is true for uncategorised, retired-category and waiting rows", () => {
    expect(needsYou(row({ category: "" }), retired)).toBe(true);
    expect(needsYou(row({ category: "Old category" }), retired)).toBe(true);
    expect(needsYou(row({ movementKind: "transfer", type: "Expenditure" }), retired)).toBe(true);
  });

  it("leaves categorised income without a pledge to the Unlinked income filter", () => {
    expect(needsYou(row({ category: "Offerings" }), retired)).toBe(false);
    expect(needsYou(row({ category: "Offerings", pledgeId: "p1" }), retired)).toBe(false);
    expect(needsYou(row({ category: "Repairs", type: "Expenditure" }), retired)).toBe(false);
  });

  it("is false for voided rows", () => {
    expect(needsYou(row({ category: "", isVoided: true }), retired)).toBe(false);
  });
});

describe("editDraftProblem", () => {
  const draft = { date: "2026-10-06", description: "Sunday collection", amount: 100 };

  it("accepts a complete draft", () => {
    expect(editDraftProblem(draft)).toBeNull();
  });

  it("refuses a blank or whitespace-only description", () => {
    expect(editDraftProblem({ ...draft, description: "" })).toBe("Add a description before saving.");
    expect(editDraftProblem({ ...draft, description: "   " })).toBe("Add a description before saving.");
  });

  it("refuses a missing date", () => {
    expect(editDraftProblem({ ...draft, date: "" })).toBe("Add a date before saving.");
  });

  it("refuses a cleared, zero or negative amount, as the server does", () => {
    expect(editDraftProblem({ ...draft, amount: NaN })).toBe("Enter an amount greater than 0.");
    expect(editDraftProblem({ ...draft, amount: 0 })).toBe("Enter an amount greater than 0.");
    expect(editDraftProblem({ ...draft, amount: -5 })).toBe("Enter an amount greater than 0.");
  });
});

describe("groupByDay", () => {
  it("groups rows under their date in the order given, with the day's net", () => {
    const rows = [
      row({ _id: "a", date: "2026-10-06", amount: 200, type: "Income" }),
      row({ _id: "b", date: "2026-10-06", amount: 50.25, type: "Expenditure" }),
      row({ _id: "c", date: "2026-10-04", amount: 10, type: "Income" }),
    ];
    const groups = groupByDay(rows);
    expect(groups.map((group) => group.date)).toEqual(["2026-10-06", "2026-10-04"]);
    expect(groups[0].rows.map((t) => t._id)).toEqual(["a", "b"]);
    expect(groups[0].net).toBe(149.75);
    expect(groups[1].net).toBe(10);
  });

  it("leaves voided rows and cash banking deposits out of the day's net", () => {
    const rows = [
      row({ _id: "a", date: "2026-10-06", amount: 100 }),
      row({ _id: "void", date: "2026-10-06", amount: 999, isVoided: true }),
      row({ _id: "deposit", date: "2026-10-06", amount: 500, type: "Income", cashBankingRole: "bank_deposit" }),
    ];
    expect(groupByDay(rows)[0].net).toBe(100);
  });
});

describe("periodTotals", () => {
  it("sums money in and out from reportable rows only", () => {
    const rows = [
      row({ amount: 300, type: "Income" }),
      row({ amount: 120.5, type: "Expenditure" }),
      row({ amount: 40, type: "Income", isVoided: true }),
      row({ amount: 80, type: "Income", cashBankingRole: "bank_deposit" }),
    ];
    expect(periodTotals(rows)).toEqual({ moneyIn: 300, moneyOut: 120.5, net: 179.5 });
  });
});

describe("formatSignedAmount", () => {
  it("prefixes income with a plus and spending with a minus sign", () => {
    expect(formatSignedAmount({ type: "Income", amount: 1902.5 })).toBe("+£1,902.50");
    expect(formatSignedAmount({ type: "Expenditure", amount: 486.2 })).toBe("−£486.20");
  });
});

describe("parseStatusFilter", () => {
  it("accepts known statuses and falls back to all", () => {
    expect(parseStatusFilter("unlinked")).toBe("unlinked");
    expect(parseStatusFilter("nope")).toBe("all");
    expect(parseStatusFilter(null)).toBe("all");
  });
});

describe("editingAfterSave", () => {
  it("moves on to the next row from the row that was saved", () => {
    expect(editingAfterSave("a", "a", "b")).toBe("b");
  });

  it("closes after the last row, or after a save that did not ask to go on", () => {
    expect(editingAfterSave("a", "a", null)).toBeNull();
  });

  it("keeps a row opened while the save was still pending", () => {
    expect(editingAfterSave("c", "a", "b")).toBe("c");
    expect(editingAfterSave("c", "a", null)).toBe("c");
  });

  it("stays closed when the panel was dismissed during the save", () => {
    expect(editingAfterSave(null, "a", "b")).toBeNull();
  });
});

describe("errorMessage", () => {
  it("returns the server's message without Convex's wrapper", () => {
    const wrapped = new Error("[Request ID: abc] Server Error\nUncaught ConvexError: This row is locked by a completed reconciliation\n    at handler");
    expect(errorMessage(wrapped, "fallback")).toBe("This row is locked by a completed reconciliation");
  });

  it("falls back when there is nothing usable", () => {
    expect(errorMessage("boom", "fallback")).toBe("fallback");
    expect(errorMessage(new Error(""), "fallback")).toBe("fallback");
  });
});
