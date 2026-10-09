import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DonorManager from "../components/DonorManager";
import {
  activeScheduleMap,
  filterCounts,
  filterDonors,
  formatPounds,
  giftAidClaimable,
  giftAidState,
  givingStats,
  groupByInitial,
  isLapsed,
  whatsappNumber,
} from "../components/donors/donorDirectory";
import type { ChurchDetails, Donor, Pledge, Transaction, UserRole } from "../types";

vi.mock("convex/react", () => ({
  useConvex: () => ({ query: vi.fn() }),
  useMutation: () => vi.fn(),
}));

const NOW = Date.parse("2026-10-09T12:00:00Z");
const YEAR = new Date().getFullYear();

const donor = (fields: Pick<Donor, "_id" | "name"> & Partial<Donor>): Donor => ({ type: "Individual", ...fields });

const gift = (fields: Partial<Transaction>): Transaction =>
  ({
    _id: "t",
    date: `${YEAR}-03-01`,
    description: "Sunday giving",
    amount: 10,
    type: "Income",
    category: "Donations",
    fundId: "fund-general",
    ...fields,
  }) as Transaction;

const pledge = (fields: Partial<Pledge>): Pledge => ({
  _id: "p",
  donorName: "Ann",
  amount: 20,
  fundId: "fund-general",
  frequency: "Monthly",
  startDate: "2026-01-01",
  status: "Active",
  ...fields,
});

describe("donor directory logic", () => {
  it("adds each gift to the year total and the latest gift, keyed by id or name", () => {
    const stats = givingStats(
      [
        gift({ _id: "a", donorId: "d1", amount: 40.1, date: `${YEAR}-01-05` }),
        gift({ _id: "b", donorName: "Ruth", amount: 10.2, date: `${YEAR}-02-01` }),
        gift({ _id: "c", donorId: "d1", amount: 99, date: `${YEAR - 1}-12-31` }),
        gift({ _id: "d", donorId: "d1", amount: 5, type: "Expenditure", date: `${YEAR}-02-02` }),
      ],
      YEAR
    );

    expect(stats.get("d1")).toEqual({ ytd: 40.1, lastGift: Date.parse(`${YEAR}-01-05`) });
    expect(stats.get("Ruth")?.ytd).toBe(10.2);
  });

  it("filters by Gift Aid and stopped giving, and counts each chip", () => {
    const donors = [
      donor({ _id: "a", name: "Ann", isGiftAidActive: true }),
      donor({ _id: "b", name: "Ben" }),
      donor({ _id: "c", name: "Cy" }),
    ];
    const stats = givingStats(
      [gift({ donorId: "b", date: "2026-06-01" }), gift({ donorId: "a", date: "2026-10-01" })],
      2026
    );
    const options = { search: "", stats, giftAidEnabled: true, now: NOW };

    expect(filterDonors(donors, { ...options, filter: "stoppedGiving" }).map((d) => d.name)).toEqual(["Ben"]);
    expect(filterDonors(donors, { ...options, filter: "noGiftAid" }).map((d) => d.name)).toEqual(["Ben", "Cy"]);
    expect(filterDonors(donors, { ...options, search: "CY", filter: "everyone" }).map((d) => d.name)).toEqual(["Cy"]);
    expect(filterCounts(donors, stats, true, NOW)).toEqual({ everyone: 3, noGiftAid: 2, stoppedGiving: 1 });
  });

  it("drops the Gift Aid filter when the church has Gift Aid off", () => {
    const donors = [donor({ _id: "b", name: "Ben" })];
    expect(giftAidState(donors[0], false)).toBeNull();
    expect(filterDonors(donors, { search: "", filter: "noGiftAid", stats: new Map(), giftAidEnabled: false, now: NOW })).toEqual([]);
  });

  it("groups names under their first letter, with non-letters under #", () => {
    const groups = groupByInitial([
      donor({ _id: "1", name: "Abena" }),
      donor({ _id: "2", name: "Bailey" }),
      donor({ _id: "3", name: "Alex" }),
      donor({ _id: "4", name: "4 Seasons" }),
    ]);

    expect(groups.map((group) => group.letter)).toEqual(["A", "B", "#"]);
    expect(groups[0].donors.map((d) => d.name)).toEqual(["Abena", "Alex"]);
  });

  it("treats a gift 60 days old or more as stopped giving, and never-given donors as not stopped", () => {
    expect(isLapsed(0, NOW)).toBe(false);
    expect(isLapsed(NOW - 59 * 86_400_000, NOW)).toBe(false);
    expect(isLapsed(NOW - 61 * 86_400_000, NOW)).toBe(true);
  });

  it("keeps the first active schedule per donor and ignores finished ones", () => {
    const schedules = activeScheduleMap([
      pledge({ _id: "done", donorName: "Ann", status: "Completed" }),
      pledge({ _id: "monthly", donorName: "Ann", frequency: "Monthly" }),
      pledge({ _id: "weekly", donorName: "Ann", frequency: "Weekly" }),
    ]);

    expect(schedules.get("Ann")?._id).toBe("monthly");
  });

  it("claims 25% of the year's gifts and formats whole and pence amounts", () => {
    expect(giftAidClaimable(1240)).toBe(310);
    expect(giftAidClaimable(10.03)).toBe(2.51);
    expect(formatPounds(2600)).toBe("£2,600");
    expect(formatPounds(90.5)).toBe("£90.5");
  });

  it("turns a UK number into the wa.me format", () => {
    expect(whatsappNumber("07700 900114")).toBe("447700900114");
    expect(whatsappNumber("+44 7700 900114")).toBe("447700900114");
  });
});

