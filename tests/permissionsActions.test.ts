import { getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import type { ActionCtx } from "../convex/_generated/server";
import type { UserRole } from "../lib/permissions";
import * as stripe from "../convex/actions/stripe";
import * as banks from "../convex/actions/bankConnections";
import * as plaid from "../convex/actions/plaid";

const { updateSubscription, removeConsent, removePlaidItem } = vi.hoisted(() => ({
  updateSubscription: vi.fn().mockResolvedValue({}),
  removeConsent: vi.fn(),
  removePlaidItem: vi.fn(),
}));
vi.mock("../convex/lib/stripe", async (importOriginal) => ({
  ...await importOriginal<typeof import("../convex/lib/stripe")>(),
  getStripe: () => ({ subscriptions: { update: updateSubscription } }),
}));
vi.mock("../convex/lib/yapily", async (importOriginal) => ({
  ...await importOriginal<typeof import("../convex/lib/yapily")>(),
  deleteYapilyConsent: removeConsent,
}));
vi.mock("../convex/lib/plaid", async (importOriginal) => ({
  ...await importOriginal<typeof import("../convex/lib/plaid")>(),
  getPlaid: () => ({ itemRemove: removePlaidItem }),
}));

function context(role: UserRole, canUseApp = true) {
  const runQuery = vi.fn(async (reference) => {
    switch (getFunctionName(reference)) {
      case "queries/users:current": return { _id: "user", role, organizationId: "org" };
      case "queries/organizations:current": return { _id: "org", accessMode: "subscription" };
      case "queries/subscriptions:access": return { canUseApp, dataMode: "live" };
      case "queries/subscriptions:current": return { stripeSubscriptionId: "sub-test" };
      default: throw new Error("Unexpected query before permission check");
    }
  });
  return { auth: { getUserIdentity: async () => ({ subject: "clerk" }) }, runQuery } as unknown as ActionCtx;
}
const invoke = (fn: unknown, ctx: ActionCtx, args = {}) =>
  (fn as { _handler: (ctx: ActionCtx, args: unknown) => Promise<unknown> })._handler(ctx, args);

describe.each([stripe.createPortalSession, stripe.cancelSubscription, stripe.resumeSubscription, stripe.reconcileCheckoutSession])("billing action permissions", (fn) => {
  it.each<UserRole>(["Finance Team", "Pastorate", "Guest"])("rejects %s", async (role) => {
    await expect(invoke(fn, context(role), { sessionId: "cs-test" })).rejects.toThrow("billing.manage");
  });
});

it("keeps billing recovery available to Admin when app access is blocked", async () => {
  await expect(invoke(stripe.resumeSubscription, context("Admin", false))).resolves.toEqual({ success: true });
  expect(updateSubscription).toHaveBeenCalledWith("sub-test", { cancel_at_period_end: false });
});

describe.each([banks.removeConnection, plaid.removeItem])("bank removal", (fn) => {
  it.each<UserRole>(["Finance Team", "Pastorate", "Guest"])("rejects %s with the removal capability, before provider calls", async (role) => {
    await expect(invoke(fn, context(role))).rejects.toThrow("bank.remove");
    expect(removeConsent).not.toHaveBeenCalled();
    expect(removePlaidItem).not.toHaveBeenCalled();
  });
});

describe.each([banks.startConnection, banks.listInstitutions, plaid.createLinkToken])("bank management", (fn) => {
  it.each<UserRole>(["Pastorate", "Guest"])("rejects %s before provider calls", async (role) => {
    await expect(invoke(fn, context(role))).rejects.toThrow("bank.manage");
  });
  it("still requires an active organization", async () => {
    await expect(invoke(fn, context("Admin", false))).rejects.toThrow("Organization access is not active");
  });
});
