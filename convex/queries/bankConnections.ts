import { query, internalQuery } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { requireAuth } from "../lib/auth";

const publicAccount = (
  account: Doc<"bankConnections">["accounts"][number]
) => ({
  accountId: account.accountId,
  name: account.name,
  mask: account.mask,
  type: account.type,
  currency: account.currency,
  fundId: account.fundId,
});

const publicConnection = (connection: Doc<"bankConnections">) => ({
  _id: connection._id,
  _creationTime: connection._creationTime,
  organizationId: connection.organizationId,
  provider: connection.provider,
  providerInstitutionId: connection.providerInstitutionId,
  institutionName: connection.institutionName,
  institutionCountry: connection.institutionCountry,
  accounts: connection.accounts.map(publicAccount),
  status: connection.status,
  errorCode: connection.errorCode,
  errorMessage: connection.errorMessage,
  lastSyncAt: connection.lastSyncAt,
  lastSyncedThrough: connection.lastSyncedThrough,
  consentExpiresAt: connection.consentExpiresAt,
  consentReconfirmBy: connection.consentReconfirmBy,
  createdAt: connection.createdAt,
  updatedAt: connection.updatedAt,
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const connections = await ctx.db
      .query("bankConnections")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .take(100);

    return connections.map(publicConnection);
  },
});

export const getActiveWithMappedAccounts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const connections = await ctx.db
      .query("bankConnections")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId).eq("status", "active")
      )
      .take(100);

    return connections
      .filter((connection) =>
        connection.accounts.some((account) => account.fundId)
      )
      .map((connection) => ({
        _id: connection._id,
        provider: connection.provider,
        institutionName: connection.institutionName,
        accounts: connection.accounts
          .filter((account) => account.fundId)
          .map(publicAccount),
        lastSyncAt: connection.lastSyncAt,
        lastSyncedThrough: connection.lastSyncedThrough,
      }));
  },
});

export const getItemsNeedingAttention = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const connections = await ctx.db
      .query("bankConnections")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .take(100);

    const now = Date.now();
    const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;

    return connections
      .filter((connection) => {
        if (
          connection.status === "error" ||
          connection.status === "consent_expired" ||
          connection.status === "pending_reauth"
        ) {
          return true;
        }

        return Boolean(
          (connection.consentExpiresAt &&
            connection.consentExpiresAt < sevenDaysFromNow) ||
            (connection.consentReconfirmBy &&
              connection.consentReconfirmBy < sevenDaysFromNow)
        );
      })
      .map((connection) => ({
        _id: connection._id,
        institutionName: connection.institutionName,
        status: connection.status,
        errorCode: connection.errorCode,
        errorMessage: connection.errorMessage,
        consentExpiresAt: connection.consentExpiresAt,
        consentReconfirmBy: connection.consentReconfirmBy,
        daysUntilExpiry: connection.consentExpiresAt
          ? Math.ceil(
              (connection.consentExpiresAt - now) / (24 * 60 * 60 * 1000)
            )
          : null,
        daysUntilReconfirmation: connection.consentReconfirmBy
          ? Math.ceil(
              (connection.consentReconfirmBy - now) / (24 * 60 * 60 * 1000)
            )
          : null,
      }));
  },
});

export const getAttempt = query({
  args: { state: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("pendingBankConnections"),
      provider: v.union(v.literal("enable_banking"), v.literal("yapily")),
      institutionName: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("error")
      ),
      errorCode: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const attempt = await ctx.db
      .query("pendingBankConnections")
      .withIndex("by_organization_and_state", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .eq("state", args.state)
      )
      .unique();

    if (!attempt) return null;
    return {
      _id: attempt._id,
      provider: attempt.provider,
      institutionName: attempt.aspspName,
      status: attempt.status,
      errorCode: attempt.errorCode,
      errorMessage: attempt.errorMessage,
      updatedAt: attempt.updatedAt,
    };
  },
});

export const getForAction = internalQuery({
  args: {
    bankConnectionId: v.id("bankConnections"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.bankConnectionId);
  },
});

export const getPendingForAction = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    state: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("pendingBankConnections"),
      _creationTime: v.number(),
      organizationId: v.id("organizations"),
      createdBy: v.id("users"),
      provider: v.union(v.literal("enable_banking"), v.literal("yapily")),
      state: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("error")
      ),
      aspspCountry: v.string(),
      aspspName: v.string(),
      providerInstitutionId: v.optional(v.string()),
      existingConnectionId: v.optional(v.id("bankConnections")),
      errorCode: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
      expiresAt: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, args) =>
    await ctx.db
      .query("pendingBankConnections")
      .withIndex("by_organization_and_state", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("state", args.state)
      )
      .unique(),
});
