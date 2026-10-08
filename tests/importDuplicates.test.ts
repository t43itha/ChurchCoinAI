import { describe, expect, it, vi } from "vitest";
import { bulkCreate } from "../convex/mutations/transactions";
import { backfillImportKeys } from "../convex/mutations/maintenance";
import { getRCICategorySeedData } from "../constants/rciCategories";
import { importKeyPrefix, screenImportRows, withImportKeys } from "../lib/importKeys";
import { mapStatementRows } from "../lib/statementImport";
import { runConfirmImport, screenStatementRows } from "../components/statementImport/reviewLogic";
import { confirmDeps, confirmInput } from "./helpers/importReview";

type Row = { _id: string } & Record<string, any>;

// In-memory Convex db whose index ranges actually filter, so dedup lookups
// can't pass by returning an arbitrary row.
function database(transactions: Row[] = []) {
  const records: Record<string, Row[]> = {
    users: [{ _id: "user", organizationId: "org", role: "Admin", clerkId: "owner" }],
    organizations: [{ _id: "org", accessMode: "legacy" }],
    funds: [{ _id: "general", organizationId: "org", name: "General Fund" }],
    categories: getRCICategorySeedData().map((category, i) => ({ ...category, _id: `category${i}`, organizationId: "org" })),
    bankConnections: [{ _id: "connection", organizationId: "org" }],
    transactions,
  };
  const query = (table: string) => {
    let rows = records[table] ?? [];
    const range = {
      eq: (field: string, value: unknown) => ((rows = rows.filter((row) => row[field] === value)), range),
      gte: (field: string, value: string) => ((rows = rows.filter((row) => row[field] !== undefined && row[field] >= value)), range),
      lt: (field: string, value: string) => ((rows = rows.filter((row) => row[field] !== undefined && row[field] < value)), range),
    };
    const chain = {
      withIndex: (_name: string, configure?: (q: typeof range) => unknown) => (configure?.(range), chain),
      first: async () => rows[0] ?? null,
      collect: async () => [...rows],
      take: async (n: number) => rows.slice(0, n),
      paginate: async () => ({ page: [...rows], isDone: true, continueCursor: "end" }),
    };
    return chain;
  };
  const get = (id: string) => Object.values(records).flat().find((row) => row._id === id) ?? null;
  const ctx: any = {
    auth: { getUserIdentity: async () => ({ subject: "owner" }) },
    db: {
      query,
      get: async (id: string) => get(id),
      insert: async (table: string, value: Record<string, unknown>) => {
        const rows = (records[table] ??= []);
        const _id = `${table}-${rows.length}`;
        rows.push({ ...value, _id });
        return _id;
      },
      patch: async (id: string, value: Record<string, unknown>) => Object.assign(get(id)!, value),
    },
    scheduler: { runAfter: vi.fn() },
  };
  return { ctx, records };
}

// Maps and screens a statement exactly as the CSV import does, then returns a
// confirm step that runs the real review confirmation against the same ledger.
function importStatement(ctx: any, records: Record<string, Row[]>, csvLines: string[][]) {
  const mapped = mapStatementRows(
    csvLines.map((cells, index) => ({ cells, line: index + 2 })) as any,
    ["Date", "Description", "Amount"],
    { date: "Date", description: "Description", amount: "Amount", amountIn: "", amountOut: "" },
    false
  );
  const screen = screenStatementRows(mapped, records.transactions as any, getRCICategorySeedData(), records.funds as any);
  if (screen.tooMany) throw new Error("unexpected batch size");
  return {
    pendingRows: screen.fresh,
    alreadyImportedRows: screen.alreadyImported,
    confirm: () => runConfirmImport(confirmInput({
      pendingRows: screen.fresh,
      alreadyImportedRows: screen.alreadyImported,
      funds: records.funds as any,
      ledger: records.transactions as any,
    }), confirmDeps(ctx)),
  };
}

const statement = [
  ["21/09/2026", "Cash gift", "10"],
  ["21/09/2026", "CASH  gift", "10"],
  ["22/09/2026", "Card payment", "20"],
];

