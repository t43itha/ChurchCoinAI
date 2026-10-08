import { describe, expect, it } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import * as transactions from "../convex/mutations/transactions";
import * as categories from "../convex/mutations/categories";
import { ensureTypedCategories } from "../convex/lib/categoryIntegrity";
import { fixture, invoke, row, type Row } from "./helpers/convexFixture";

const lastPatch = (db: ReturnType<typeof fixture>["db"], id: string) =>
  db.patch.mock.calls.filter(([patchedId]) => patchedId === id).at(-1)?.[1] as Record<string, unknown>;

describe("built-in movement categories", () => {
  it("adds the three categories once, with no transaction type", async () => {
    const { ctx, records } = fixture();
    await ensureTypedCategories(ctx, "org" as Id<"organizations">);
    await ensureTypedCategories(ctx, "org" as Id<"organizations">);

    const movement = records.categories.filter((category) => category.movementKind);
    expect(movement.map((category) => [category.name, category.movementKind, category.transactionType])).toEqual([
      ["Transfer between funds", "transfer", undefined],
      ["Returned payment", "reversal", undefined],
      ["Loan", "loan", undefined],
    ]);
  });

  it("leaves a user category with the same name alone", async () => {
    const userLoan = { _id: "user-loan", organizationId: "org", name: "Loan", transactionType: "Income", createdAt: 1 };
    const { ctx, records } = fixture({ categories: [{ ...userLoan }] });
    await ensureTypedCategories(ctx, "org" as Id<"organizations">);

    expect(records.categories.filter((category) => category.name === "Loan")).toEqual([userLoan]);
  });
});

describe("movementKind follows the category on every write", () => {
  it("copies the kind when a transaction is created", async () => {
    const { ctx, records } = fixture();
    const base = { date: "2026-10-01", description: "Move", amount: 300, fundId: "fund" };
    await invoke(transactions.create, ctx, { ...base, type: "Income", category: "Loan" });
    await invoke(transactions.create, ctx, { ...base, type: "Expenditure", category: "Transfer between funds" });

    expect(records.transactions.map((t) => [t.type, t.category, t.movementKind])).toEqual([
      ["Income", "Loan", "loan"],
      ["Expenditure", "Transfer between funds", "transfer"],
    ]);
  });

  it("clears the kind when a row moves back to an ordinary category", async () => {
    const { ctx, db, get } = fixture({ transactions: [row("tx", { category: "Loan", movementKind: "loan" })] });
    await invoke(transactions.update, ctx, { transactionId: "tx", category: "Offerings" });

    const patch = lastPatch(db, "tx");
    expect(patch).toHaveProperty("movementKind", undefined);
    expect(get("tx")).toMatchObject({ category: "Offerings", movementKind: undefined });
  });

  it("sets the kind on income and expenditure rows in one bulk edit", async () => {
    const { ctx, get } = fixture({
      transactions: [row("in"), row("out", { type: "Expenditure", category: "Utilities" })],
    });
    await invoke(transactions.bulkUpdate, ctx, {
      transactionIds: ["in", "out"],
      updates: { category: "Returned payment" },
    });

    expect([get("in")?.movementKind, get("out")?.movementKind]).toEqual(["reversal", "reversal"]);
  });

  it("sets the kind through batch edits", async () => {
    const { ctx, get } = fixture({ transactions: [row("tx")] });
    await invoke(transactions.batchUpdate, ctx, {
      updates: [{ transactionId: "tx", changes: { category: "Transfer between funds" } }],
    });

    expect(get("tx")?.movementKind).toBe("transfer");
  });
});

