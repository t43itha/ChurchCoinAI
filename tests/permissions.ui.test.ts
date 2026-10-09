import { createElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "../components/Settings";
import Sidebar from "../components/Sidebar";
import CashChequeBanking from "../components/CashChequeBanking";
import TransactionManager from "../components/TransactionManager";
import AppContentRoutes from "../components/app/AppContentRoutes";
import { ROLES, type UserRole } from "../lib/permissions";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => queryMock(...args),
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
}));
vi.mock("@clerk/clerk-react", () => ({ UserButton: () => null }));
vi.mock("../components/BillingSettings", () => ({ default: () => null }));
vi.mock("../components/DataPrivacySettings", () => ({ default: () => null }));

const user = (role: UserRole) => ({ _id: "user", name: "Recorder", email: "user@example.invalid", role });
const render = (element: ReactElement, route = "/settings") =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [route] }, element));

beforeEach(() => {
  queryMock.mockImplementation((reference, args) => {
    if (args === "skip") return undefined;
    if (getFunctionName(reference) === "queries/bankConnections:list") {
      return [{ _id: "bank", institutionName: "Test Bank", provider: "yapily", status: "active", accounts: [] }];
    }
    return [];
  });
});
afterEach(() => { vi.unstubAllGlobals(); queryMock.mockClear(); });

function renderSettings(role: UserRole, tab: string) {
  vi.stubGlobal("window", { location: { search: `?tab=${tab}` } });
  const props: ComponentProps<typeof Settings> = {
    currentUser: user(role), users: [user("Admin")],
    funds: [
      { _id: "fund", name: "General", type: "Unrestricted", balance: 0 },
      { _id: "campaign", name: "Roof", type: "Restricted", balance: 0, targetAmount: 100 },
    ],
    categories: [{ _id: "tithes", name: "Tithes" }], churchDetails: { name: "Test Church" },
    pendingInvitations: [{ _id: "invite", organizationId: "org", email: "invite@example.invalid", role: "Guest", invitedBy: "user", status: "pending", createdAt: 0, expiresAt: Date.now() + 100000 }],
    onUpdateUserRole: vi.fn(), onAddCategory: vi.fn(), onRemoveCategory: vi.fn(), onSetCategoryRetired: vi.fn(),
    onInviteUser: vi.fn(), onResendInvitation: vi.fn(), onCancelInvitation: vi.fn(),
    onUpdateChurchDetails: vi.fn(), onAddFund: vi.fn(), onUpdateFund: vi.fn(), onRemoveFund: vi.fn(),
  };
  return render(createElement(Settings, props), `/settings?tab=${tab}`);
}

it("keeps the Finance Team member list read-only while Admin can invite and change roles", () => {
  const finance = renderSettings("Finance Team", "users");
  expect(finance).toContain("user@example.invalid");
  expect(finance).toContain("invite@example.invalid");
  for (const control of ["<select", "> Invite", "Resend", "Revoke", "Copy link"]) expect(finance).not.toContain(control);
  const admin = renderSettings("Admin", "users");
  for (const control of ["<select", "> Invite", "Resend", "Revoke", "Copy link"]) expect(admin).toContain(control);
  for (const role of ROLES) expect(admin).toContain(`value="${role}"`);
});

it.each([
  ["general", "Edit details"],
  ["funds", 'title="Delete"'],
  ["categories", 'aria-label="Delete category Tithes"'],
  ["bank", 'aria-label="Remove Test Bank connection"'],
])("restricts the %s control to Admin", (tab, control) => {
  expect(renderSettings("Finance Team", tab)).not.toContain(control);
  expect(renderSettings("Admin", tab)).toContain(control);
});

const SIDEBAR_HREFS: Record<UserRole, string[]> = {
  Admin: ["/dashboard", "/transactions", "/funds", "/donors", "/campaigns", "/loans", "/reports", "/settings", "/copilot"],
  "Finance Team": ["/dashboard", "/transactions", "/funds", "/donors", "/campaigns", "/loans", "/reports", "/settings", "/copilot"],
  Pastorate: ["/dashboard", "/transactions", "/funds", "/donors", "/campaigns", "/loans", "/reports", "/copilot"],
  Guest: ["/dashboard", "/transactions", "/funds", "/campaigns", "/loans", "/copilot"],
};

it.each(ROLES)("shows the correct navigation to %s", (role) => {
  const html = render(createElement(Sidebar, {
    currentUser: user(role), isOpen: true, onClose: vi.fn(), onOpenSupport: vi.fn(),
    access: { state: "legacy_grant", expiresAt: null, plan: null },
  }));
  const hrefs = [...html.matchAll(/<a [^>]*href="(\/[^"?]*)"/g)].map((match) => match[1]);
  expect(hrefs).toEqual(SIDEBAR_HREFS[role]);
});

describe.each<UserRole>(["Pastorate", "Guest"])("%s reconciliation UI", (role) => {
  it("skips every cash banking query even if the component is mounted directly", () => {
    render(createElement(CashChequeBanking, { currentUser: user(role), funds: [] }));
    const calls = queryMock.mock.calls.filter(([ref]) => getFunctionName(ref).startsWith("queries/cashBankingReconciliations:"));
    expect(calls).toHaveLength(2);
    expect(calls.every(([, args]) => args === "skip")).toBe(true);
  });
  it("hides bank and cash reconciliation entry points", () => {
    const html = render(createElement(TransactionManager, { currentUser: user(role), funds: [], pledges: [], categories: [] }));
    expect(html).not.toMatch(/>\s*Reconcile\s*</);
    expect(html).not.toContain("Cash/cheque Banking");
  });
});

it("blocks a direct Guest reports route before fetching report data", () => {
  render(createElement(AppContentRoutes, { currentUser: user("Guest"), churchDetails: { name: "Test Church" }, funds: [], categories: [] }), "/reports");
  expect(queryMock).not.toHaveBeenCalled();
});
