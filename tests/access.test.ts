import { describe, expect, it } from "vitest";
import { resolveOrganizationAccess } from "../convex/lib/access";

const NOW = Date.UTC(2026, 7, 11, 12);
const user = {
  _id: "user_1",
  organizationId: "org_1",
  role: "Admin",
} as any;

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

describe("organization access resolver", () => {
  it("keeps unclassified existing organizations on a migration-safe legacy grant", async () => {
    const access = await resolveOrganizationAccess(
      fakeCtx({ _id: "org_1", name: "Existing Church" }),
      user,
      NOW
    );

    expect(access.state).toBe("legacy_grant");
    expect(access.canUseApp).toBe(true);
  });

  it("requires payment for a subscription organization without a trial or subscription", async () => {
    const access = await resolveOrganizationAccess(
      fakeCtx({ _id: "org_1", accessMode: "subscription", dataMode: "live" }),
      user,
      NOW
    );

    expect(access.state).toBe("payment_required");
    expect(access.canUseApp).toBe(false);
    expect(access.canManageBilling).toBe(true);
  });

  it("grants an unexpired server-issued product trial", async () => {
    const access = await resolveOrganizationAccess(
      fakeCtx({
        _id: "org_1",
        accessMode: "subscription",
        dataMode: "live",
        trialStatus: "active",
        trialStartedAt: NOW - 2 * 86_400_000,
        trialEndsAt: NOW + 12 * 86_400_000,
        trialPlan: "growing",
      }),
      user,
      NOW
    );

    expect(access.state).toBe("active_trial");
    expect(access.canUseApp).toBe(true);
    expect(access.canManageBilling).toBe(true);
    expect(access.expiresAt).toBe(NOW + 12 * 86_400_000);
    expect(access.plan).toBe("growing");
  });

  it("fails closed at the exact product-trial expiry boundary", async () => {
    const access = await resolveOrganizationAccess(
      fakeCtx({
        _id: "org_1",
        accessMode: "subscription",
        dataMode: "live",
        trialStatus: "active",
        trialStartedAt: NOW - 14 * 86_400_000,
        trialEndsAt: NOW,
        trialPlan: "starter",
      }),
      user,
      NOW
    );

    expect(access.state).toBe("payment_required");
    expect(access.canUseApp).toBe(false);
    expect(access.reason).toBe("product_trial_expired");
    expect(access.plan).toBe("starter");
  });

  it("keeps an active trial open while Checkout is incomplete", async () => {
    const access = await resolveOrganizationAccess(
      fakeCtx(
        {
          _id: "org_1",
          accessMode: "subscription",
          dataMode: "live",
          trialStatus: "active",
          trialStartedAt: NOW - 86_400_000,
          trialEndsAt: NOW + 13 * 86_400_000,
        },
        {
          status: "incomplete",
          plan: "growing",
          currentPeriodEnd: NOW + 30 * 86_400_000,
          updatedAt: NOW,
        }
      ),
      user,
      NOW
    );

    expect(access.state).toBe("active_trial");
    expect(access.canUseApp).toBe(true);
  });

  it("grants access to an active subscription", async () => {
    const access = await resolveOrganizationAccess(
      fakeCtx(
        { _id: "org_1", accessMode: "subscription", dataMode: "live" },
        {
          status: "active",
          plan: "growing",
          currentPeriodEnd: NOW + 30 * 86_400_000,
          updatedAt: NOW,
        }
      ),
      user,
      NOW
    );

    expect(access.state).toBe("active_subscription");
    expect(access.canUseApp).toBe(true);
    expect(access.plan).toBe("growing");
  });

  it("allows seven days of past-due grace and blocks after it expires", async () => {
    const organization = { _id: "org_1", accessMode: "subscription", dataMode: "live" };
    const subscription = {
      status: "past_due",
      plan: "starter",
      currentPeriodEnd: NOW,
      pastDueSince: NOW - 6 * 86_400_000,
      updatedAt: NOW - 6 * 86_400_000,
    };

    const grace = await resolveOrganizationAccess(fakeCtx(organization, subscription), user, NOW);
    const expired = await resolveOrganizationAccess(
      fakeCtx(organization, { ...subscription, pastDueSince: NOW - 8 * 86_400_000 }),
      user,
      NOW
    );

    expect(grace.state).toBe("past_due_grace");
    expect(grace.canUseApp).toBe(true);
    expect(expired.state).toBe("payment_required");
    expect(expired.canUseApp).toBe(false);
  });

  it("grants only ready, unexpired synthetic demos", async () => {
    const ready = await resolveOrganizationAccess(
      fakeCtx({
        _id: "org_1",
        accessMode: "demo",
        dataMode: "synthetic",
        demoSeedStatus: "ready",
        accessExpiresAt: NOW + 86_400_000,
      }),
      user,
      NOW
    );
    const expired = await resolveOrganizationAccess(
      fakeCtx({
        _id: "org_1",
        accessMode: "demo",
        dataMode: "synthetic",
        demoSeedStatus: "ready",
        accessExpiresAt: NOW - 1,
      }),
      user,
      NOW
    );

    expect(ready.state).toBe("active_demo");
    expect(ready.canUseApp).toBe(true);
    expect(ready.canManageBilling).toBe(false);
    expect(expired.state).toBe("demo_expired");
    expect(expired.canUseApp).toBe(false);
  });
});
