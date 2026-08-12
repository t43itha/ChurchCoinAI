import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type OrganizationAccessState =
  | "active_subscription"
  | "trialing_subscription"
  | "past_due_grace"
  | "active_demo"
  | "legacy_grant"
  | "payment_required"
  | "payment_processing"
  | "demo_provisioning"
  | "demo_expired"
  | "access_revoked";

type AccessCtx = QueryCtx | MutationCtx;

export async function resolveOrganizationAccess(
  ctx: AccessCtx,
  user: Doc<"users">,
  now = Date.now()
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
  const canManageBilling = user.role === "Admin" && accessMode === "subscription";

  if (accessMode === "legacy") {
    return {
      state: "legacy_grant" as const,
      canUseApp: true,
      canManageBilling: user.role === "Admin",
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

  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_organization", (q) => q.eq("organizationId", user.organizationId))
    .first();

  if (!subscription) {
    return {
      state: "payment_required" as const,
      canUseApp: false,
      canManageBilling,
      reason: "subscription_missing",
      accessMode,
      dataMode,
      expiresAt: null,
      subscriptionStatus: null,
      plan: null,
    };
  }

  if (subscription.status === "active") {
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

  if (subscription.status === "trialing") {
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

  if (subscription.status === "past_due") {
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