describe("category names that would hide a movement category", () => {
  const builtIns = (): Row[] => [
    { _id: "loan", organizationId: "org", name: "Loan", movementKind: "loan", createdAt: 1 },
    { _id: "offerings", organizationId: "org", name: "Offerings", transactionType: "Income", createdAt: 1 },
  ];

  it("rejects a new category whose name differs only by case", async () => {
    const { ctx } = fixture({ categories: builtIns() });
    await expect(invoke(categories.create, ctx, { name: "loan ", transactionType: "Expenditure" }))
      .rejects.toThrow('Category "loan" already exists');
  });

  it("skips case-insensitive duplicates in bulk creation", async () => {
    const { ctx } = fixture({ categories: builtIns() });
    await expect(invoke(categories.bulkCreate, ctx, { names: ["LOAN", "Choir robes"], transactionType: "Expenditure" }))
      .resolves.toEqual({ created: ["Choir robes"], skipped: ["LOAN"] });
  });

  it("rejects renaming to an alias of another category", async () => {
    const { ctx, get } = fixture({ categories: builtIns() });
    await expect(invoke(categories.rename, ctx, { categoryId: "loan", newName: "Tithe" }))
      .rejects.toThrow('"Tithe" is another name for "Tithes & First Fruits"');
    expect(get("loan")?.name).toBe("Loan");
  });

  it("rejects renaming a movement category to a built-in category name", async () => {
    const { ctx } = fixture({ categories: [builtIns()[0]] });
    await expect(invoke(categories.rename, ctx, { categoryId: "loan", newName: "Offerings" }))
      .rejects.toThrow('"Offerings" is a built-in category name');
  });

  it("still allows a plain rename", async () => {
    const { ctx, get } = fixture({ categories: builtIns() });
    await invoke(categories.rename, ctx, { categoryId: "loan", newName: "Member loan" });
    expect(get("loan")).toMatchObject({ name: "Member loan", movementKind: "loan" });
  });

  it("moves a fund's default cash collection category to the new name", async () => {
    const { ctx, get } = fixture({
      categories: [{ _id: "harvest", organizationId: "org", name: "Harvest Giving", transactionType: "Income", createdAt: 1 }],
      funds: [
        { _id: "general", organizationId: "org", name: "General", defaultIncomeCategory: "harvest giving" },
        { _id: "building", organizationId: "org", name: "Building", defaultIncomeCategory: "Offerings" },
        { _id: "elsewhere", organizationId: "other", name: "Elsewhere", defaultIncomeCategory: "Harvest Giving" },
      ],
    });
    await invoke(categories.rename, ctx, { categoryId: "harvest", newName: "Appeal Giving" });

    expect(get("general")?.defaultIncomeCategory).toBe("Appeal Giving");
    expect(get("building")?.defaultIncomeCategory).toBe("Offerings");
    expect(get("elsewhere")?.defaultIncomeCategory).toBe("Harvest Giving");
  });

  it.each([
    ["retired", (ctx: Parameters<typeof invoke>[1]) => invoke(categories.setRetired, ctx, { categoryId: "harvest", retired: true })],
    ["deleted", (ctx: Parameters<typeof invoke>[1]) => invoke(categories.remove, ctx, { categoryId: "harvest" })],
  ])("clears a fund's default cash collection category when it is %s", async (_, change) => {
    const { ctx, get } = fixture({
      categories: [{ _id: "harvest", organizationId: "org", name: "Harvest Giving", transactionType: "Income", createdAt: 1 }],
      funds: [
        { _id: "general", organizationId: "org", name: "General", defaultIncomeCategory: "Harvest Giving" },
        { _id: "building", organizationId: "org", name: "Building", defaultIncomeCategory: "Offerings" },
      ],
    });
    await change(ctx);

    expect(get("general")?.defaultIncomeCategory).toBeUndefined();
    expect(get("building")?.defaultIncomeCategory).toBe("Offerings");
  });
});

describe("cash collection rows stay giving", () => {
  const message = "Rows from a cash collection can't be marked as a transfer, returned payment or loan";

  it("refuses to mark a collection row as a movement", async () => {
    const { ctx, get } = fixture({ transactions: [row("service", { cashCollectionId: "c1", notes: "service:Sunday" })] });
    await expect(invoke(transactions.update, ctx, { transactionId: "service", category: "Loan" })).rejects.toThrow(message);
    await expect(invoke(transactions.bulkUpdate, ctx, { transactionIds: ["service"], updates: { category: "Loan" } })).rejects.toThrow(message);
    await expect(invoke(transactions.batchUpdate, ctx, { updates: [{ transactionId: "service", changes: { category: "Loan" } }] })).rejects.toThrow(message);
    expect(get("service")?.category).toBe("Offerings");
  });

  it("refuses a new collection row in a movement category", async () => {
    const { ctx } = fixture({ cashCollections: [{ _id: "c1", organizationId: "org" }] });
    await expect(invoke(transactions.create, ctx, {
      date: "2026-10-01", description: "Loan", amount: 100, type: "Income", category: "Loan", fundId: "fund", cashCollectionId: "c1",
    })).rejects.toThrow(message);
  });
});

