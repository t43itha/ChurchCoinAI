import { describe, expect, it, vi } from "vitest";
import { getRCICategorySeedData } from "../constants/rciCategories";
import { resolveCategoryForTransaction } from "../convex/intelligence/categorization/categoryResolver";
import { isRealIsoDate } from "../lib/csvImport";
import {
  acceptedPairsToLink,
  importMovementLegs,
  livePairs,
  pairBasis,
  reviewLeg,
  suggestImportPairs,
  type MovementLeg,
  type PairingRow,
  type PairSuggestion,
} from "../lib/movementMatching";
import { applySmallIncomeDefaults } from "../lib/smallIncomeDefaults";
import { effectiveCategories } from "../lib/transactionCategories";
import { uiFunction } from "./helpers/transactionManagerHandlers";

const categories = effectiveCategories(getRCICategorySeedData());

const accept = (row: PairingRow, pair: PairSuggestion): PairingRow => ({
  ...row,
  pairWith: pair,
  pairBasis: pairBasis(row),
});

const transferOut: PairingRow = { reviewRowId: "a", date: "2026-08-03", amount: 300, type: "Expenditure", fundId: "general", category: "Transfer between funds" };
const transferIn: PairingRow = { reviewRowId: "b", date: "2026-08-05", amount: 300, type: "Income", fundId: "building", category: "Transfer between funds" };

describe("reviewLeg and pairBasis", () => {
  it("maps a review row to a movement leg keyed by its review row id", () => {
    expect(reviewLeg({ reviewRowId: "r1", date: "2026-08-03", amount: 300, type: "Expenditure", movementKind: "transfer" })).toEqual({
      _id: "r1", date: "2026-08-03", amount: 300, type: "Expenditure", fundId: "", movementKind: "transfer",
    });
  });

  it("changes when the amount, direction, fund or category changes, but not the description", () => {
    const base = pairBasis(transferOut);
    expect(pairBasis({ ...transferOut, description: "Renamed" } as PairingRow)).toBe(base);
    expect(pairBasis({ ...transferOut, amount: 300.01 })).not.toBe(base);
    expect(pairBasis({ ...transferOut, type: "Income" })).not.toBe(base);
    expect(pairBasis({ ...transferOut, fundId: "building" })).not.toBe(base);
    expect(pairBasis({ ...transferOut, category: "Returned payment" })).not.toBe(base);
  });
});

describe("importMovementLegs", () => {
  it("keeps only rows whose category is a transfer or returned payment", () => {
    const legs = importMovementLegs([
      transferOut,
      { reviewRowId: "c", date: "2026-08-10", amount: 50, type: "Income", fundId: "general", category: "Returned payment" },
      { reviewRowId: "d", date: "2026-08-10", amount: 50, type: "Income", fundId: "general", category: "Offerings" },
    ], categories);
    expect(legs.map((leg) => [leg._id, leg.movementKind])).toEqual([["a", "transfer"], ["c", "reversal"]]);
  });
});

describe("suggestImportPairs over review rows", () => {
  it("pairs a transfer out of General with a transfer in to Building by review row id", () => {
    const legs = importMovementLegs([transferOut, transferIn], categories);
    const pairs = suggestImportPairs(legs, []);
    expect(pairs.get("a")).toEqual({ source: "import", id: "b" });
    expect(pairs.get("b")).toEqual({ source: "import", id: "a" });
  });
});

describe("acceptedPairsToLink", () => {
  const legsFor = (rows: PairingRow[]) => importMovementLegs(rows, categories);
  const createdIds = (ids: Record<string, string>) => new Map(Object.entries(ids));
  const ledgerRow = (overrides: Partial<MovementLeg>): MovementLeg => ({
    _id: "L", date: "2026-08-09", amount: 50, type: "Expenditure", fundId: "general", movementKind: "reversal", ...overrides,
  });

  it("links an accepted import pair once, from its smaller row id", () => {
    const rows = [accept(transferOut, { source: "import", id: "b" }), accept(transferIn, { source: "import", id: "a" })];
    expect(acceptedPairsToLink({ rows, createdIds: createdIds({ a: "tA", b: "tB" }), categories, ledger: [] })).toEqual({
      links: [["tA", "tB"]], unmatched: 0,
    });
  });

  it("drops a pair whose row changed after it was accepted, without counting it as unmatched", () => {
    const rows = [
      accept(transferOut, { source: "import", id: "b" }),
      { ...accept(transferIn, { source: "import", id: "a" }), amount: 310 },
    ];
    expect(acceptedPairsToLink({ rows, createdIds: createdIds({ a: "tA", b: "tB" }), categories, ledger: [] })).toEqual({
      links: [], unmatched: 0,
    });
  });

  it("reports a ledger pair whose other side has since been linked", () => {
    const row = accept({ reviewRowId: "c", date: "2026-08-10", amount: 50, type: "Income", fundId: "general", category: "Returned payment" }, { source: "ledger", id: "L" });
    const ledger = [ledgerRow({ _id: "L", movementId: "m1" })];
    expect(acceptedPairsToLink({ rows: [row], createdIds: createdIds({ c: "tC" }), categories, ledger })).toEqual({
      links: [], unmatched: 1,
    });
  });

  it("does not link a pair with a skipped duplicate on either side", () => {
    const row = accept({ reviewRowId: "c", date: "2026-08-10", amount: 50, type: "Income", fundId: "general", category: "Returned payment" }, { source: "ledger", id: "L" });
    expect(legsFor([row])).toHaveLength(1);
    expect(acceptedPairsToLink({ rows: [row], createdIds: new Map(), categories, ledger: [ledgerRow({})] })).toEqual({
      links: [], unmatched: 0,
    });
  });

  it("ignores a suggestion that was never accepted", () => {
    const rows = [transferOut, transferIn];
    expect(acceptedPairsToLink({ rows, createdIds: createdIds({ a: "tA", b: "tB" }), categories, ledger: [] }).links).toEqual([]);
  });
});

