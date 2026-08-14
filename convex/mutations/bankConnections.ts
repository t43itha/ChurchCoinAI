import { internalMutation, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { isPendingStateExpired } from "../lib/bankConnectionUtils";
import { assertValidTransactionDate } from "../lib/transactionValidation";

const providerSchema = v.union(
  v.literal("enable_banking"),
  v.literal("yapily")
);

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
  [account.providerAccountHash, ...(account.providerAccountHashes || [])]
    .map((hash) => hash?.trim())
    .filter((hash): hash is string => Boolean(hash));

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
    providerInstitutionId: v.optional(v.string()),
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

// Atomically claim a pending state token so it is strictly single-use: the
// first callback flips it to "processing"; any replayed or raced callback
// finds it already claimed and is rejected before the code exchange runs.
export const claimPendingState = internalMutation({
  args: {
    state: v.string(),
    provider: providerSchema,
  },
  returns: v.union(
    v.object({ claimed: v.literal(false) }),
    v.object({
      claimed: v.literal(true),
      organizationId: v.id("organizations"),
    })
  ),
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("pendingBankConnections")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    if (
      !pending ||
      pending.provider !== args.provider ||
      pending.status !== "pending"
    ) {
      return { claimed: false as const };
    }

    const now = Date.now();

    if (isPendingStateExpired({ expiresAt: pending.expiresAt, now })) {
      await ctx.db.patch(pending._id, {
        status: "error",
        errorCode: "STATE_EXPIRED",
        errorMessage: "Bank authorization session expired",
        updatedAt: now,
      });
      return { claimed: false as const };
    }

    await ctx.db.patch(pending._id, {
      status: "processing",
      updatedAt: now,
    });

    return {
      claimed: true as const,
      organizationId: pending.organizationId,
    };
  },
});

export const markPendingError = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    state: v.string(),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  returns: v.union(v.null(), v.id("pendingBankConnections")),
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("pendingBankConnections")
      .withIndex("by_organization_and_state", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("state", args.state)
      )
      .unique();

    if (!pending) return null;

    if (pending.status !== "pending" && pending.status !== "processing") {
      return pending._id;
    }

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
    organizationId: v.id("organizations"),
    state: v.string(),
    providerConnectionId: v.string(),
    providerAccessToken: v.optional(v.string()),
    accounts: v.array(accountSchema),
    consentExpiresAt: v.optional(v.number()),
    consentReconfirmBy: v.optional(v.number()),
  },
  returns: v.id("bankConnections"),
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("pendingBankConnections")
      .withIndex("by_organization_and_state", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("state", args.state)
      )
      .unique();

    if (
      !pending ||
      (pending.status !== "pending" && pending.status !== "processing")
    ) {
      throw new Error("Pending bank connection not found");
    }

    const now = Date.now();

    if (isPendingStateExpired({ expiresAt: pending.expiresAt, now })) {
      await ctx.db.patch(pending._id, {
        status: "error",
        errorCode: "STATE_EXPIRED",
        errorMessage: "Bank authorization session expired",
        updatedAt: now,
      });
      throw new Error("Pending bank connection expired");
    }

    let connectionId = pending.existingConnectionId;

    if (!connectionId) {
      const incomingHashes = new Set(args.accounts.flatMap(getAccountHashes));

      if (incomingHashes.size > 0) {
        const existingConnections = await ctx.db
          .query("bankConnections")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", pending.organizationId)
          )
          .take(100);

        const matches = existingConnections.filter((connection) =>
          connection.accounts.some((account) =>
            getAccountHashes(account).some((hash) => incomingHashes.has(hash))
          )
        );

        if (matches.length > 1) {
          throw new Error("Multiple matching bank connections found");
        }

        connectionId = matches[0]?._id;
      }
    }

    if (connectionId) {
      const existing = await ctx.db.get(connectionId);
      if (!existing || existing.organizationId !== pending.organizationId) {
        throw new Error("Existing bank connection not found");
      }
      if (existing.provider !== pending.provider) {
        throw new Error("Bank connection provider does not match re-authorization");
      }

      const fundValidityCache = new Map<string, boolean>();
      const getValidFundId = async (
        fundId: (typeof existing.accounts)[number]["fundId"]
      ) => {
        if (!fundId) return undefined;

        const cachedValidity = fundValidityCache.get(fundId);
        if (cachedValidity !== undefined) {
          return cachedValidity ? fundId : undefined;
        }

        const fund = await ctx.db.get(fundId);
        const isValid = Boolean(
          fund && fund.organizationId === pending.organizationId
        );
        fundValidityCache.set(fundId, isValid);

        return isValid ? fundId : undefined;
      };

      const updatedAccounts = await Promise.all(
        args.accounts.map(async (account) => {
          const previous = existing.accounts.find(
            (existingAccount) =>
              existingAccount.accountId === account.accountId ||
              accountsShareHash(existingAccount, account)
          );

          return {
            ...account,
            fundId: await getValidFundId(previous?.fundId),
          };
        })
      );

      await ctx.db.patch(connectionId, {
        providerConnectionId: args.providerConnectionId,
        providerAccessToken: args.providerAccessToken,
        providerInstitutionId: pending.providerInstitutionId,
        institutionName: pending.aspspName,
        institutionCountry: pending.aspspCountry,
        accounts: updatedAccounts,
        status: "active",
        errorCode: undefined,
        errorMessage: undefined,
        consentExpiresAt: args.consentExpiresAt,
        consentReconfirmBy: args.consentReconfirmBy,
        updatedAt: now,
      });
    } else {
      connectionId = await ctx.db.insert("bankConnections", {
        organizationId: pending.organizationId,
        provider: pending.provider,
        providerConnectionId: args.providerConnectionId,
        providerAccessToken: args.providerAccessToken,
        providerInstitutionId: pending.providerInstitutionId,
        institutionName: pending.aspspName,
        institutionCountry: pending.aspspCountry,
        accounts: args.accounts,
        status: "active",
        consentExpiresAt: args.consentExpiresAt,
        consentReconfirmBy: args.consentReconfirmBy,
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

    if (
      !connection.accounts.some((account) => account.accountId === args.accountId)
    ) {
      throw new Error("Bank account not found");
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

export const acknowledgeSyncThrough = mutation({
  args: {
    bankConnectionId: v.id("bankConnections"),
    lastSyncedThrough: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    assertValidTransactionDate(args.lastSyncedThrough);

    const connection = await ctx.db.get(args.bankConnectionId);
    if (!connection || connection.organizationId !== user.organizationId) {
      throw new Error("Bank connection not found");
    }

    if (connection.status !== "active") {
      throw new Error(`Bank connection is ${connection.status}. Please re-authenticate.`);
    }

    const lastSyncedThrough =
      connection.lastSyncedThrough &&
      connection.lastSyncedThrough > args.lastSyncedThrough
        ? connection.lastSyncedThrough
        : args.lastSyncedThrough;

    await ctx.db.patch(args.bankConnectionId, {
      lastSyncAt: Date.now(),
      lastSyncedThrough,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
