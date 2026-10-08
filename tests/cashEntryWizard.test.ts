import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CashEntryWizard from "../components/cashEntry/CashEntryWizard";
import type { InPersonGivingLedger } from "../lib/inPersonGiving";
import type { Fund } from "../types";

vi.mock("convex/react", () => ({
  useQuery: () => [],
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
}));

const funds: Fund[] = [
  { _id: "general", name: "General Fund", type: "Unrestricted", balance: 0 },
  { _id: "building", name: "Building Fund", type: "Restricted", balance: 0 },
];

// A saved week: Friday offering of £100 and one named tithe of £40.
const ledger: InPersonGivingLedger = {
  collectionId: "collection-1",
  weekEndingDate: "2026-10-04",
  collectionDate: "2026-10-02",
  status: "submitted",
  fundNames: ["General Fund"],
  fundTotals: [{ fundId: "general", fundName: "General Fund", total: 140 }],
  rows: [
    {
      id: "row-1",
      day: "Friday",
      serviceDate: "2026-10-02",
      serviceNote: "Friday",
      fundId: "general",
      fundName: "General Fund",
      category: "Offerings",
      cash: 100,
      pdq: 0,
      cheque: 0,
      total: 100,
    },
  ],
  namedDonations: [
    {
      id: "tithe-1",
      donorName: "Margaret Owusu",
      category: "Offerings",
      fundId: "general",
      fundName: "General Fund",
      paymentMethod: "Cash",
      isGiftAidEligible: true,
      amount: 40,
      serviceDate: "2026-10-02",
      serviceNote: "Friday",
    },
  ],
  total: 140,
};

const render = (props: Partial<Parameters<typeof CashEntryWizard>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(CashEntryWizard, {
      funds,
      categories: [],
      storageScope: "user-1",
      onClose: () => {},
      ...props,
    })
  );

describe("cash entry wizard", () => {
  it("starts with the usual services only, Friday and Sunday morning", () => {
    const markup = render();
    expect(markup).toContain("Friday");
    expect(markup).toContain("Sunday morning");
    expect(markup).toContain("Start with Friday");
    // Extra days stay behind "+ Another service this week" until asked for.
    expect(markup).not.toContain("Monday");
  });

  it("opens an existing collection on the check screen with its week total", () => {
    const markup = render({ initialCollection: ledger });
    expect(markup).toContain("Does this match your count?");
    expect(markup).toContain("Week total");
    expect(markup).toContain("£140.00");
    expect(markup).not.toContain("Start with Friday");
  });

  it("shows a collection the walkthrough can't represent read-only, with only Close", () => {
    const bankOnly: InPersonGivingLedger = {
      ...ledger,
      rows: [
        ...ledger.rows,
        {
          id: "bank-row",
          day: "Friday",
          serviceDate: "2026-10-02",
          serviceNote: "Friday",
          fundId: "general",
          fundName: "General Fund",
          category: "Offerings",
          cash: 0,
          pdq: 0,
          cheque: 0,
          total: 25,
        },
      ],
      total: 165,
    };

    const markup = render({ initialCollection: bankOnly });
    expect(markup).toContain("Part of this collection");
    expect(markup).toContain('aria-label="Close"');
    expect(markup).not.toContain("Confirm");
    expect(markup).not.toContain("Save for later");
    expect(markup).not.toContain(">Edit<");
    expect(markup).not.toContain('aria-label="Back"');
    // Totals come from the saved entries, bank row included, not the draft.
    expect(markup).toContain("£165.00");
    expect(markup).toContain("Other (bank or online)");
  });

  it("offers a notes field on the check screen of an existing collection", () => {
    const markup = render({ initialCollection: ledger });
    expect(markup).toContain("Notes (optional)");
    expect(markup).toContain('aria-label="Collection notes"');
  });

  it("names the service and blocks saving while a fund line's fund is gone", () => {
    const withLostFund: InPersonGivingLedger = {
      ...ledger,
      rows: [
        ...ledger.rows,
        {
          id: "row-lost",
          day: "Friday",
          serviceDate: "2026-10-02",
          serviceNote: "Friday",
          fundId: "lost-fund",
          fundName: "Lost Fund",
          category: "Donations",
          cash: 25,
          pdq: 0,
          cheque: 0,
          total: 25,
        },
      ],
      total: 165,
    };

    const markup = render({ initialCollection: withLostFund });
    expect(markup).toContain("A fund no longer exists on Friday.");
    // Both save buttons are disabled while a line has no fund.
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Confirm/);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Save for later/);
  });
});
