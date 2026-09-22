// Audit characterization only: these assertions document defects, not acceptance criteria.
// No network, provider, Convex deployment, or real identity is used.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { bulkCreate } from "../convex/mutations/transactions";
import { create } from "../convex/mutations/organizations";
import { categorizeFromContext } from "../convex/intelligence/categorization/pipeline";
import { allowedCategoriesForType } from "../convex/intelligence/categorization/categoryResolver";
import { validateGeminiSuggestion } from "../convex/intelligence/categorization/gemini";
import { getRCICategorySeedData } from "../constants/rciCategories";
import { isRealIsoDate, parseImportedAmount, parseImportedDate } from "../lib/csvImport";
import { applySmallIncomeDefaults, effectiveCategories } from "../lib/smallIncomeDefaults";
import { resolveCategoryForTransaction } from "../convex/intelligence/categorization/categoryResolver";

const source = readFileSync(new URL("../components/TransactionManager.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("TransactionManager.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function uiFunction(name: string, scope: Record<string, unknown>): (...args: any[]) => any {
  let expression = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) {
      expression = node.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!expression) throw new Error(`Missing source handler ${name}`);
  const js = ts.transpileModule(`const extracted = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(scope), `${js}; return extracted;`)(...Object.values(scope));
}

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
  it("imports unclassified small income through the real CSV review handlers without AI", async () => {
    const { ctx, records } = database();
    records.organizations.push({ _id: "org", accessMode: "legacy" });
    records.users.push({ _id: "user", organizationId: "org", role: "Admin", clerkId: "synthetic-owner" });
    records.funds.push({ _id: "restricted", organizationId: "org", name: "Building Fund" }, { _id: "general", organizationId: "org", name: "General Fund" });
    const scope: any = {
      useSplitAmount: false, funds: records.funds, categories: getRCICategorySeedData(),
      csvRows: [["21/09/2026", "Unidentified credit", "30"]], csvHeaders: ["Date", "Description", "Amount"],
      columnMapping: { date: "Date", description: "Description", amount: "Amount" },
      parseImportedAmount, parseImportedDate, isRealIsoDate, applySmallIncomeDefaults, effectiveCategories, resolveCategoryForTransaction,
      parseAmountString: parseImportedAmount,
      notify: vi.fn(), setDuplicateWarnings: vi.fn(), setNextBankSyncCursor: vi.fn(), setNextBankSyncConnectionId: vi.fn(),
      setBankSyncReviewConnectionId: vi.fn(), setShowColumnMapper: vi.fn(), setShowReviewModal: vi.fn(),
      setPendingTransactions: (rows: any[]) => { scope.pendingTransactions = rows; },
      isProcessingAI: false, bankSyncReviewConnectionId: null, originalPredictions: new Map(), onPledgeCompleted: undefined,
      clearBankSyncReviewState: vi.fn(), bulkCreateTransactions: (args: any) => (bulkCreate as any)._handler(ctx, args),
    };
    uiFunction("handleProcessMapping", scope)();
    expect(scope.pendingTransactions[0]).toMatchObject({ category: "Offerings", fundId: "general", amount: 30 });
    await uiFunction("handleConfirmImport", scope)();
    expect(records.transactions[0]).toMatchObject({ category: "Offerings", fundId: "general", amount: 30 });
  });

  it("keeps user edits and removed rows when a late AI batch arrives", async () => {
    let finish!: (value: any) => void;
    const response = new Promise((resolve) => { finish = resolve; });
    const scope: any = {
      categorizationRun: { current: 0 },
      pendingTransactions: ["a", "b", "c"].map((id) => ({ reviewRowId: id, description: "Same description", amount: 90, type: "Income", category: "", fundId: "" })),
      funds: [{ _id: "general", name: "General Fund" }], categories: getRCICategorySeedData(),
      setPendingTransactions: (update: any) => { scope.pendingTransactions = typeof update === "function" ? update(scope.pendingTransactions) : update; },
      setCategorizationTransactionCount: vi.fn(), setCategorizationStatusMessage: vi.fn(), setIsProcessingAI: vi.fn(),
      setOriginalPredictions: vi.fn(), categorizeWithPipeline: vi.fn(() => response),
      applySmallIncomeDefaults, getPipelineSourceLabel: () => "Jev suggestion", getPipelineConfidenceLabel: () => "High",
    };
    const running = uiFunction("handleApplyAI", scope)();
    scope.pendingTransactions = scope.pendingTransactions.filter((row: any) => row.reviewRowId !== "c").map((row: any) => row.reviewRowId === "a" ? { ...row, category: "Building Fund" } : row);
    finish(["c", "b", "a"].map((id) => ({ rowId: id, category: "Offerings", fundId: "general", predictionSource: "jev", requiresReview: true, isGiftAidEligible: true })));
    await running;
    expect(scope.pendingTransactions).toHaveLength(2);
    expect(scope.pendingTransactions[0].category).toBe("Building Fund");
    expect(scope.pendingTransactions[1]).toMatchObject({ reviewRowId: "b", category: "Offerings", fundId: "general", isGiftAidEligible: false });
  });

  it("ignores late AI responses after the review is cancelled", async () => {
    let finish!: (value: any) => void;
    const response = new Promise((resolve) => { finish = resolve; });
    const scope: any = {
      categorizationRun: { current: 0 }, pendingTransactions: [{ reviewRowId: "a", description: "Credit", amount: 90, type: "Income" }],
      funds: [], setPendingTransactions: vi.fn(), setCategorizationTransactionCount: vi.fn(), setCategorizationStatusMessage: vi.fn(),
      setIsProcessingAI: vi.fn(), setOriginalPredictions: vi.fn(), categorizeWithPipeline: () => response,
    };
    const running = uiFunction("handleApplyAI", scope)();
    scope.categorizationRun.current += 1;
    finish([{ rowId: "a", category: "Offerings" }]);
    await running;
    expect(scope.setPendingTransactions).toHaveBeenCalledTimes(1);
    expect(scope.setOriginalPredictions).toHaveBeenCalledTimes(1);
  });

  it("seeds typed income and expenditure categories for a new organization", async () => {
    const { ctx, records } = database();
    await (create as any)._handler(ctx, { name: "Synthetic Audit Church", userName: "Audit Owner", selectedPlan: "starter" });
    expect(records.categories).toHaveLength(getRCICategorySeedData().length);
    expect(allowedCategoriesForType(records.categories, "Income").length).toBeGreaterThan(0);
    expect(allowedCategoriesForType(records.categories, "Expenditure").length).toBeGreaterThan(0);
    const input = [{ description: "Monthly bank charges", amount: 12, type: "Expenditure" as const }];
    expect(categorizeFromContext(input, records.categories, records.funds, [])[0].category).toBe("Bank Charges");
    expect(validateGeminiSuggestion({ category: "Utilities", fundName: "General Fund", confidence: "High" }, input[0], records.categories, records.funds)).not.toBeNull();
  });

  it("keeps invalid dates in review and blocks confirmation", async () => {
    const { ctx, records } = database();
    records.organizations.push({ _id: "org", accessMode: "legacy" });
    records.users.push({ _id: "user", organizationId: "org", role: "Admin", clerkId: "synthetic-owner" });
    records.funds.push({ _id: "fund", organizationId: "org", name: "General Fund" });
    const scope: any = {
      useSplitAmount: false, funds: records.funds, categoryNames: ["Tithes & First Fruits", "Utilities"],
      parseImportedAmount, parseImportedDate, isRealIsoDate,
      applySmallIncomeDefaults, effectiveCategories, resolveCategoryForTransaction, categories: getRCICategorySeedData(),
      parseAmountString: parseImportedAmount,
      notify: vi.fn(), setDuplicateWarnings: vi.fn(), setNextBankSyncCursor: vi.fn(), setNextBankSyncConnectionId: vi.fn(),
      setBankSyncReviewConnectionId: vi.fn(), setShowColumnMapper: vi.fn(), setShowReviewModal: vi.fn(),
      setPendingTransactions: (rows: any[]) => { scope.pendingTransactions = rows; },
    };
    Object.assign(scope, {
      FileReader: class {
        onload: any;
        readAsText(text: string) { this.onload({ target: { result: text } }); }
      },
      fileInputRef: { current: null },
      setCsvHeaders: (headers: string[]) => { scope.csvHeaders = headers; },
      setCsvRows: (rows: string[][]) => { scope.csvRows = rows; },
      setUseSplitAmount: (split: boolean) => { scope.useSplitAmount = split; },
      setColumnMapping: (mapping: any) => { scope.columnMapping = mapping; },
    });
    uiFunction("handleFileUpload", scope)({ target: { files: [
      "Date,Description,Amount\n31/02/2026,Electricity bill,-100\n01/03/2026,Cheque debit,(250.00)\n",
    ] } });
    expect(scope.csvRows).toHaveLength(2);
    uiFunction("handleProcessMapping", scope)();
    expect(scope.pendingTransactions).toHaveLength(2);
    expect(scope.pendingTransactions[0]).toMatchObject({ date: "31/02/2026", type: "Expenditure", amount: 100, category: "" });
    expect(scope.pendingTransactions[1]).toMatchObject({ type: "Expenditure", amount: 250 });
    Object.assign(scope, { isProcessingAI: false, bankSyncReviewConnectionId: null, originalPredictions: new Map(), onPledgeCompleted: undefined,
      clearBankSyncReviewState: vi.fn(), bulkCreateTransactions: (args: any) => (bulkCreate as any)._handler(ctx, args) });
    await uiFunction("handleConfirmImport", scope)();
    expect(scope.notify).toHaveBeenCalled();
    expect(records.transactions).toHaveLength(0);
  });
});
