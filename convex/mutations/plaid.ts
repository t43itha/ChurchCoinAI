import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { Id } from "../_generated/dataModel";

// Account schema for validation
const accountSchema = v.object({
  accountId: v.string(),
  name: v.string(),
  mask: v.optional(v.string()),
  type: v.string(),
  subtype: v.optional(v.string()),
  fundId: v.optional(v.id("funds")),
});

// Status union for validation
const statusSchema = v.union(
  v.literal("active"),
  v.literal("error"),
  v.literal("consent_expired"),
  v.literal("pending_reauth")
);

// Create new Plaid item (called by action after token exchange)
export const createItem = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    itemId: v.string(),
    accessToken: v.string(),
    institutionId: v.string(),
    institutionName: v.string(),
    accounts: v.array(accountSchema),
    consentExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if item already exists
    const existing = await ctx.db
      .query("plaidItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", args.itemId))
      .first();

    if (existing) {
      // Update existing item
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        institutionId: args.institutionId,
        institutionName: args.institutionName,
        accounts: args.accounts,
        status: "active",
        errorCode: undefined,
        errorMessage: undefined,
        consentExpiresAt: args.consentExpiresAt,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("plaidItems", {
      organizationId: args.organizationId,
      itemId: args.itemId,
      accessToken: args.accessToken,
      institutionId: args.institutionId,
      institutionName: args.institutionName,
      accounts: args.accounts,
      status: "active",
      consentExpiresAt: args.consentExpiresAt,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update sync cursor after successful sync
export const updateSyncCursor = internalMutation({
  args: {
    itemId: v.string(),
    cursor: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", args.itemId))
      .first();

    if (item) {
      await ctx.db.patch(item._id, {
        lastSyncCursor: args.cursor,
        lastSyncAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

// Update item status (for webhook events)
export const updateItemStatus = internalMutation({
  args: {
    itemId: v.string(),
    status: statusSchema,
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", args.itemId))
      .first();

    if (item) {
      await ctx.db.patch(item._id, {
        status: args.status,
        errorCode: args.errorCode,
        errorMessage: args.errorMessage,
        updatedAt: Date.now(),
      });
    }
  },
});

// Delete item (internal, called by action)
export const deleteItem = internalMutation({
  args: {
    itemId: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", args.itemId))
      .first();

    if (item) {
      await ctx.db.delete(item._id);
    }
  },
});

// Get item for action (internal)
export const getItemForAction = internalMutation({
  args: {
    plaidItemId: v.id("plaidItems"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.plaidItemId);
  },
});

// User-facing: Update account to fund mapping
export const updateAccountFundMapping = mutation({
  args: {
    plaidItemId: v.id("plaidItems"),
    accountId: v.string(),
    fundId: v.optional(v.id("funds")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const item = await ctx.db.get(args.plaidItemId);
    if (!item) {
      throw new Error("Plaid connection not found");
    }

    // Verify user has access to this organization's items
    if (item.organizationId !== user.organizationId) {
      throw new Error("Access denied");
    }

    // Update the fund mapping for the specific account
    const updatedAccounts = item.accounts.map((account) => {
      if (account.accountId === args.accountId) {
        return { ...account, fundId: args.fundId };
      }
      return account;
    });

    await ctx.db.patch(args.plaidItemId, {
      accounts: updatedAccounts,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// User-facing: Remove bank connection
export const removeConnection = mutation({
  args: {
    plaidItemId: v.id("plaidItems"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin"]);

    const item = await ctx.db.get(args.plaidItemId);
    if (!item) {
      throw new Error("Plaid connection not found");
    }

    if (item.organizationId !== user.organizationId) {
      throw new Error("Access denied");
    }

    // Return item ID for the action to remove from Plaid
    return {
      itemId: item.itemId,
      accessToken: item.accessToken,
    };
  },
});