describe("Donors page", () => {
  const donors = [
    donor({ _id: "d1", name: "Bayo Bello" }),
    donor({ _id: "d2", name: "Abena Asante", isGiftAidActive: true }),
    donor({ _id: "d3", name: "Alex Ng" }),
  ];
  const giftAidOn: ChurchDetails = { name: "St Barnabas", giftAidEnabled: true };
  const giftAidOff: ChurchDetails = { name: "St Barnabas", giftAidEnabled: false };

  function render(role: UserRole, options: { churchDetails?: ChurchDetails; transactions?: Transaction[] } = {}) {
    return renderToStaticMarkup(
      createElement(DonorManager, {
        donors,
        transactions: options.transactions ?? [],
        pledges: [],
        funds: [{ _id: "fund-general", name: "General Fund", type: "Unrestricted", balance: 0 }],
        currentUser: { _id: "user", name: "Test User", email: "test@example.invalid", role },
        onAddDonor: vi.fn(),
        onUpdateDonor: vi.fn(),
        onAddPledge: vi.fn(),
        onUpdatePledge: vi.fn(),
        onUpdateTransaction: vi.fn(),
        churchDetails: options.churchDetails ?? giftAidOn,
      })
    );
  }

  it("groups the directory by first letter", () => {
    const html = render("Admin");
    expect(html).toContain('aria-label="A"');
    expect(html).toContain('aria-label="B"');
    expect(html).toContain("Abena Asante");
  });

  it("shows a Gift Aid pill on each donor, and the declaration count in the header", () => {
    const html = render("Admin");
    expect(html).toContain(">Gift Aid</span>");
    expect(html).toContain(">No declaration</span>");
    expect(html).toContain("3 people · 1 have a Gift Aid declaration");
    expect(html).toContain(">No Gift Aid<");
  });

  it("drops Gift Aid from the header, the pills and the filters when the church has it off", () => {
    const html = render("Admin", { churchDetails: giftAidOff });
    expect(html).not.toContain("Gift Aid declaration");
    expect(html).not.toContain(">No declaration</span>");
    expect(html).not.toContain(">Gift Aid</span>");
    expect(html).not.toContain("No Gift Aid");
  });

  it("fills the profile column with the selected donor and what they are owed", () => {
    const html = render("Admin", {
      transactions: [gift({ _id: "g1", donorId: "d1", amount: 1240, date: `${YEAR}-04-04` })],
    });
    expect(html).toContain('aria-label="Donor profile"');
    expect(html).toContain(`Given in ${YEAR}`);
    expect(html).toContain("No Gift Aid declaration");
    expect(html).toContain("Would add £310 this year");
  });

  it("gives Pastorate the same screen without add, merge or edit controls", () => {
    const html = render("Pastorate");
    expect(html).toContain("Abena Asante");
    expect(html).not.toContain("Add donor");
    expect(html).not.toContain("Find duplicates");
    expect(html).not.toContain(">Edit<");
  });
});
