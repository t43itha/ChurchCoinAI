// Audit characterization only: these assertions document defects, not acceptance criteria.
// No network, provider, Convex deployment, or real identity is used.
import { describe, expect, it, vi } from "vitest";
import { create } from "../convex/mutations/organizations";
import { categorizeFromContext } from "../convex/intelligence/categorization/pipeline";
import { allowedCategoriesForType } from "../convex/intelligence/categorization/categoryResolver";
import { validateGeminiSuggestion } from "../convex/intelligence/categorization/gemini";
import { getRCICategorySeedData } from "../constants/rciCategories";
import { detectColumns, findHeaderRow, mapStatementRows, tokenizeCsv } from "../lib/statementImport";
import { MOVEMENT_CATEGORIES } from "../lib/movementCategories";
import { runCategorisation, runConfirmImport, screenStatementRows } from "../components/statementImport/reviewLogic";
import { confirmDeps, confirmInput } from "./helpers/importReview";

const CSV_HEADERS = ["Date", "Description", "Amount"];
const AMOUNT_MAPPING = { date: "Date", description: "Description", amount: "Amount", amountIn: "", amountOut: "" };

function database() {
  const records: Record<string, any[]> = { users: [], organizations: [], funds: [], categories: [], transactions: [] };
  const ctx: any = {
    auth: { getUserIdentity: async () => ({ subject: "synthetic-owner", email: "audit@example.invalid" }) },
    db: {
      query: (table: string) => {
        const q: any = { withIndex: () => q, first: async () => records[table]?.[0] ?? null, collect: async () => records[table] ?? [] };
        return q;
      },
      get: async (id: string) => Object.values(records).flat().find(row => row._id === id) ?? null,
      insert: async (table: string, data: any) => {
        const rows = records[table] ??= [];
        const _id = `${table}-${rows.length}`;
        rows.push({ ...data, _id });
        return _id;
      },
    },
    scheduler: { runAfter: vi.fn(), runAt: vi.fn() },
  };
  return { ctx, records };
}

