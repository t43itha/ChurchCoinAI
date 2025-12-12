import { query } from "../_generated/server";
import { getCurrentUser } from "../lib/auth";
import { v } from "convex/values";

// List all connected banks for the organization (excludes accessToken for security)
export const listItems = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const items = await ctx.db
      .query("plaidItems")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Return items without accessToken for security
    return items.map((item) => ({
      _id: item._id,
      _creationTime: item._creationTime,
      organizationId: item.organizationId,
      itemId: item.itemId,
      institutionId: item.institutionId,
      institutionName: item.institutionName,
      accounts: item.accounts,
      status: item.status,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      lastSyncAt: item.lastSyncAt,
      consentExpiresAt: item.consentExpiresAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  },
});

// Get single item by ID (excludes accessToken)
export const getItem = query({
  args: {
    plaidItemId: v.id("plaidItems"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const item = await ctx.db.get(args.plaidItemId);
    if (!item || item.organizationId !== user.organizationId) {
      return null;
    }

    // Return without accessToken
    return {
      _id: item._id,
      _creationTime: item._creationTime,
      organizationId: item.organizationId,
      itemId: item.itemId,
      institutionId: item.institutionId,
      institutionName: item.institutionName,
      accounts: item.accounts,
      status: item.status,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      lastSyncAt: item.lastSyncAt,
      consentExpiresAt: item.consentExpiresAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  },
});

// Get items needing attention (errors, expiring consent)
export const getItemsNeedingAttention = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const items = await ctx.db
      .query("plaidItems")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const now = Date.now();
    const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;

    // Filter items that need attention
    return items
      .filter((item) => {
        // Error states
        if (
          item.status === "error" ||
          item.status === "consent_expired" ||
          item.status === "pending_reauth"
        ) {
          return true;
        }

        // Consent expiring within 7 days
        if (item.consentExpiresAt && item.consentExpiresAt < sevenDaysFromNow) {
          return true;
        }

        return false;
      })
      .map((item) => ({
        _id: item._id,
        institutionName: item.institutionName,
        status: item.status,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
        consentExpiresAt: item.consentExpiresAt,
        daysUntilExpiry: item.consentExpiresAt
          ? Math.ceil((item.consentExpiresAt - now) / (24 * 60 * 60 * 1000))
          : null,
      }));
  },
});

// Check if organization has any bank connections
export const hasConnections = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return false;

    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .first();

    return item !== null;
  },
});

// Get active items with mapped accounts (for sync)
export const getActiveItemsWithMappedAccounts = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const items = await ctx.db
      .query("plaidItems")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId).eq("status", "active")
      )
      .collect();

    // Return items with at least one mapped account
    return items
      .filter((item) => item.accounts.some((acc) => acc.fundId))
      .map((item) => ({
        _id: item._id,
        institutionName: item.institutionName,
        accounts: item.accounts.filter((acc) => acc.fundId),
        lastSyncAt: item.lastSyncAt,
      }));
  },
});
