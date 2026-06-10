import { query, internalQuery } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { getCurrentUser } from "../lib/auth";

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
  institutionName: connection.institutionName,
  institutionCountry: connection.institutionCountry,
  accounts: connection.accounts.map(publicAccount),
  status: connection.status,
  errorCode: connection.errorCode,
  errorMessage: connection.errorMessage,
  lastSyncAt: connection.lastSyncAt,
  lastSyncedThrough: connection.lastSyncedThrough,
  consentExpiresAt: connection.consentExpiresAt,
  createdAt: connection.createdAt,
  updatedAt: connection.updatedAt,
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const connections = await ctx.db
      .query("bankConnections")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    return connections.map(publicConnection);
  },
});

export const getActiveWithMappedAccounts = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const connections = await ctx.db
      .query("bankConnections")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId).eq("status", "active")
      )
      .collect();

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
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const connections = await ctx.db
      .query("bankConnections")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

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
          connection.consentExpiresAt &&
            connection.consentExpiresAt < sevenDaysFromNow
        );
      })
      .map((connection) => ({
        _id: connection._id,
        institutionName: connection.institutionName,
        status: connection.status,
        errorCode: connection.errorCode,
        errorMessage: connection.errorMessage,
        consentExpiresAt: connection.consentExpiresAt,
        daysUntilExpiry: connection.consentExpiresAt
          ? Math.ceil(
              (connection.consentExpiresAt - now) / (24 * 60 * 60 * 1000)
            )
          : null,
      }));
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
