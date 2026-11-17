import { describe, expect, it } from "vitest";
import { resolveOrganizationAccess } from "../convex/lib/access";
import { ROLES } from "../lib/permissions";

const NOW = Date.UTC(2026, 7, 11, 12);
const user = {
  _id: "user_1",
  organizationId: "org_1",
  role: "Admin",
} as any;

const BILLING_ON = { billing: true, bankFeeds: false };
const BILLING_OFF = { billing: false, bankFeeds: false };

function fakeCtx(organization: Record<string, unknown> | null, subscription: Record<string, unknown> | null = null) {
  return {
    db: {
      get: async () => organization,
      query: () => ({
        withIndex: () => ({
          first: async () => subscription,
        }),
      }),
    },
  } as any;
}

const resolve = (
  organization: Record<string, unknown> | null,
  subscription: Record<string, unknown> | null = null,
  { features = BILLING_ON, role = "Admin" }: { features?: typeof BILLING_ON; role?: string } = {}
) => resolveOrganizationAccess(fakeCtx(organization, subscription), { ...user, role }, NOW, features);

const subscriptionOrg = { _id: "org_1", accessMode: "subscription", dataMode: "live" };

describe("organization access resolver", () => {
  it("keeps unclassified existing organizations on a migration-safe legacy grant", async () => {
    const access = await resolve({ _id: "org_1", name: "Existing Church" });

    expect(access.state).toBe("legacy_grant");
    expect(access.canUseApp).toBe(true);
  });

  it("requires payment once a church's product trial has expired with no subscription", async () => {
    const access = await resolve({
      ...subscriptionOrg,
      trialStatus: "expired",
      trialStartedAt: NOW - 20 * 86_400_000,
      trialEndsAt: NOW - 6 * 86_400_000,
    });

    expect(access.state).toBe("payment_required");
    expect(access.canUseApp).toBe(false);
    expect(access.canManageBilling).toBe(true);
    expect(access.reason).toBe("product_trial_expired");
  });

  it("grants an unexpired server-issued product trial", async () => {
    const access = await resolve({
      ...subscriptionOrg,
      trialStatus: "active",
      trialStartedAt: NOW - 2 * 86_400_000,
      trialEndsAt: NOW + 12 * 86_400_000,
      trialPlan: "growing",
    });

    expect(access.state).toBe("active_trial");
    expect(access.canUseApp).toBe(true);
    expect(access.canManageBilling).toBe(true);
    expect(access.expiresAt).toBe(NOW + 12 * 86_400_000);
    expect(access.plan).toBe("growing");
  });

  it("fails closed at the exact product-trial expiry boundary", async () => {
    const access = await resolve({
      ...subscriptionOrg,
      trialStatus: "active",
      trialStartedAt: NOW - 14 * 86_400_000,
      trialEndsAt: NOW,
      trialPlan: "starter",
    });

    expect(access.state).toBe("payment_required");
    expect(access.canUseApp).toBe(false);
    expect(access.reason).toBe("product_trial_expired");
    expect(access.plan).toBe("starter");
  });

  it("keeps an active trial open while Checkout is incomplete", async () => {
    const access = await resolve(
      {
        ...subscriptionOrg,
        trialStatus: "active",
        trialStartedAt: NOW - 86_400_000,
        trialEndsAt: NOW + 13 * 86_400_000,
      },
      { status: "incomplete", plan: "growing", currentPeriodEnd: NOW + 30 * 86_400_000, updatedAt: NOW }
    );

    expect(access.state).toBe("active_trial");
    expect(access.canUseApp).toBe(true);
  });

  it("grants access to an active subscription", async () => {
    const access = await resolve(subscriptionOrg, {
      status: "active",
      plan: "growing",
      currentPeriodEnd: NOW + 30 * 86_400_000,
      updatedAt: NOW,
    });

    expect(access.state).toBe("active_subscription");
    expect(access.canUseApp).toBe(true);
    expect(access.plan).toBe("growing");
  });

  it("allows seven days of past-due grace and blocks after it expires", async () => {
    const subscription = {
      status: "past_due",
      plan: "starter",
      currentPeriodEnd: NOW,
      pastDueSince: NOW - 6 * 86_400_000,
      updatedAt: NOW - 6 * 86_400_000,
    };

    const grace = await resolve(subscriptionOrg, subscription);
    const expired = await resolve(subscriptionOrg, { ...subscription, pastDueSince: NOW - 8 * 86_400_000 });

    expect(grace.state).toBe("past_due_grace");
    expect(grace.canUseApp).toBe(true);
    expect(expired.state).toBe("payment_required");
    expect(expired.canUseApp).toBe(false);
  });

  it("grants only ready, unexpired synthetic demos", async () => {
    const demo = { _id: "org_1", accessMode: "demo", dataMode: "synthetic", demoSeedStatus: "ready" };
    const ready = await resolve({ ...demo, accessExpiresAt: NOW + 86_400_000 });
    const expired = await resolve({ ...demo, accessExpiresAt: NOW - 1 });

    expect(ready.state).toBe("active_demo");
    expect(ready.canUseApp).toBe(true);
    expect(ready.canManageBilling).toBe(false);
    expect(expired.state).toBe("demo_expired");
    expect(expired.canUseApp).toBe(false);
  });
});

