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
        id: "collection-1-2026-05-17-Sunday Service-building-fund-Offerings",
        day: "Sun",
        serviceDate: "2026-05-17",
        serviceNote: "Sunday Service",
        fundId: "building-fund",
        fundName: "Building Fund",
        category: "Offerings",
        cash: 780,
        pdq: 284.5,
        cheque: 220,
        total: 1284.5,
      },
    ]);
  });

  it("keeps service rows and named donations separate in one collection", () => {
    const ledgers = groupInPersonGivingCollections({
      collections: [
        {
          _id: "collection-1",
          weekEndingDate: "2026-06-14",
          collectionDate: "2026-06-14",
          status: "submitted",
          recordedAt: 1,
          recordedBy: "user-1",
          createdAt: 1,
        },
      ],
      transactions: [
        {
          _id: "tx-service-cash",
          date: "2026-06-08",
          description: "Sunday Service - Cash",
          amount: 420,
          type: "Income",
          category: "Offerings",
          fundId: "general-fund",
          isReconciled: false,
          paymentMethod: "Cash",
          cashCollectionId: "collection-1",
          notes: "service:Sunday Service",
        },
        {
          _id: "tx-service-card",
          date: "2026-06-08",
          description: "Sunday Service - PDQ",
          amount: 180,
          type: "Income",
          category: "Offerings",
          fundId: "general-fund",
          isReconciled: false,
          paymentMethod: "Card",
          cashCollectionId: "collection-1",
          notes: "service:Sunday Service",
        },
        {
          _id: "tx-named-building",
          date: "2026-06-14",
          description: "Donation - Jane Smith",
          amount: 250,
          type: "Income",
          category: "Donation",
          fundId: "building-fund",
          isReconciled: false,
          paymentMethod: "Cash",
          cashCollectionId: "collection-1",
          donorName: "Jane Smith",
          donorId: "donor-1",
          isGiftAidEligible: true,
        },
        {
          _id: "tx-named-tithe",
          date: "2026-06-14",
          description: "Tithes & First Fruits - Kwame Mensah",
          amount: 100,
          type: "Income",
          category: "Tithes & First Fruits",
          fundId: "general-fund",
          isReconciled: false,
          paymentMethod: "Cheque",
          cashCollectionId: "collection-1",
          donorName: "Kwame Mensah",
          donorId: "donor-2",
          isGiftAidEligible: false,
        },
      ],
      funds: [
        { _id: "general-fund", name: "General Fund" },
        { _id: "building-fund", name: "Building Fund" },
      ],
    });

    expect(ledgers).toHaveLength(1);
    expect(ledgers[0].total).toBe(950);
    expect(ledgers[0].fundTotals).toEqual([
      { fundId: "building-fund", fundName: "Building Fund", total: 250 },
      { fundId: "general-fund", fundName: "General Fund", total: 700 },
    ]);
    expect(ledgers[0].rows).toEqual([
      {
        id: "collection-1-2026-06-08-Sunday Service-general-fund-Offerings",
        day: "Mon",
        serviceDate: "2026-06-08",
        serviceNote: "Sunday Service",
        fundId: "general-fund",
        fundName: "General Fund",
        category: "Offerings",
        cash: 420,
        pdq: 180,
        cheque: 0,
        total: 600,
      },
    ]);
    expect(ledgers[0].namedDonations).toEqual([
      {
        id: "tx-named-building",
        donorId: "donor-1",
        donorName: "Jane Smith",
        category: "Donation",
        fundId: "building-fund",
        fundName: "Building Fund",
        paymentMethod: "Cash",
        isGiftAidEligible: true,
        amount: 250,
        serviceDate: "2026-06-14",
      },
      {
        id: "tx-named-tithe",
        donorId: "donor-2",
        donorName: "Kwame Mensah",
        category: "Tithes & First Fruits",
        fundId: "general-fund",
        fundName: "General Fund",
        paymentMethod: "Cheque",
        isGiftAidEligible: false,
        amount: 100,
        serviceDate: "2026-06-14",
      },
    ]);
  });

  it("groups donorless non-service collection income as a generic service row", () => {
    const ledgers = groupInPersonGivingCollections({
      collections: [
        {
          _id: "collection-1",
          weekEndingDate: "2026-06-14",
          collectionDate: "2026-06-14",
          status: "submitted",
          recordedAt: 1,
          recordedBy: "user-1",
          createdAt: 1,
        },
      ],
      transactions: [
        {
          _id: "tx-legacy-cash",
          date: "2026-06-14",
          description: "Legacy collection cash",
          amount: 75,
          type: "Income",
          category: "Offerings",
          fundId: "general-fund",
          isReconciled: false,
          paymentMethod: "Cash",
          cashCollectionId: "collection-1",
        },
      ],
      funds: [{ _id: "general-fund", name: "General Fund" }],
    });

    expect(ledgers).toHaveLength(1);
    expect(ledgers[0].namedDonations).toEqual([]);
    expect(ledgers[0].rows).toEqual([
      {
        id: "collection-1-2026-06-14-Service-general-fund-Offerings",
        day: "Sun",
        serviceDate: "2026-06-14",
        serviceNote: "Service",
        fundId: "general-fund",
        fundName: "General Fund",
        category: "Offerings",
        cash: 75,
        pdq: 0,
        cheque: 0,
        total: 75,
      },
    ]);
  });

  it("parses service notes from transaction metadata", () => {
    expect(parseServiceNote("service:Midweek Service")).toBe("Midweek Service");
    expect(parseServiceNote("free text")).toBe("Service");
    expect(parseServiceNote(undefined)).toBe("Service");
  });

  it("filters ledgers by service-row month and year", () => {
    const ledgers = [
      {
        collectionId: "may",
        weekEndingDate: "2026-06-14",
        status: "submitted" as const,
        fundNames: [],
        fundTotals: [],
        rows: [
          {
            id: "may-row",
            category: "Offerings",
            day: "Sun",
            serviceDate: "2026-05-10",
            serviceNote: "Sunday Service",
            fundId: "general-fund",
            fundName: "General Fund",
            cash: 100,
            pdq: 0,
            cheque: 0,
            total: 100,
          },
        ],
        namedDonations: [],
        total: 100,
      },
      {
        collectionId: "june",
        weekEndingDate: "2026-06-07",
        status: "submitted" as const,
        fundNames: [],
        fundTotals: [],
        rows: [
          {
            id: "june-row",
            category: "Offerings",
            day: "Sun",
            serviceDate: "2026-06-07",
            serviceNote: "Sunday Service",
            fundId: "general-fund",
            fundName: "General Fund",
            cash: 200,
            pdq: 0,
            cheque: 0,
            total: 200,
          },
        ],
        namedDonations: [],
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

describe("in-person giving with movement rows", () => {
  it("keeps a collection row marked as a loan, so editing the collection does not drop it", () => {
    const [ledger] = groupInPersonGivingCollections({
      collections: [
        { _id: "c1", weekEndingDate: "2026-10-04", collectionDate: "2026-10-04", status: "submitted", recordedAt: 1, recordedBy: "u", createdAt: 1 },
      ],
      transactions: [
        { _id: "offering", date: "2026-10-04", description: "Sunday Service - Cash", amount: 10, type: "Income", category: "Offerings", fundId: "general", isReconciled: false, paymentMethod: "Cash", cashCollectionId: "c1", notes: "service:Sunday Service" },
        { _id: "loan", date: "2026-10-04", description: "Loan - Member", amount: 100, type: "Income", category: "Loan", movementKind: "loan", fundId: "general", isReconciled: false, paymentMethod: "Cash", cashCollectionId: "c1", donorName: "Member" },
        { _id: "voided", date: "2026-10-04", description: "Voided", amount: 5, type: "Income", category: "Offerings", fundId: "general", isReconciled: false, paymentMethod: "Cash", cashCollectionId: "c1", donorName: "Gone", isVoided: true },
      ],
      funds: [{ _id: "general", name: "General Fund" }],
    });

    expect(ledger.total).toBe(110);
    expect(ledger.namedDonations.map((donation) => [donation.id, donation.category])).toEqual([["loan", "Loan"]]);
  });
});

describe("in-person giving with service notes, categories and programmes", () => {
  const collection = {
    _id: "c1",
    weekEndingDate: "2026-10-04",
    collectionDate: "2026-10-04",
    status: "submitted" as const,
    recordedAt: 1,
    recordedBy: "u",
    createdAt: 1,
  };
  const funds = [{ _id: "general", name: "General Fund" }];
  const base = {
    date: "2026-10-04",
    amount: 20,
    type: "Income" as const,
    fundId: "general",
    isReconciled: false,
    paymentMethod: "Cash" as const,
    cashCollectionId: "c1",
  };

  it("keeps a named tithe with a service note as a named donation with its service date and note", () => {
    const [ledger] = groupInPersonGivingCollections({
      collections: [collection],
      transactions: [
        {
          ...base,
          _id: "tithe",
          description: "Tithes & First Fruits - Kwame Mensah",
          category: "Tithes & First Fruits",
          donorName: "Kwame Mensah",
          donorId: "donor-2",
          notes: "service:Friday",
          date: "2026-10-02",
        },
      ],
      funds,
    });

    expect(ledger.rows).toEqual([]);
    expect(ledger.namedDonations).toEqual([
      {
        id: "tithe",
        donorId: "donor-2",
        donorName: "Kwame Mensah",
        category: "Tithes & First Fruits",
        fundId: "general",
        fundName: "General Fund",
        paymentMethod: "Cash",
        isGiftAidEligible: false,
        amount: 20,
        serviceDate: "2026-10-02",
        serviceNote: "Friday",
      },
    ]);
  });

  it("keeps an offering and an anonymous tithe for the same service and fund as separate rows", () => {
    const [ledger] = groupInPersonGivingCollections({
      collections: [collection],
      transactions: [
        { ...base, _id: "offering", description: "Sunday - Cash", category: "Offerings", notes: "service:Sunday" },
        { ...base, _id: "anon-tithe", description: "Tithes - Cash", category: "Tithes & First Fruits", notes: "service:Sunday" },
      ],
      funds,
    });

    expect(ledger.rows.map((row) => [row.category, row.cash, row.total])).toEqual([
      ["Offerings", 20, 20],
      ["Tithes & First Fruits", 20, 20],
    ]);
    expect(new Set(ledger.rows.map((row) => row.id)).size).toBe(2);
  });

  it("keeps the same service rows under different programmes as separate rows", () => {
    const [ledger] = groupInPersonGivingCollections({
      collections: [collection],
      transactions: [
        { ...base, _id: "harvest", description: "Sunday - Cash", category: "Offerings", notes: "service:Sunday", programmeId: "harvest" },
        { ...base, _id: "plain", description: "Sunday - Cash", category: "Offerings", notes: "service:Sunday" },
      ],
      funds,
    });

    expect(ledger.rows.map((row) => [row.programmeId, row.total])).toEqual([
      ["harvest", 20],
      [undefined, 20],
    ]);
  });
});
