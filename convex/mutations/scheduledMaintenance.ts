import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

const MAINTENANCE_BATCH_SIZE = 500;
const CONSENT_STATUS_BATCH_SIZE = Math.floor(MAINTENANCE_BATCH_SIZE / 2);
const CONTINUATION_DELAY_MS = 1_000;

// Mark pending invitations whose expiry has passed as expired so the UI
// and acceptance flow no longer treat them as usable.
export const expirePendingInvitations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("invitations")
      .withIndex("by_status_expiresAt", (q) =>
        q.eq("status", "pending").lt("expiresAt", now)
      )
      .take(MAINTENANCE_BATCH_SIZE);

    let expired = 0;
    for (const invitation of pending) {
      await ctx.db.patch(invitation._id, { status: "expired" });
      expired++;
    }

    if (pending.length === MAINTENANCE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        CONTINUATION_DELAY_MS,
        internal.mutations.scheduledMaintenance.expirePendingInvitations,
        {}
      );
    }

    return {
      expired,
      continuationScheduled: pending.length === MAINTENANCE_BATCH_SIZE,
    };
  },
});

// Flag bank connections whose Open Banking consent window has lapsed so
// users see a reconnect prompt instead of silent sync failures.
export const expireBankConsents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const activeConnections = await ctx.db
      .query("bankConnections")
      .withIndex("by_status_consentExpiresAt", (q) =>
        q
          .eq("status", "active")
          .gt("consentExpiresAt", 0)
          .lt("consentExpiresAt", now)
      )
      .take(CONSENT_STATUS_BATCH_SIZE);
    const pendingReauthConnections = await ctx.db
      .query("bankConnections")
      .withIndex("by_status_consentExpiresAt", (q) =>
        q
          .eq("status", "pending_reauth")
          .gt("consentExpiresAt", 0)
          .lt("consentExpiresAt", now)
      )
      .take(CONSENT_STATUS_BATCH_SIZE);
    const connections = [...activeConnections, ...pendingReauthConnections];

    let expired = 0;
    for (const connection of connections) {
      await ctx.db.patch(connection._id, {
        status: "consent_expired",
        errorCode: "CONSENT_EXPIRED",
        errorMessage:
          "Bank consent has expired. Reconnect the account to resume syncing.",
        updatedAt: now,
      });
      expired++;
    }

    const continuationScheduled =
      activeConnections.length === CONSENT_STATUS_BATCH_SIZE ||
      pendingReauthConnections.length === CONSENT_STATUS_BATCH_SIZE;
    if (continuationScheduled) {
      await ctx.scheduler.runAfter(
        CONTINUATION_DELAY_MS,
        internal.mutations.scheduledMaintenance.expireBankConsents,
        {}
      );
    }

    return { expired, continuationScheduled };
  },
});

// Remove stale pending bank-connection states that were never completed;
// their one-time state tokens are useless after expiry.
export const cleanupExpiredPendingBankConnections = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("pendingBankConnections")
      .withIndex("by_status_expiresAt", (q) =>
        q.eq("status", "pending").lt("expiresAt", now)
      )
      .take(MAINTENANCE_BATCH_SIZE);

    let removed = 0;
    for (const record of pending) {
      await ctx.db.delete(record._id);
      removed++;
    }

    if (pending.length === MAINTENANCE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        CONTINUATION_DELAY_MS,
        internal.mutations.scheduledMaintenance
          .cleanupExpiredPendingBankConnections,
        {}
      );
    }

    return {
      removed,
      continuationScheduled: pending.length === MAINTENANCE_BATCH_SIZE,
    };
  },
});
