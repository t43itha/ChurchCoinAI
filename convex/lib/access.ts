import { can } from "../../lib/permissions";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { getLaunchFeatures, type LaunchFeatures } from "./launchFeatures";

const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type OrganizationAccessState =
  | "early_access"
  | "active_subscription"
  | "trialing_subscription"
  | "active_trial"
  | "past_due_grace"
  | "active_demo"
  | "legacy_grant"
  | "payment_required"
  | "payment_processing"
  | "demo_provisioning"
  | "demo_expired"
  | "access_revoked";

type AccessCtx = QueryCtx | MutationCtx;

// A subscription Stripe is still billing or collecting. Any other status (canceled,
// incomplete_expired, unpaid, paused) has ended, so it no longer stands in for a trial.
const LIVE_SUBSCRIPTION_STATUSES: ReadonlySet<Doc<"subscriptions">["status"]> = new Set([
  "active",
  "trialing",
  "past_due",
  "incomplete",
]);

export function hasLiveSubscription(subscription: Pick<Doc<"subscriptions">, "status"> | null): boolean {
  return subscription !== null && LIVE_SUBSCRIPTION_STATUSES.has(subscription.status);
}

export async function resolveOrganizationAccess(
  ctx: AccessCtx,
  user: Doc<"users">,
  now = Date.now(),
  features: LaunchFeatures = getLaunchFeatures()
) {
  const organization = await ctx.db.get(user.organizationId);
  if (!organization) {
    return {
      state: "access_revoked" as const,
      canUseApp: false,
      canManageBilling: false,
      reason: "organization_missing",
      accessMode: "legacy" as const,
      dataMode: "live" as const,
      expiresAt: null,
      subscriptionStatus: null,
      plan: null,
    };
  }

  // Migration safety: all organizations created before this field existed
  // retain access until they are explicitly classified and backfilled.
  const accessMode = organization.accessMode ?? "legacy";
  const dataMode = organization.dataMode ?? "live";
  const canManageBilling = can(user.role, "billing.manage") && accessMode === "subscription";

  if (accessMode === "legacy") {
    return {
      state: "legacy_grant" as const,
      canUseApp: true,
      canManageBilling: can(user.role, "billing.manage"),
      reason: "legacy_migration_grant",
      accessMode,
      dataMode,
      expiresAt: organization.accessExpiresAt ?? null,
      subscriptionStatus: null,
      plan: null,
    };
  }

  if (accessMode === "demo") {
    if (organization.demoSeedStatus !== "ready") {
      return {
        state: "demo_provisioning" as const,
        canUseApp: false,
        canManageBilling: false,
        reason: organization.demoSeedStatus === "failed" ? "demo_seed_failed" : "demo_seed_pending",
        accessMode,
        dataMode,
        expiresAt: organization.accessExpiresAt ?? null,
        subscriptionStatus: null,
        plan: null,
      };
    }

    if (organization.accessExpiresAt && organization.accessExpiresAt <= now) {
      return {
        state: "demo_expired" as const,
        canUseApp: false,
        canManageBilling: false,
        reason: "demo_expired",
        accessMode,
        dataMode,
        expiresAt: organization.accessExpiresAt,
        subscriptionStatus: null,
        plan: null,
      };
    }

    return {
      state: "active_demo" as const,
      canUseApp: true,
      canManageBilling: false,
      reason: "demo_grant",
      accessMode,
      dataMode,
      expiresAt: organization.accessExpiresAt ?? null,
      subscriptionStatus: null,
      plan: null,
    };
  }

  const earlyAccess = (reason: string) => ({
    state: "early_access" as const,
    canUseApp: true,
    canManageBilling: false,
    reason,
    accessMode,
    dataMode,
    expiresAt: null,
    subscriptionStatus: null,
    plan: null,
  });

  if (!features.billing) {
    return earlyAccess("billing_disabled");
  }

  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_organization", (q) => q.eq("organizationId", user.organizationId))
    .first();

  if (subscription?.status === "active") {
    return {
      state: "active_subscription" as const,
      canUseApp: true,
      canManageBilling,
      reason: "subscription_active",
      accessMode,
      dataMode,
      expiresAt: subscription.currentPeriodEnd,
      subscriptionStatus: subscription.status,
      plan: subscription.plan,
    };
  }

  if (subscription?.status === "trialing") {
    return {
      state: "trialing_subscription" as const,
      canUseApp: true,
      canManageBilling,
      reason: "subscription_trialing",
      accessMode,
      dataMode,
      expiresAt: subscription.currentPeriodEnd,
      subscriptionStatus: subscription.status,
      plan: subscription.plan,
    };
  }

  if (subscription?.status === "past_due") {
    const graceEndsAt = (subscription.pastDueSince ?? subscription.updatedAt) + PAST_DUE_GRACE_MS;
    if (graceEndsAt > now) {
      return {
        state: "past_due_grace" as const,
        canUseApp: true,
        canManageBilling,
        reason: "payment_retry_grace",
        accessMode,
        dataMode,
        expiresAt: graceEndsAt,
        subscriptionStatus: subscription.status,
        plan: subscription.plan,
      };
    }
  }

  // A ChurchCoin product trial is independent of Stripe. Valid paid access
  // wins, while an incomplete Checkout cannot cut short the remaining trial.
  if (
    organization.trialStatus === "active" &&
    organization.trialStartedAt !== undefined &&
    organization.trialEndsAt !== undefined &&
    organization.trialEndsAt > now
  ) {
    return {
      state: "active_trial" as const,
      canUseApp: true,
      canManageBilling,
      reason: "product_trial_active",
      accessMode,
      dataMode,
      expiresAt: organization.trialEndsAt,
      subscriptionStatus: subscription?.status ?? null,
      plan: organization.trialPlan ?? null,
    };
  }

  // A church in early access has no trial until startTrialsAfterEarlyAccess runs;
  // keep it open between the flag flip and that run. A subscription that ended
  // before then does not count, but one that ends afterwards does.
  if (
    organization.trialStatus === undefined &&
    organization.billingStartedAt === undefined &&
    !hasLiveSubscription(subscription)
  ) {
    return earlyAccess("trial_not_started");
  }

  if (!subscription) {
    return {
      state: "payment_required" as const,
      canUseApp: false,
      canManageBilling,
      reason:
        organization.trialStatus === "active" || organization.trialStatus === "expired"
          ? "product_trial_expired"
          : "subscription_missing",
      accessMode,
      dataMode,
      expiresAt: organization.trialEndsAt ?? null,
      subscriptionStatus: null,
      plan: organization.trialPlan ?? null,
    };
  }

  const processing = subscription.status === "incomplete";
  return {
    state: processing ? ("payment_processing" as const) : ("payment_required" as const),
    canUseApp: false,
    canManageBilling,
    reason: `subscription_${subscription.status}`,
    accessMode,
    dataMode,
    expiresAt: null,
    subscriptionStatus: subscription.status,
    plan: subscription.plan,
  };
}
export async function requireOrganizationAccess(
  ctx: AccessCtx,
  user: Doc<"users">
) {
  const access = await resolveOrganizationAccess(ctx, user);
  if (!access.canUseApp) {
    throw new Error(`Access required: ${access.state}`);
  }
  return access;
}