describe("livePairs", () => {
  it("needs both sides of an import pair to point at each other", () => {
    const rows = [accept(transferOut, { source: "import", id: "b" }), transferIn];
    expect(livePairs(rows).size).toBe(0);
  });
});

describe("confirm import with accepted pairs", () => {
  const liveRow = (row: Record<string, unknown>, pair: PairSuggestion) => ({ ...row, pairWith: pair, pairBasis: pairBasis(row as PairingRow) });
  const reversal = { category: "Returned payment", fundId: "general", date: "2026-08-10" };

  it("links accepted pairs with the created ids and leaves out voided, duplicate and unaccepted ones", async () => {
    const pendingTransactions = [
      liveRow({ reviewRowId: "row-a", description: "Transfer to Building", amount: 300, type: "Expenditure", category: "Transfer between funds", fundId: "general", date: "2026-08-03" }, { source: "import", id: "row-b" }),
      liveRow({ reviewRowId: "row-b", description: "Transfer from General", amount: 300, type: "Income", category: "Transfer between funds", fundId: "building", date: "2026-08-05" }, { source: "import", id: "row-a" }),
      liveRow({ ...reversal, reviewRowId: "row-c", description: "Supplier refund", amount: 50, type: "Income" }, { source: "ledger", id: "L1" }),
      { ...liveRow({ ...reversal, reviewRowId: "row-d", description: "Refund", amount: 75, type: "Income" }, { source: "ledger", id: "L2" }), amount: 80 },
      liveRow({ ...reversal, reviewRowId: "row-f", description: "Skipped duplicate", amount: 20, type: "Income" }, { source: "ledger", id: "L3" }),
      { ...reversal, reviewRowId: "row-g", description: "Not accepted", amount: 10, type: "Income" },
    ];
    const ledgerTransaction = (_id: string, amount: number, date: string): MovementLeg => ({
      _id, date, amount, type: "Expenditure", fundId: "general", movementKind: "reversal",
    });
    const transactions = [
      ledgerTransaction("L1", 50, "2026-08-09"),
      ledgerTransaction("L2", 75, "2026-08-12"),
      ledgerTransaction("L3", 20, "2026-08-15"),
      ledgerTransaction("L4", 10, "2026-08-10"),
    ];
    const funds = [{ _id: "general", name: "General Fund" }, { _id: "building", name: "Building Fund" }];
    const linkTransactions = vi.fn(async () => null);
    const notify = vi.fn();
    const scope: any = {
      isProcessingAI: false, bankSyncReviewConnectionId: null, nextBankSyncCursor: null,
      funds, categories, importCategories: categories, pendingTransactions, allTransactions: transactions,
      alreadyImportedRows: [], originalPredictions: new Map(), onPledgeCompleted: undefined,
      applySmallIncomeDefaults, resolveCategoryForTransaction, effectiveCategories, isRealIsoDate,
      acceptedPairsToLink, notify, linkTransactions,
      setPendingTransactions: vi.fn(), setShowReviewModal: vi.fn(), clearBankSyncReviewState: vi.fn(),
      bulkCreateTransactions: vi.fn(async () => ({
        count: 5, skippedDuplicates: 1, completedPledges: [],
        ids: ["tA", "tB", "tC", "tD", null, "tG"],
      })),
    };
    await uiFunction("handleConfirmImport", scope)();

    expect(linkTransactions.mock.calls).toEqual([
      [{ transactionIds: ["tA", "tB"] }],
      [{ transactionIds: ["tC", "L1"] }],
    ]);
    expect(notify).toHaveBeenCalledWith("Pairs Linked", "2 pairs were linked.");
    expect(notify).not.toHaveBeenCalledWith("Warning", expect.anything());
  });
});
