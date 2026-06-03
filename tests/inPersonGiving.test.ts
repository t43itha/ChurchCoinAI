import { describe, expect, it } from "vitest";
import {
  filterInPersonGivingLedgersByMonth,
  groupInPersonGivingCollections,
  parseServiceNote,
} from "../lib/inPersonGiving";

describe("in-person giving grouping", () => {
  it("groups collection transactions into paper ledger service rows", () => {
    const ledgers = groupInPersonGivingCollections({
      collections: [
        {
          _id: "collection-1",
          weekEndingDate: "2026-05-17",
          collectionDate: "2026-05-17",
          status: "submitted",
          recordedAt: 1,
          recordedBy: "user-1",
          createdAt: 1,
        },
      ],
      transactions: [
        {
          _id: "tx-cash",
          date: "2026-05-17",
          description: "Sunday Service - Cash",
          amount: 780,
          type: "Income",
          category: "Offerings",
          fundId: "building-fund",
          isReconciled: false,
          paymentMethod: "Cash",
          cashCollectionId: "collection-1",
          notes: "service:Sunday Service",
        },
        {
          _id: "tx-pdq",
          date: "2026-05-17",
          description: "Sunday Service - PDQ",
          amount: 284.5,
          type: "Income",
          category: "Offerings",
          fundId: "building-fund",
          isReconciled: false,
          paymentMethod: "Card",
          cashCollectionId: "collection-1",
          notes: "service:Sunday Service",
        },
        {
          _id: "tx-cheque",
          date: "2026-05-17",
          description: "Sunday Service - Cheque",
          amount: 220,
          type: "Income",
          category: "Offerings",
          fundId: "building-fund",
          isReconciled: false,
          paymentMethod: "Cheque",
          cashCollectionId: "collection-1",
          notes: "service:Sunday Service",
        },
      ],
      funds: [{ _id: "building-fund", name: "Building Fund" }],
    });

    expect(ledgers).toHaveLength(1);
    expect(ledgers[0].total).toBe(1284.5);
    expect(ledgers[0].fundNames).toEqual(["Building Fund"]);
    expect(ledgers[0].fundTotals).toEqual([
      { fundId: "building-fund", fundName: "Building Fund", total: 1284.5 },
    ]);
    expect(ledgers[0].rows).toEqual([
      {
        id: "collection-1-2026-05-17-Sunday Service",
        day: "Sun",
        serviceDate: "2026-05-17",
        serviceNote: "Sunday Service",
        cash: 780,
        pdq: 284.5,
        cheque: 220,
        total: 1284.5,
      },
    ]);
  });

  it("parses service notes from transaction metadata", () => {
    expect(parseServiceNote("service:Midweek Service")).toBe("Midweek Service");
    expect(parseServiceNote("free text")).toBe("Service");
    expect(parseServiceNote(undefined)).toBe("Service");
  });

  it("filters ledgers by week-ending month and year", () => {
    const ledgers = [
      {
        collectionId: "may",
        weekEndingDate: "2026-05-31",
        status: "submitted" as const,
        fundNames: [],
        fundTotals: [],
        rows: [],
        total: 100,
      },
      {
        collectionId: "june",
        weekEndingDate: "2026-06-07",
        status: "submitted" as const,
        fundNames: [],
        fundTotals: [],
        rows: [],
        total: 200,
      },
    ];

    expect(filterInPersonGivingLedgersByMonth(ledgers, 4, 2026)).toEqual([
      ledgers[0],
    ]);
    expect(filterInPersonGivingLedgersByMonth(ledgers, null, 2026)).toEqual(
      ledgers
    );
  });
});
