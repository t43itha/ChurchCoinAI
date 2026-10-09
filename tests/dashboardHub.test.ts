import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "../components/Dashboard";
import { buildExecutiveDashboardSummary, type ExecutiveDashboardSummary } from "../lib/dashboardKpis";
import { ROLES, type UserRole } from "../lib/permissions";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => queryMock(...args),
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
}));
vi.mock("@clerk/clerk-react", () => ({ UserButton: () => null }));

const baseSummary = (): ExecutiveDashboardSummary =>
  buildExecutiveDashboardSummary({
    periodKey: "previousMonth",
    now: new Date("2026-10-08T12:00:00Z"),
    funds: [],
    transactions: [],
    donors: [],
    pledges: [],
    cashCollections: [],
    cashReconciliations: [],
    statementSessions: [],
    bankAccountFundIds: [],
  });

let summary: ExecutiveDashboardSummary | undefined;

beforeEach(() => {
  summary = baseSummary();
  queryMock.mockImplementation((reference, args) => {
    if (args === "skip") return undefined;
    switch (getFunctionName(reference)) {
      case "queries/dashboard:executiveSummary":
        return summary;
      case "queries/bankConnections:list":
        return [];
      case "queries/bankConnections:getItemsNeedingAttention":
        return [];
      default:
        return undefined;
    }
  });
});

const user = (role: UserRole) => ({ _id: "user", name: "Recorder", email: "user@example.invalid", role });

function renderDashboard(role: UserRole) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/dashboard"] },
      createElement(Dashboard, { funds: [], categories: [], currentUser: user(role) })
    )
  );
}

describe("Dashboard hub", () => {
  it("shows a loading state until the summary arrives", () => {
    summary = undefined;
    expect(renderDashboard("Admin")).toContain("Loading leadership dashboard...");
  });

  it("lists the things that need the user, with links to the page that fixes each", () => {
    summary = {
      ...baseSummary(),
      readiness: { ...baseSummary().readiness, unlinkedMovementLegs: 2 },
      donorFollowUp: { ...baseSummary().donorFollowUp, missedGiftAidCount: 3, missedGiftAidValue: 120 },
    };
    const html = renderDashboard("Admin");

    expect(html).toContain("Transfers to pair");
    expect(html).toContain('href="/transactions?status=awaiting-link"');
    expect(html).toContain("Gifts missing Gift Aid");
    expect(html).toContain('href="/donors"');
    expect(html).toContain("2 things need you.");
    expect(html).not.toContain("You&#x27;re up to date.");
  });

  it("shows four needs-you rows and offers the rest behind a button, with the total in the status line", () => {
    summary = {
      ...baseSummary(),
      readiness: {
        ...baseSummary().readiness,
        unreconciledExpenditureCount: 4,
        cashBankingPendingWeeks: 1,
        unlinkedMovementLegs: 1,
        possibleDoubleCountMonths: ["2026-09"],
      },
      donorFollowUp: { ...baseSummary().donorFollowUp, missedGiftAidCount: 3, missedGiftAidValue: 120, pledgesBehindCount: 2 },
    };
    const html = renderDashboard("Admin");

    expect(html).toContain("6 things need you.");
    expect(html).toContain("Show 2 more");
    expect(html).toContain("Possible double count");
    // The receipt column also mentions missing Gift Aid, so match the needs-you row's title element.
    expect(html).not.toContain(">Gifts missing Gift Aid</b>");
    expect(html).not.toContain(">Pledges behind</b>");
  });

  it("offers no expander when four or fewer rows need the user", () => {
    summary = {
      ...baseSummary(),
      readiness: { ...baseSummary().readiness, unlinkedMovementLegs: 2 },
      donorFollowUp: { ...baseSummary().donorFollowUp, missedGiftAidCount: 3, missedGiftAidValue: 120 },
    };
    expect(renderDashboard("Admin")).not.toMatch(/Show \d+ more/);
  });

  it("uses the singular status line for one item", () => {
    summary = {
      ...baseSummary(),
      readiness: { ...baseSummary().readiness, unlinkedMovementLegs: 1 },
    };
    expect(renderDashboard("Admin")).toContain("1 thing needs you.");
  });

  it("says the user is up to date when nothing needs them", () => {
    const html = renderDashboard("Admin");
    expect(html).toContain("You&#x27;re up to date.");
    expect(html).not.toContain("things need you");
    expect(html).not.toContain("thing needs you");
  });

  it("hides Gift Aid figures when Gift Aid is switched off", () => {
    summary = {
      ...baseSummary(),
      readiness: { ...baseSummary().readiness, giftAidClaimable: null },
      donorFollowUp: { ...baseSummary().donorFollowUp, missedGiftAidCount: null, missedGiftAidValue: null },
    };
    const html = renderDashboard("Admin");
    expect(html).not.toContain("To claim (25%)");
    expect(html).not.toContain("Gifts missing Gift Aid");
    expect(html).toContain("Funds held");
  });

  it.each<UserRole>(["Admin", "Finance Team"])("offers Record giving to %s", (role) => {
    expect(renderDashboard(role)).toContain("Record giving");
  });

  it.each<UserRole>(["Pastorate", "Guest"])("does not offer Record giving to %s", (role) => {
    expect(renderDashboard(role)).not.toContain("Record giving");
  });

  it("does not link missing-Gift-Aid rows to donors for roles without donors.read", () => {
    summary = {
      ...baseSummary(),
      donorFollowUp: { ...baseSummary().donorFollowUp, missedGiftAidCount: 3, missedGiftAidValue: 120 },
    };
    const html = renderDashboard("Guest");
    expect(html).toContain("Gifts missing Gift Aid");
    expect(html).not.toContain('href="/donors"');
  });

  it.each(ROLES)("renders for %s without throwing", (role) => {
    expect(renderDashboard(role)).toContain("Funds held");
  });
});
