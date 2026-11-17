// Screens hide the controls whose server actions a role can no longer run.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIReports } from "../components/reports/AIReports";
import Campaigns from "../components/Campaigns";
import SubscriptionRequired from "../components/SubscriptionRequired";
import { ROLES, can } from "../lib/permissions";
import type { Fund, Pledge, Transaction, UserRole } from "../types";

vi.mock("convex/react", () => ({
  useQuery: () => ({ giftAidEnabled: true }),
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
}));
vi.mock("@clerk/clerk-react", () => ({ UserButton: () => null }));

afterEach(() => vi.unstubAllGlobals());

const roof: Fund = { _id: "fund-roof", name: "Roof appeal", type: "Restricted", balance: 0, targetAmount: 1000 };
const paidPledge: Pledge = { _id: "p1", donorName: "Grace Okafor", amount: 500, fundId: "fund-roof", frequency: "One-off", startDate: "2026-06-01", status: "Completed" };
const payment = { _id: "t1", date: "2026-06-02", description: "Gift", amount: 500, type: "Income", category: "Donations", fundId: "fund-roof", isReconciled: false, pledgeId: "p1" } as Transaction;

describe("AI reports", () => {
  it.each(ROLES.filter((role) => can(role, "reports.read")))("offers the Gift Aid schedule only with giftAid.read (%s)", (role) => {
    const html = renderToStaticMarkup(createElement(AIReports, {
      transactions: [], funds: [roof], pledges: [], churchDetails: { name: "Church", giftAidEnabled: true },
      canDraftGiftAid: can(role, "giftAid.read"),
    }));
    expect(html).toContain("Treasurer");
    expect(html.includes("Gift Aid Schedule")).toBe(can(role, "giftAid.read"));
  });
});

describe("Campaigns", () => {
  it.each(ROLES)("offers a donor thank-you draft only with donors.read (%s)", (role: UserRole) => {
    const html = renderToStaticMarkup(createElement(Campaigns, {
      funds: [roof], pledges: [paidPledge], transactions: [payment], donors: [],
      onAddPledge: () => Promise.resolve(true), onUpdatePledge: () => {}, onBulkAddPledges: () => {},
      onBulkAddDonors: () => Promise.resolve([]), onUpdateTransaction: () => {}, onAddFund: () => Promise.resolve("f"),
      currentUser: { _id: "user", name: "Recorder", email: "user@example.invalid", role },
    }));
    expect(html.includes(">Thank<")).toBe(can(role, "donors.read"));
  });
});

describe("Locked-out church", () => {
  it.each(ROLES)("lets only the Admin open data export and erasure (%s)", (role) => {
    vi.stubGlobal("window", { location: { search: "", origin: "https://app.example.invalid" }, setTimeout, clearTimeout });
    const html = renderToStaticMarkup(createElement(SubscriptionRequired, {
      organizationName: "Church", userRole: role, accessState: "access_revoked", onOpenSupport: () => {},
    }));
    expect(html.includes("Your data")).toBe(can(role, "organization.export"));
  });
});
