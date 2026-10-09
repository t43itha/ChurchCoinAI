import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Campaigns from "../components/Campaigns";
import type { AppUser, Donor, Fund, Pledge, Transaction, UserRole } from "../types";

// Query results are chosen by which function reference the component asks for.
const fixtures = vi.hoisted(() => ({
  organization: { giftAidEnabled: true } as { giftAidEnabled?: boolean } | null,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const { api } = await import("../convex/_generated/api");
  const nameOf = (ref: unknown) => getFunctionName(ref as Parameters<typeof getFunctionName>[0]);
  return {
    useQuery: (ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      const name = nameOf(ref);
      if (name === nameOf(api.queries.organizations.current)) return fixtures.organization;
      throw new Error(`Unexpected query: ${name}`);
    },
    useAction: () => () => Promise.resolve([]),
    useMutation: () => () => Promise.resolve(undefined),
  };
});

const user = (role: UserRole): AppUser => ({ _id: "user", name: "Recorder", email: "user@example.invalid", role });

const roof: Fund = {
  _id: "fund-roof",
  name: "Roof appeal",
  type: "Restricted",
  balance: 0,
  targetAmount: 60_000,
  deadline: "2027-01-31",
};

const pledges: Pledge[] = [
  { _id: "p-grace", donorName: "Grace Okafor", amount: 1000, fundId: "fund-roof", frequency: "Monthly", startDate: "2026-01-01", status: "Active" },
  { _id: "p-ruth", donorName: "Ruth Bailey", amount: 2400, fundId: "fund-roof", frequency: "Monthly", startDate: "2026-01-01", status: "Active" },
  { _id: "p-harrison", donorName: "Harrison family", amount: 500, fundId: "fund-roof", frequency: "One-off", startDate: "2026-06-01", status: "Completed" },
];

const transaction = (overrides: Partial<Transaction>): Transaction =>
  ({
    _id: "tx",
    date: "2026-10-01",
    description: "Gift",
    amount: 0,
    type: "Income",
    category: "Donations",
    fundId: "fund-roof",
    isReconciled: false,
    ...overrides,
  }) as Transaction;

const transactions: Transaction[] = [
  transaction({ _id: "t-ruth", amount: 1200, pledgeId: "p-ruth", donorName: "Ruth Bailey" }),
  transaction({ _id: "t-harrison", date: "2026-09-15", amount: 500, pledgeId: "p-harrison", isGiftAidEligible: true }),
  transaction({ _id: "t-box", amount: 100 }),
  transaction({ _id: "t-general", amount: 999, fundId: "fund-general" }),
];

const donors: Donor[] = [];

const noop = () => {};

const renderCampaigns = (role: UserRole, overrides: { funds?: Fund[] } = {}) =>
  renderToStaticMarkup(
    createElement(Campaigns, {
      funds: overrides.funds ?? [roof],
      pledges,
      transactions,
      donors,
      onAddPledge: noop,
      onUpdatePledge: noop,
      onBulkAddPledges: noop,
      onBulkAddDonors: () => Promise.resolve([]),
      onUpdateTransaction: noop,
      onAddFund: () => Promise.resolve(),
      currentUser: user(role),
    })
  );

describe("Campaigns hub", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 9, 12));
    fixtures.organization = { giftAidEnabled: true };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the campaign, its end date and the raised split", () => {
    const html = renderCampaigns("Admin");

    expect(html).toContain("Campaign · 1 open");
    expect(html).toContain("Roof appeal");
    expect(html).toContain("Ends 31 January · 114 days left");
    expect(html).toContain("£1,800");
    expect(html).toContain("of £60,000 target");
    // Received £1,800, still owed on pledges £2,200, and the rest to find.
    expect(html).toContain("£1,800.00");
    expect(html).toContain("£2,200.00");
    expect(html).toContain("£56,000.00");
  });

  it("tags each pledge on track, behind or paid", () => {
    const html = renderCampaigns("Admin");

    expect(html).toContain("Grace Okafor");
    expect(html).toContain("Behind");
    expect(html).toContain("On track");
    expect(html).toContain("Paid ✓");
    expect(html).toContain("£1,200 of £2,400");
  });

  it("shows the Gift Aid row only when the church has Gift Aid on and the fund has eligible gifts", () => {
    expect(renderCampaigns("Admin")).toContain("Gift Aid to claim (25%)");
    expect(renderCampaigns("Admin")).toContain("£125.00");

    fixtures.organization = { giftAidEnabled: false };
    expect(renderCampaigns("Admin")).not.toContain("Gift Aid to claim");
  });

  it("raises the needs-you item for pledges that are behind", () => {
    expect(renderCampaigns("Admin")).toContain("1 pledge is behind");
  });

  it("gives Admin the edit and add controls", () => {
    const html = renderCampaigns("Admin");

    expect(html).toContain('aria-label="Edit pledge from Ruth Bailey"');
    expect(html).toContain("Add pledge");
    expect(html).toContain("Import CSV");
    expect(html).toContain("AI match");
  });

  it("gives Pastorate the same screen without any edit controls", () => {
    const html = renderCampaigns("Pastorate");

    expect(html).toContain("Roof appeal");
    expect(html).toContain("Grace Okafor");
    expect(html).toContain("Switch campaign");
    expect(html).not.toContain("Edit pledge from");
    expect(html).not.toContain("Add pledge");
    expect(html).not.toContain("Import CSV");
    expect(html).not.toContain("AI match");
  });

  it("offers to start a campaign when there are none", () => {
    const html = renderCampaigns("Admin", { funds: [] });

    expect(html).toContain("No campaigns yet");
    expect(html).toContain("Start a campaign");
  });

  it("leaves starting a campaign to Finance and admins", () => {
    const html = renderCampaigns("Pastorate", { funds: [] });

    expect(html).toContain("No campaigns yet");
    expect(html).not.toContain("Start a campaign");
  });
});
