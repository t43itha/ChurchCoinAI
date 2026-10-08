import { vi } from "vitest";
import { bulkCreate } from "../../convex/mutations/transactions";
import { getRCICategorySeedData } from "../../constants/rciCategories";
import type { ConfirmImportDeps, ConfirmImportInput } from "../../components/statementImport/reviewLogic";

// Defaults for runConfirmImport: an organisation's seeded categories, no bank
// sync in progress, nothing already in the ledger, and no AI predictions.
export function confirmInput(overrides: Partial<ConfirmImportInput> = {}): ConfirmImportInput {
  return {
    pendingRows: [],
    alreadyImportedRows: [],
    isCategorising: false,
    bankSyncReviewConnectionId: null,
    hasMoreBankRows: false,
    funds: [],
    categories: getRCICategorySeedData(),
    ledger: [],
    predictions: new Map(),
    ...overrides,
  };
}

// Writes go through the real bulkCreate handler against an in-memory database.
export function confirmDeps(ctx: unknown, overrides: Partial<ConfirmImportDeps> = {}): ConfirmImportDeps {
  return {
    notify: vi.fn(),
    setRows: vi.fn(),
    bulkCreate: (args) => (bulkCreate as any)._handler(ctx, args),
    acknowledgeBankSync: vi.fn(async () => null),
    recordCorrections: vi.fn(async () => null),
    linkTransactions: vi.fn(async () => null),
    ...overrides,
  };
}