describe("import category and date acceptance", () => {
  it("imports unclassified small income through the review pipeline without AI", async () => {
    const { ctx, records } = database();
    records.organizations.push({ _id: "org", accessMode: "legacy" });
    records.users.push({ _id: "user", organizationId: "org", role: "Admin", clerkId: "synthetic-owner" });
    records.funds.push({ _id: "restricted", organizationId: "org", name: "Building Fund" }, { _id: "general", organizationId: "org", name: "General Fund" });
    const mapped = mapStatementRows([{ cells: ["21/09/2026", "Unidentified credit", "30"], line: 2 }] as any, CSV_HEADERS, AMOUNT_MAPPING, false);
    const screen = screenStatementRows(mapped, records.transactions as any, getRCICategorySeedData(), records.funds);
    if (screen.tooMany) throw new Error("unexpected batch size");
    expect(screen.fresh[0]).toMatchObject({ category: "Offerings", fundId: "general", amount: 30 });
    await runConfirmImport(confirmInput({ pendingRows: screen.fresh, funds: records.funds }), confirmDeps(ctx));
    expect(records.transactions[0]).toMatchObject({ category: "Offerings", fundId: "general", amount: 30 });
  });

  it("keeps user edits and removed rows when a late AI batch arrives", async () => {
    let finish!: (value: any) => void;
    const response = new Promise((resolve) => { finish = resolve; });
    let rows: any[] = ["a", "b", "c"].map((id) => ({ reviewRowId: id, description: "Same description", amount: 90, type: "Income", category: "", fundId: "" }));
    const running = runCategorisation({
      rows,
      runCounter: { current: 0 },
      funds: [{ _id: "general", name: "General Fund" }] as any,
      categories: getRCICategorySeedData(),
      suggest: vi.fn(() => response) as any,
      setRows: (update) => { rows = typeof update === "function" ? update(rows) : update; },
      setPredictions: vi.fn(),
      setCount: vi.fn(),
      setStatus: vi.fn(),
      setIsCategorising: vi.fn(),
    });
    rows = rows.filter((row: any) => row.reviewRowId !== "c").map((row: any) => row.reviewRowId === "a" ? { ...row, category: "Building Fund" } : row);
    finish(["c", "b", "a"].map((id) => ({ rowId: id, category: "Offerings", fundId: "general", predictionSource: "openrouter", requiresReview: true, isGiftAidEligible: true })));
    await running;
    expect(rows).toHaveLength(2);
    expect(rows[0].category).toBe("Building Fund");
    expect(rows[1]).toMatchObject({ reviewRowId: "b", category: "Offerings", fundId: "general", isGiftAidEligible: false });
  });

  it("ignores late AI responses after the review is cancelled", async () => {
    let finish!: (value: any) => void;
    const response = new Promise((resolve) => { finish = resolve; });
    const runCounter = { current: 0 };
    const setRows = vi.fn();
    const setPredictions = vi.fn();
    const running = runCategorisation({
      rows: [{ reviewRowId: "a", description: "Credit", amount: 90, type: "Income" }] as any,
      runCounter,
      funds: [],
      categories: getRCICategorySeedData(),
      suggest: () => response as any,
      setRows,
      setPredictions,
      setCount: vi.fn(),
      setStatus: vi.fn(),
      setIsCategorising: vi.fn(),
    });
    runCounter.current += 1;
    finish([{ rowId: "a", category: "Offerings" }]);
    await running;
    expect(setRows).toHaveBeenCalledTimes(1);
    expect(setPredictions).toHaveBeenCalledTimes(1);
  });

  it("seeds typed income and expenditure categories for a new organization", async () => {
    const { ctx, records } = database();
    await (create as any)._handler(ctx, { name: "Synthetic Audit Church", userName: "Audit Owner", selectedPlan: "starter" });
    expect(records.categories).toHaveLength(getRCICategorySeedData().length + MOVEMENT_CATEGORIES.length);
    expect(allowedCategoriesForType(records.categories, "Income").length).toBeGreaterThan(0);
    expect(allowedCategoriesForType(records.categories, "Expenditure").length).toBeGreaterThan(0);
    const input = [{ description: "Monthly bank charges", amount: 12, type: "Expenditure" as const }];
    expect(categorizeFromContext(input, records.categories, records.funds, [])[0].category).toBe("Bank Charges");
    expect(validateGeminiSuggestion({ category: "Utilities", fundName: "General Fund", confidence: "High" }, input[0], records.categories, records.funds)).not.toBeNull();
  });

  it("keeps unreadable dates out of review and blocks confirmation of rows without a category", async () => {
    const { ctx, records } = database();
    records.organizations.push({ _id: "org", accessMode: "legacy" });
    records.users.push({ _id: "user", organizationId: "org", role: "Admin", clerkId: "synthetic-owner" });
    records.funds.push({ _id: "fund", organizationId: "org", name: "General Fund" });
    const text = "Date,Description,Amount\n31/02/2026,Electricity bill,-100\n01/03/2026,Cheque debit,(250.00)\n";
    const tokenized = tokenizeCsv(text);
    const { headerIndex, headers } = findHeaderRow(tokenized.records);
    const dataRecords = tokenized.records.slice(headerIndex === null ? 0 : headerIndex + 1);
    expect(dataRecords).toHaveLength(2);
    const { mapping, split } = detectColumns(headers, dataRecords.map((record) => record.cells));
    const mapped = mapStatementRows(dataRecords, headers, mapping, split);
    const screen = screenStatementRows(mapped, records.transactions as any, getRCICategorySeedData(), records.funds);
    if (screen.tooMany) throw new Error("unexpected batch size");
    // The impossible 31/02 row is reported with its line and kept out of review, not stored as typed.
    expect(screen.leftOutNotice).toBe("Left out: Date not real (line 2).");
    expect(screen.fresh).toHaveLength(1);
    expect(screen.fresh[0]).toMatchObject({ date: "2026-03-01", type: "Expenditure", amount: 250, category: "" });
    const deps = confirmDeps(ctx);
    await runConfirmImport(confirmInput({ pendingRows: screen.fresh, funds: records.funds }), deps);
    expect(deps.notify).toHaveBeenCalled();
    expect(records.transactions).toHaveLength(0);
  });
});
