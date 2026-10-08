import { describe, expect, it } from "vitest";
import * as cashCollections from "../convex/mutations/cashCollections";
import { fixture, invoke, type Row } from "./helpers/convexFixture";

const generalFund = (extra: Record<string, unknown> = {}): Row => ({
  _id: "fund",
  organizationId: "org",
  name: "General Fund",
  type: "Unrestricted",
  ...extra,
});

const serviceRow = (extra: Record<string, unknown> = {}) => ({
  serviceDate: "2026-10-04",
  serviceNote: "Sunday",
  fundId: "fund",
  cash: 50,
  pdq: 0,
  cheque: 0,
  ...extra,
});

const donation = (extra: Record<string, unknown> = {}) => ({
  donorName: "Ruth Adeyemi",
  category: "Tithes & First Fruits",
  fundId: "fund",
  paymentMethod: "Cash" as const,
  amount: 40,
  isGiftAidEligible: false,
  ...extra,
});

const submit = (ctx: Parameters<typeof invoke>[1], args: Record<string, unknown>) =>
  invoke(cashCollections.submitCollection, ctx, {
    weekEndingDate: "2026-10-04",
    collectionDate: "2026-10-04",
    ...args,
  }) as Promise<{ cashCollectionId: string }>;

const collectionTransactions = (records: Record<string, Row[]>, cashCollectionId: string) =>
  records.transactions
    .filter((transaction) => transaction.cashCollectionId === cashCollectionId)
    .map((transaction) => ({
      date: transaction.date,
      amount: transaction.amount,
      category: transaction.category,
      programmeId: transaction.programmeId ?? null,
      notes: transaction.notes ?? null,
      donorName: transaction.donorName,
    }));

describe("cash collection service rows", () => {
  it("saves the category the row names", async () => {
    const { ctx, records } = fixture({ funds: [generalFund()] });
    await submit(ctx, {
      serviceRows: [serviceRow({ category: "Tithes & First Fruits" })],
    });

    expect(records.transactions.map((transaction) => transaction.category)).toEqual(["Tithes & First Fruits"]);
  });

  it("falls back to the fund's default category when the row names none", async () => {
    const { ctx, records } = fixture({ funds: [generalFund({ defaultIncomeCategory: "Building Fund" })] });
    await submit(ctx, { serviceRows: [serviceRow()] });

    expect(records.transactions.map((transaction) => transaction.category)).toEqual(["Building Fund"]);
  });

  it("saves Offerings when neither the row nor the fund names a category", async () => {
    const { ctx, records } = fixture({ funds: [generalFund()] });
    await submit(ctx, { serviceRows: [serviceRow()] });

    expect(records.transactions.map((transaction) => transaction.category)).toEqual(["Offerings"]);
  });

  it("rejects a programme from another organization", async () => {
    const { ctx } = fixture({
      funds: [generalFund()],
      programmes: [{ _id: "camp", organizationId: "other-org", name: "Camp", createdAt: 1 }],
    });

    await expect(submit(ctx, { serviceRows: [serviceRow({ programmeId: "camp" })] })).rejects.toThrow("Invalid programme");
  });

  it("stores a valid programme on every transaction the row inserts", async () => {
    const { ctx, records } = fixture({
      funds: [generalFund()],
      programmes: [{ _id: "harvest", organizationId: "org", name: "Harvest", createdAt: 1 }],
    });
    const { cashCollectionId } = await submit(ctx, {
      serviceRows: [serviceRow({ cash: 30, pdq: 20, programmeId: "harvest" })],
    });

    expect(collectionTransactions(records, cashCollectionId).map((transaction) => transaction.programmeId)).toEqual([
      "harvest",
      "harvest",
    ]);
  });
});

describe("cash collection named donations", () => {
  it("dates a named donation from its service date and keeps its service note", async () => {
    const { ctx, records } = fixture({ funds: [generalFund()] });
    const { cashCollectionId } = await submit(ctx, {
      serviceRows: [],
      namedDonations: [donation({ serviceDate: "2026-10-02", serviceNote: "Friday" })],
    });

    expect(collectionTransactions(records, cashCollectionId)).toEqual([
      {
        date: "2026-10-02",
        amount: 40,
        category: "Tithes & First Fruits",
        programmeId: null,
        notes: "service:Friday",
        donorName: "Ruth Adeyemi",
      },
    ]);
  });

  it("dates a named donation with no service date on the week ending", async () => {
    const { ctx, records } = fixture({ funds: [generalFund()] });
    const { cashCollectionId } = await submit(ctx, { serviceRows: [], namedDonations: [donation()] });

    expect(collectionTransactions(records, cashCollectionId)).toMatchObject([
      { date: "2026-10-04", notes: null },
    ]);
  });

  it("rejects an invalid service date on a named donation", async () => {
    const { ctx } = fixture({ funds: [generalFund()] });

    await expect(
      submit(ctx, { serviceRows: [], namedDonations: [donation({ serviceDate: "2026-02-30" })] })
    ).rejects.toThrow("Transaction date is not a real calendar date");
  });
});

describe("replacing a cash collection applies the same rules", () => {
  it("re-saves rows with their category, programme and service dates", async () => {
    const { ctx, records } = fixture({
      funds: [generalFund({ defaultIncomeCategory: "Building Fund" })],
      programmes: [{ _id: "harvest", organizationId: "org", name: "Harvest", createdAt: 1 }],
    });
    const { cashCollectionId } = await submit(ctx, { serviceRows: [serviceRow({ cash: 10 })] });

    await invoke(cashCollections.replaceCollectionEntries, ctx, {
      cashCollectionId,
      weekEndingDate: "2026-10-04",
      collectionDate: "2026-10-04",
      status: "submitted",
      serviceRows: [
        serviceRow({ cash: 30, programmeId: "harvest" }),
        serviceRow({
          serviceNote: "Harvest",
          cash: 0,
          pdq: 20,
          category: "Tithes & First Fruits",
          programmeId: "harvest",
        }),
      ],
      namedDonations: [donation({ serviceDate: "2026-10-02", serviceNote: "Friday" })],
    });

    expect(collectionTransactions(records, cashCollectionId)).toEqual([
      { date: "2026-10-04", amount: 30, category: "Building Fund", programmeId: "harvest", notes: "service:Sunday", donorName: undefined },
      { date: "2026-10-04", amount: 20, category: "Tithes & First Fruits", programmeId: "harvest", notes: "service:Harvest", donorName: undefined },
      { date: "2026-10-02", amount: 40, category: "Tithes & First Fruits", programmeId: null, notes: "service:Friday", donorName: "Ruth Adeyemi" },
    ]);
  });

  it("rejects a programme from another organization", async () => {
    const { ctx } = fixture({
      funds: [generalFund()],
      programmes: [{ _id: "camp", organizationId: "other-org", name: "Camp", createdAt: 1 }],
    });
    const { cashCollectionId } = await submit(ctx, { serviceRows: [serviceRow()] });

    await expect(
      invoke(cashCollections.replaceCollectionEntries, ctx, {
        cashCollectionId,
        weekEndingDate: "2026-10-04",
        collectionDate: "2026-10-04",
        status: "submitted",
        serviceRows: [serviceRow({ programmeId: "camp" })],
      })
    ).rejects.toThrow("Invalid programme");
  });
});
