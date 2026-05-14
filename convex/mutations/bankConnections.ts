import { internalMutation, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

const providerSchema = v.literal("enable_banking");

const statusSchema = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("error"),
  v.literal("consent_expired"),
  v.literal("pending_reauth")
);

const accountSchema = v.object({
  accountId: v.string(),
  providerAccountHash: v.optional(v.string()),
  providerAccountHashes: v.optional(v.array(v.string())),
  name: v.string(),
  mask: v.optional(v.string()),
  type: v.optional(v.string()),
  currency: v.optional(v.string()),
  fundId: v.optional(v.id("funds")),
});

type AccountHashFields = {
  providerAccountHash?: string;
  providerAccountHashes?: string[];
};

const getAccountHashes = (account: AccountHashFields) =>
  [account.providerAccountHash, ...(account.providerAccountHashes || [])].filter(
    (hash): hash is string => Boolean(hash)
  );

const accountsShareHash = (
  firstAccount: AccountHashFields,
  secondAccount: AccountHashFields
) => {
  const firstHashes = new Set(getAccountHashes(firstAccount));
  return getAccountHashes(secondAccount).some((hash) => firstHashes.has(hash));
};

export const createPending = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    provider: providerSchema,
    state: v.string(),
    aspspCountry: v.string(),
    aspspName: v.string(),
    existingConnectionId: v.optional(v.id("bankConnections")),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("pendingBankConnections", {
      ...args,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markPendingError = internalMutation({
  args: {
    state: v.string(),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("pendingBankConnections")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    if (!pending) return null;

    await ctx.db.patch(pending._id, {
      status: "error",
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });

    return pending._id;
  },
});

export const completePending = internalMutation({
  args: {
    state: v.string(),
    providerConnectionId: v.string(),
    accounts: v.array(accountSchema),
    consentExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("pendingBankConnections")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    if (!pending || pending.status !== "pending") {
      throw new Error("Pending bank connection not found");
    }

    const now = Date.now();
    let connectionId = pending.existingConnectionId;

    if (!connectionId) {
      const incomingHashes = new Set(args.accounts.flatMap(getAccountHashes));

      if (incomingHashes.size > 0) {
        const existingConnections = await ctx.db
          .query("bankConnections")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", pending.organizationId)
          )
          .collect();

        const match = existingConnections.find((connection) =>
          connection.accounts.some((account) =>
            getAccountHashes(account).some((hash) => incomingHashes.has(hash))
          )
        );
        connectionId = match?._id;
      }
    }

    if (connectionId) {
      const existing = await ctx.db.get(connectionId);
      if (!existing || existing.organizationId !== pending.organizationId) {
        throw new Error("Existing bank connection not found");
      }

      await ctx.db.patch(connectionId, {
        providerConnectionId: args.providerConnectionId,
        institutionName: pending.aspspName,
        institutionCountry: pending.aspspCountry,
        accounts: args.accounts.map((account) => {
          const previous = existing.accounts.find(
            (existingAccount) =>
              existingAccount.accountId === account.accountId ||
              accountsShareHash(existingAccount, account)
          );
          return {
            ...account,
            fundId: previous?.fundId,
          };
        }),
        status: "active",
        errorCode: undefined,
        errorMessage: undefined,
        consentExpiresAt: args.consentExpiresAt,
        updatedAt: now,
      });
    } else {
      connectionId = await ctx.db.insert("bankConnections", {
        organizationId: pending.organizationId,
        provider: pending.provider,
        providerConnectionId: args.providerConnectionId,
        institutionName: pending.aspspName,
        institutionCountry: pending.aspspCountry,
        accounts: args.accounts,
        status: "active",
        consentExpiresAt: args.consentExpiresAt,
        createdBy: pending.createdBy,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(pending._id, {
      status: "completed",
      updatedAt: now,
    });

    return connectionId;
  },
});

export const updateStatus = internalMutation({
  args: {
    bankConnectionId: v.id("bankConnections"),
    status: statusSchema,
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.bankConnectionId, {
      status: args.status,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });
  },
});

export const updateSyncState = internalMutation({
  args: {
    bankConnectionId: v.id("bankConnections"),
    lastSyncedThrough: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.bankConnectionId, {
      lastSyncAt: Date.now(),
      lastSyncedThrough: args.lastSyncedThrough,
      updatedAt: Date.now(),
    });
  },
});

export const deleteConnectionInternal = internalMutation({
  args: {
    bankConnectionId: v.id("bankConnections"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.bankConnectionId);
  },
});

export const updateAccountFundMapping = mutation({
  args: {
    bankConnectionId: v.id("bankConnections"),
    accountId: v.string(),
    fundId: v.optional(v.id("funds")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const connection = await ctx.db.get(args.bankConnectionId);

    if (!connection || connection.organizationId !== user.organizationId) {
      throw new Error("Bank connection not found");
    }

    if (args.fundId) {
      const fund = await ctx.db.get(args.fundId);
      if (!fund || fund.organizationId !== user.organizationId) {
        throw new Error("Invalid fund");
      }
    }

    await ctx.db.patch(args.bankConnectionId, {
      accounts: connection.accounts.map((account) =>
        account.accountId === args.accountId
          ? { ...account, fundId: args.fundId }
          : account
      ),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