describe("statement import keys", () => {
  it("numbers identical rows so both import, matching on normalised description", () => {
    const keyed = withImportKeys([
      { date: "2026-09-21", type: "Income" as const, amount: 10, description: "Cash gift" },
      { date: "2026-09-21", type: "Income" as const, amount: 10, description: " CASH  gift " },
      { date: "2026-09-21", type: "Expenditure" as const, amount: 10, description: "Cash gift" },
    ]);
    expect(keyed[0].importKey).toBe("2026-09-21|Income|1000|cash gift|1");
    expect(keyed[1].importKey).toBe("2026-09-21|Income|1000|cash gift|2");
    expect(keyed[2].importKey).toBe("2026-09-21|Expenditure|1000|cash gift|1");
  });

  it("separates already-imported rows from possible duplicates from another source", () => {
    const ledger = [
      { date: "2026-09-21", type: "Income" as const, amount: 10, importKey: "2026-09-21|Income|1000|cash gift|1" },
      { date: "2026-09-22", type: "Income" as const, amount: 50, bankConnectionId: "connection", providerTransactionId: "p1" },
    ];
    const { fresh, alreadyImported, possibleDuplicates } = screenImportRows([
      { date: "2026-09-21", type: "Income" as const, amount: 10, description: "Cash gift", importKey: "2026-09-21|Income|1000|cash gift|1" },
      { date: "2026-09-22", type: "Income" as const, amount: 50, description: "FPS CREDIT", bankConnectionId: "connection", providerTransactionId: "p1" },
      { date: "2026-09-22", type: "Income" as const, amount: 50, description: "Gift from J Smith", importKey: "2026-09-22|Income|5000|gift from j smith|1" },
      { date: "2026-09-22", type: "Expenditure" as const, amount: 50, description: "Refund", importKey: "2026-09-22|Expenditure|5000|refund|1" },
    ], ledger);
    expect(alreadyImported.map((row) => row.description)).toEqual(["Cash gift", "FPS CREDIT"]);
    expect(fresh.map((row) => row.description)).toEqual(["Gift from J Smith", "Refund"]);
    expect([...possibleDuplicates]).toEqual([0]);
  });
});

describe("statement re-import", () => {
  it("imports identical same-day rows once and nothing when the file is uploaded again", async () => {
    const { ctx, records } = database();
    const first = importStatement(ctx, records, statement);
    await first.confirm();
    expect(records.transactions).toHaveLength(3);

    const second = importStatement(ctx, records, statement);
    expect(second.pendingRows).toEqual([]);
    expect(second.alreadyImportedRows).toHaveLength(3);
  });

  it("imports only the new rows from an overlapping statement", async () => {
    const { ctx, records } = database();
    await importStatement(ctx, records, statement).confirm();
    const overlap = importStatement(ctx, records, [...statement.slice(1), ["23/09/2026", "Cash gift", "15"]]);
    expect(overlap.pendingRows.map((row) => row.date)).toEqual(["2026-09-23"]);
    await overlap.confirm();
    expect(records.transactions).toHaveLength(4);
  });

  it("skips already-imported rows on the server even when the review was stale", async () => {
    const { ctx, records } = database();
    const first = importStatement(ctx, records, statement);
    const rows = first.pendingRows.map((row) => ({
      date: row.date, description: row.description, amount: row.amount, type: row.type,
      category: row.category, fundId: row.fundId, importKey: row.importKey,
    }));
    await first.confirm();
    const result = await (bulkCreate as any)._handler(ctx, { transactions: rows });
    expect(result).toMatchObject({ count: 0, skippedDuplicates: 3, ids: [null, null, null] });
    expect(records.transactions).toHaveLength(3);
  });

  it("rejects an import key that doesn't describe its row", async () => {
    const { ctx } = database();
    const row = { date: "2026-09-21", description: "Cash gift", amount: 10, type: "Income", category: "Offerings", fundId: "general" };
    await expect((bulkCreate as any)._handler(ctx, {
      transactions: [{ ...row, importKey: "2026-09-21|Income|9999|cash gift|1" }],
    })).rejects.toThrow("Import key");
  });
});

describe("import key backfill", () => {
  const content = { organizationId: "org", date: "2026-09-21", type: "Income", amount: 10, description: "Cash gift" };

  it("keys older statement rows after existing keys and leaves bank and cash rows alone", async () => {
    const prefix = importKeyPrefix(content as any);
    const { ctx, records } = database([
      { _id: "keyed", ...content, importKey: `${prefix}1` },
      { _id: "old-a", ...content },
      { _id: "old-b", ...content },
      { _id: "bank", ...content, bankConnectionId: "connection", providerTransactionId: "p1" },
      { _id: "cash", ...content, cashCollectionId: "collection" },
    ]);
    const run = () => (backfillImportKeys as any)._handler(ctx, {});
    expect(await run()).toEqual({ keyed: 2, isDone: true });
    const keys = Object.fromEntries(records.transactions.map((row) => [row._id, row.importKey]));
    expect(keys).toEqual({ keyed: `${prefix}1`, "old-a": `${prefix}2`, "old-b": `${prefix}3`, bank: undefined, cash: undefined });
    expect(await run()).toEqual({ keyed: 0, isDone: true });

    const reupload = importStatement(ctx, records, [["21/09/2026", "Cash gift", "10"]]);
    expect(reupload.pendingRows).toEqual([]);
  });
});

describe("bank sync acknowledgement", () => {
  it("advances the sync checkpoint past rows that were already imported", async () => {
    const { ctx } = database();
    const acknowledgeBankSync = vi.fn(async () => null);
    await runConfirmImport(confirmInput({
      bankSyncReviewConnectionId: "connection" as any,
      funds: [{ _id: "general", name: "General Fund" }] as any,
      alreadyImportedRows: [{ source: "bank", bankConnectionId: "connection", providerTransactionId: "p1", date: "2026-09-30" }] as any,
    }), confirmDeps(ctx, { acknowledgeBankSync }));
    expect(acknowledgeBankSync).toHaveBeenCalledWith({ bankConnectionId: "connection", lastSyncedThrough: "2026-09-30" });
  });
});