describe("retired categories", () => {
  const retired = (): Row => ({
    _id: "choir", organizationId: "org", name: "Choir robes", transactionType: "Expenditure", isRetired: true, createdAt: 1,
  });
  const expenditure = (id: string, extra: Record<string, unknown> = {}) =>
    row(id, { type: "Expenditure", category: "Utilities", ...extra });
  const base = { date: "2026-10-01", description: "Robes", amount: 40, fundId: "fund" };

  it("refuses to retire a built-in movement category", async () => {
    const { ctx, get } = fixture({
      categories: [{ _id: "loan", organizationId: "org", name: "Loan", movementKind: "loan", createdAt: 1 }],
    });
    await expect(invoke(categories.setRetired, ctx, { categoryId: "loan", retired: true }))
      .rejects.toThrow("Built-in transfer, returned payment and loan categories can't be retired.");
    expect(get("loan")?.isRetired).toBeUndefined();
  });

  it("retires and restores an ordinary category", async () => {
    const { ctx, get } = fixture({ categories: [{ _id: "choir", organizationId: "org", name: "Choir robes", transactionType: "Expenditure", createdAt: 1 }] });
    await invoke(categories.setRetired, ctx, { categoryId: "choir", retired: true });
    expect(get("choir")?.isRetired).toBe(true);
    await invoke(categories.setRetired, ctx, { categoryId: "choir", retired: false });
    expect(get("choir")?.isRetired).toBeUndefined();
  });

  it("refuses to create a row in a retired category", async () => {
    const { ctx } = fixture({ categories: [retired()] });
    await expect(invoke(transactions.create, ctx, { ...base, type: "Expenditure", category: "Choir robes" }))
      .rejects.toThrow(/is retired/);
  });

  it("refuses to move a row into a retired category", async () => {
    const { ctx, get } = fixture({ categories: [retired()], transactions: [expenditure("tx")] });
    await expect(invoke(transactions.update, ctx, { transactionId: "tx", category: "Choir robes" }))
      .rejects.toThrow(/is retired/);
    expect(get("tx")?.category).toBe("Utilities");
  });

  it("lets a row already in a retired category change its description", async () => {
    const { ctx, get } = fixture({ categories: [retired()], transactions: [expenditure("tx", { category: "Choir robes" })] });
    await invoke(transactions.update, ctx, { transactionId: "tx", description: "Choir gowns" });
    expect(get("tx")).toMatchObject({ description: "Choir gowns", category: "Choir robes" });
  });

  it("refuses to retire Offerings, which cash collections write", async () => {
    const { ctx, get } = fixture({ categories: [{ _id: "offerings", organizationId: "org", name: "Offerings", transactionType: "Income", createdAt: 1 }] });
    await expect(invoke(categories.setRetired, ctx, { categoryId: "offerings", retired: true }))
      .rejects.toThrow(/Offerings can't be retired/);
    expect(get("offerings")?.isRetired).toBeUndefined();
  });

  it("treats a row's retired category as its own whatever its case", async () => {
    const { ctx, get } = fixture({ categories: [retired()], transactions: [expenditure("tx", { category: "choir robes" })] });
    await invoke(transactions.update, ctx, { transactionId: "tx", category: "Choir robes", description: "Choir gowns" });
    expect(get("tx")?.description).toBe("Choir gowns");
  });

  it("refuses a bulk edit that sets a retired category", async () => {
    const { ctx, get } = fixture({ categories: [retired()], transactions: [expenditure("tx")] });
    await expect(invoke(transactions.bulkUpdate, ctx, { transactionIds: ["tx"], updates: { category: "Choir robes" } }))
      .rejects.toThrow(/is retired/);
    expect(get("tx")?.category).toBe("Utilities");
  });
});
