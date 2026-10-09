import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DonorManager from "../components/DonorManager";
import DonorDetail, { type DonorDetailProps } from "../components/donors/DonorDetail";
import DonorList, { type MergeControls } from "../components/donors/DonorList";
import { submitSchedule, type ScheduleDraft } from "../components/donors/ScheduleSheet";
import {
  activeScheduleMap,
  donorsWithPledgesBehind,
  filterCounts,
  filterDonors,
  formatPounds,
  giftAidClaimable,
  giftAidState,
  givingStats,
  groupByInitial,
  isLapsed,
  undeclaredGiftAid,
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
    category: "Offerings",
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
    const pledgesBehind = new Set<string>();
    const options = { search: "", stats, giftAidEnabled: true, now: NOW, pledgesBehind };

    expect(filterDonors(donors, { ...options, filter: "stoppedGiving" }).map((d) => d.name)).toEqual(["Ben"]);
    expect(filterDonors(donors, { ...options, filter: "noGiftAid" }).map((d) => d.name)).toEqual(["Ben", "Cy"]);
    expect(filterDonors(donors, { ...options, search: "CY", filter: "everyone" }).map((d) => d.name)).toEqual(["Cy"]);
    expect(filterCounts(donors, stats, true, NOW, pledgesBehind)).toEqual({
      everyone: 3,
      noGiftAid: 2,
      pledgesBehind: 0,
      stoppedGiving: 1,
    });
  });

  it("drops the Gift Aid filter when the church has Gift Aid off", () => {
    const donors = [donor({ _id: "b", name: "Ben" })];
    expect(giftAidState(donors[0], false)).toBeNull();
    expect(
      filterDonors(donors, { search: "", filter: "noGiftAid", stats: new Map(), giftAidEnabled: false, now: NOW, pledgesBehind: new Set() })
    ).toEqual([]);
  });

  it("finds donors with a recurring schedule that has fallen behind, and filters to them", () => {
    const donors = [donor({ _id: "a1", name: "Ann" }), donor({ _id: "b1", name: "Ben" })];
    // Ann's monthly schedule has had no payment in the 45-day window; Ben paid last week.
    const behind = donorsWithPledgesBehind(
      donors,
      [pledge({ donorName: "Ann" }), pledge({ _id: "p2", donorName: "Ben" })],
      [gift({ donorName: "Ben", date: "2026-10-01" })],
      "2026-10-09"
    );

    expect([...behind]).toEqual(["a1"]);
    const options = { search: "", stats: new Map(), giftAidEnabled: true, now: NOW, pledgesBehind: behind };
    expect(filterDonors(donors, { ...options, filter: "pledgesBehind" }).map((d) => d.name)).toEqual(["Ann"]);
    expect(filterCounts(donors, options.stats, true, NOW, behind).pledgesBehind).toBe(1);
  });

  it("does not count an expenditure row as a payment on a schedule", () => {
    const donors = [donor({ _id: "a1", name: "Ann" })];
    const behind = donorsWithPledgesBehind(
      donors,
      [pledge({ donorName: "Ann" })],
      [gift({ donorName: "Ann", date: "2026-10-01", type: "Expenditure" })],
      "2026-10-09"
    );
    expect(behind.has("a1")).toBe(true);
  });

  it("estimates Gift Aid from giving income only, and withholds the figure while a gift is uncategorised", () => {
    expect(
      undeclaredGiftAid([gift({ amount: 1240, category: "Offerings" }), gift({ amount: 80, category: "Merchandise" })])
    ).toEqual({ giving: 1240, claimable: 310 });
    expect(undeclaredGiftAid([gift({ amount: 80, category: "Merchandise" })])).toEqual({ giving: 0, claimable: 0 });
    expect(undeclaredGiftAid([gift({ amount: 100, category: "Offerings" }), gift({ amount: 50, category: "Uncategorised" })])).toEqual({
      giving: 100,
      claimable: null,
    });
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
    expect(html.toLowerCase()).not.toContain("gift aid");
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

describe("schedule sheet", () => {
  const draft: ScheduleDraft = {
    donorId: "d1",
    donorName: "Ann",
    fundId: "fund-general",
    amount: "0",
    frequency: "Monthly",
    startDate: "2026-10-01",
    endDate: "",
  };

  it.each(["0", "0.00", "", "-5", "abc"])("never sends an amount of %j to onSubmit", (amount) => {
    const onSubmit = vi.fn();
    submitSchedule({ ...draft, amount }, onSubmit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sends a positive amount as a number, with the start date and no end date", () => {
    const onSubmit = vi.fn();
    submitSchedule({ ...draft, amount: "12.5" }, onSubmit);
    expect(onSubmit).toHaveBeenCalledWith({
      donorId: "d1",
      donorName: "Ann",
      amount: 12.5,
      fundId: "fund-general",
      frequency: "Monthly",
      startDate: "2026-10-01",
      endDate: undefined,
      status: "Active",
    });
  });

  it("needs a fund", () => {
    const onSubmit = vi.fn();
    submitSchedule({ ...draft, amount: "10", fundId: "" }, onSubmit);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// The rows hold no hooks, so the tree can be walked without a DOM and each control's handler invoked.
type RowNode = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

function flatten(node: ReactNode): RowNode[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (typeof node.type === "function") {
    return flatten((node.type as (props: unknown) => ReactNode)(node.props));
  }
  return [node as RowNode, ...flatten(node.props.children)];
}

describe("donor list rows", () => {
  const donors = [donor({ _id: "d1", name: "Ann" }), donor({ _id: "d2", name: "Ben" })];

  function listProps(overrides: { merge?: MergeControls; onSelect?: (donor: Donor) => void; pledgesBehind?: Set<string> } = {}) {
    return {
      donors,
      visible: donors,
      search: "",
      onSearch: vi.fn(),
      filter: "everyone" as const,
      onFilter: vi.fn(),
      stats: new Map(),
      schedules: new Map(),
      pledgesBehind: overrides.pledgesBehind ?? new Set<string>(),
      giftAidEnabled: true,
      now: NOW,
      selectedId: null,
      onSelect: overrides.onSelect ?? vi.fn(),
      merge: overrides.merge,
    };
  }

  function mergeControls(selected: string[]): MergeControls {
    return {
      active: true,
      selected: new Set(selected),
      primaryId: null,
      busy: false,
      onStart: vi.fn(),
      onToggle: vi.fn(),
      onKeep: vi.fn(),
      onMerge: vi.fn(),
      onCancel: vi.fn(),
    };
  }

  // The row's own button is the one that carries aria-current, even when that is undefined.
  const rowButton = (els: RowNode[]) => els.find((el) => el.type === "button" && "aria-current" in el.props);

  it("toggles merge selection on a row tap instead of opening the profile", () => {
    const merge = mergeControls(["d2"]);
    const onSelect = vi.fn();
    const els = flatten(DonorList(listProps({ merge, onSelect })));

    rowButton(els)?.props.onClick?.();

    expect(merge.onToggle).toHaveBeenCalledWith("d1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens the profile on a row tap when not merging", () => {
    const onSelect = vi.fn();
    const els = flatten(DonorList(listProps({ onSelect })));

    rowButton(els)?.props.onClick?.();

    expect(onSelect).toHaveBeenCalledWith(donors[0]);
  });

  it("lets the merger choose the primary donor from the selected rows", () => {
    const merge = mergeControls(["d1", "d2"]);
    const keepButtons = flatten(DonorList(listProps({ merge }))).filter((el) => el.type === "button" && el.props.children === "Keep");

    expect(keepButtons).toHaveLength(2);
    keepButtons[0].props.onClick?.();

    expect(merge.onKeep).toHaveBeenCalledWith("d1");
  });

  it("shows the pledges-behind chip with its count", () => {
    const html = renderToStaticMarkup(createElement(DonorList, listProps({ pledgesBehind: new Set(["d1"]) })));

    expect(html).toMatch(/Pledges behind<span[^>]*>1<\/span>/);
  });
});

describe("donor profile prompts", () => {
  const detailProps = (overrides: Partial<DonorDetailProps> = {}): DonorDetailProps => ({
    donor: donor({ _id: "d1", name: "Bayo Bello" }),
    giftAidEnabled: true,
    canEdit: true,
    now: NOW,
    year: YEAR,
    yearTotal: 0,
    yearCount: 0,
    undeclared: { giving: 0, claimable: 0 },
    lifetimeTotal: 0,
    gifts: [],
    donorPledges: [],
    allPledges: [],
    funds: [],
    onEdit: vi.fn(),
    onExport: vi.fn(),
    onAddSchedule: vi.fn(),
    onThankYou: vi.fn(),
    onLinkPledge: vi.fn(),
    onUnlinkPledge: vi.fn(),
    ...overrides,
  });

  it("asks an individual with giving income for a declaration, with the amount", () => {
    const html = renderToStaticMarkup(createElement(DonorDetail, detailProps({ undeclared: { giving: 500, claimable: 125 } })));

    expect(html).toContain("No Gift Aid declaration");
    expect(html).toContain("Would add £125 this year");
  });

  it("does not ask an organisation for a declaration", () => {
    const html = renderToStaticMarkup(
      createElement(
        DonorDetail,
        detailProps({
          donor: donor({ _id: "o1", name: "St Mary's PCC", type: "Organization" }),
          undeclared: { giving: 500, claimable: 125 },
        })
      )
    );

    expect(html).not.toContain("No Gift Aid declaration");
  });

  it("does not ask for a declaration when the only income is not giving", () => {
    const undeclared = undeclaredGiftAid([gift({ amount: 80, category: "Merchandise" })]);
    const html = renderToStaticMarkup(createElement(DonorDetail, detailProps({ undeclared })));

    expect(html).not.toContain("No Gift Aid declaration");
  });

  it("asks for a declaration without a figure while a gift is uncategorised", () => {
    const html = renderToStaticMarkup(createElement(DonorDetail, detailProps({ undeclared: { giving: 100, claimable: null } })));

    expect(html).toContain("No Gift Aid declaration");
    expect(html).not.toContain("Would add");
  });

  it("gives each profile its own disclosure id when it is shown twice", () => {
    const html = renderToStaticMarkup(
      createElement("div", null, createElement(DonorDetail, detailProps()), createElement(DonorDetail, detailProps()))
    );
    const ids = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(html).not.toContain('id="donor-more"');
  });
});