describe("early access while billing is off", () => {
  // Every state a subscription church can be in when billing is switched off.
  const subscriptionChurches: Array<[string, Record<string, unknown>, Record<string, unknown> | null]> = [
    ["no trial and no subscription", subscriptionOrg, null],
    ["an expired product trial", { ...subscriptionOrg, trialStatus: "expired", trialEndsAt: NOW - 86_400_000 }, null],
    ["an active product trial", { ...subscriptionOrg, trialStatus: "active", trialStartedAt: NOW, trialEndsAt: NOW + 86_400_000 }, null],
    ["a lapsed past-due subscription", subscriptionOrg, { status: "past_due", plan: "starter", pastDueSince: NOW - 30 * 86_400_000, updatedAt: NOW, currentPeriodEnd: NOW }],
    ["a cancelled subscription", subscriptionOrg, { status: "canceled", plan: "growing", updatedAt: NOW, currentPeriodEnd: NOW }],
    ["an active subscription", subscriptionOrg, { status: "active", plan: "growing", updatedAt: NOW, currentPeriodEnd: NOW + 86_400_000 }],
  ];

  describe.each(ROLES)("for %s", (role) => {
    it.each(subscriptionChurches)("opens the app with %s and offers no billing", async (_label, organization, subscription) => {
      const access = await resolve(organization, subscription, { features: BILLING_OFF, role });

      expect(access.state).toBe("early_access");
      expect(access.canUseApp).toBe(true);
      expect(access.canManageBilling).toBe(false);
      expect(access.expiresAt).toBeNull();
    });
  });

  it("leaves legacy and demo churches exactly as they are", async () => {
    const legacy = await resolve({ _id: "org_1" }, null, { features: BILLING_OFF });
    const demoExpired = await resolve(
      { _id: "org_1", accessMode: "demo", dataMode: "synthetic", demoSeedStatus: "ready", accessExpiresAt: NOW - 1 },
      null,
      { features: BILLING_OFF }
    );
    const demoPending = await resolve(
      { _id: "org_1", accessMode: "demo", dataMode: "synthetic", demoSeedStatus: "pending" },
      null,
      { features: BILLING_OFF }
    );

    expect(legacy.state).toBe("legacy_grant");
    expect(demoExpired.state).toBe("demo_expired");
    expect(demoExpired.canUseApp).toBe(false);
    expect(demoPending.state).toBe("demo_provisioning");
  });

  it("still denies a church whose organisation record is missing", async () => {
    const access = await resolve(null, null, { features: BILLING_OFF });
    expect(access.state).toBe("access_revoked");
    expect(access.canUseApp).toBe(false);
  });
});

describe("the gap after billing is switched on", () => {
  it("keeps an early-access church open until its trial has been started", async () => {
    const access = await resolve(subscriptionOrg, null, { features: BILLING_ON });

    expect(access.state).toBe("early_access");
    expect(access.canUseApp).toBe(true);
  });

  it("does not reopen a church that had a trial and let it expire", async () => {
    const access = await resolve(
      { ...subscriptionOrg, trialStatus: "expired", trialEndsAt: NOW - 86_400_000 },
      null,
      { features: BILLING_ON }
    );

    expect(access.state).toBe("payment_required");
  });

  it("keeps a church open whose old subscription ended before billing came back", async () => {
    const access = await resolve(
      subscriptionOrg,
      { status: "canceled", plan: "growing", updatedAt: NOW, currentPeriodEnd: NOW },
      { features: BILLING_ON }
    );

    expect(access.state).toBe("early_access");
    expect(access.canUseApp).toBe(true);
  });

  it("does not reopen a church whose subscription lapsed after billing came back", async () => {
    const access = await resolve(
      { ...subscriptionOrg, billingStartedAt: NOW - 86_400_000 },
      { status: "canceled", plan: "growing", updatedAt: NOW, currentPeriodEnd: NOW },
      { features: BILLING_ON }
    );

    expect(access.state).toBe("payment_required");
    expect(access.canUseApp).toBe(false);
  });
});
