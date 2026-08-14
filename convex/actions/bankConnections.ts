"use node";

import { action, internalAction, type ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import {
  closeSession,
  EnableBankingApiError,
  getAccountTransactions,
  getAvailableInstitutions,
  getConsentValidUntil,
  getEnableBankingDefaults,
  isEnableBankingExpiredSessionError,
  startAuthorization,
} from "../lib/enableBanking";
import {
  calculateDefaultSyncRange,
  normalizeEnableBankingTransaction,
  normalizeYapilyAccount,
  normalizeYapilyTransaction,
  type EnableBankingTransactionLike,
} from "../lib/bankConnectionUtils";
import {
  deleteYapilyConsent,
  exchangeYapilyOneTimeToken,
  getYapilyAccounts,
  getYapilyAccountTransactions,
  getYapilyCallbackUrl,
  getYapilyInstitutions,
  isYapilyAuthorizationError,
  startYapilyAccountAuthorization,
  YapilyApiError,
  type YapilyTransactionLike,
} from "../lib/yapily";

const requireUser = async (ctx: ActionCtx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: please sign in");
  }

  const { api } = await import("../_generated/api");
  const currentUser = await ctx.runQuery(api.queries.users.current, {});
  if (!currentUser) {
    throw new Error("Forbidden: complete onboarding first");
  }

  const access = await ctx.runQuery(api.queries.subscriptions.access, {});
  if (!access?.canUseApp) {
    throw new Error("Organization access is not active");
  }
  if (access.dataMode === "synthetic") {
    throw new Error("Live bank connections are disabled for demo organizations");
  }

  return currentUser;
};

const requireFinanceRole = (
  user: { role: "Admin" | "Finance Team" | "Pastorate" | "Guest" }
) => {
  if (user.role !== "Admin" && user.role !== "Finance Team") {
    throw new Error("Forbidden: this action requires Admin or Finance Team role");
  }
};

const randomState = () => crypto.randomUUID();

const todayIso = () => new Date().toISOString().slice(0, 10);

const MAX_TRANSACTION_PAGES_PER_ACCOUNT = 20;
const MAX_SYNC_TRANSACTIONS = 500;

const institutionSchema = v.object({
  provider: v.union(v.literal("enable_banking"), v.literal("yapily")),
  institutionId: v.string(),
  name: v.string(),
  country: v.string(),
  logoUrl: v.union(v.string(), v.null()),
  maximumConsentValiditySeconds: v.union(v.number(), v.null()),
  beta: v.boolean(),
  environmentType: v.union(v.string(), v.null()),
});

const syncCursorSchema = v.object({
  dateFrom: v.string(),
  dateTo: v.string(),
  accountIndex: v.number(),
  continuationKey: v.optional(v.string()),
});

const syncedTransactionSchema = v.object({
  date: v.string(),
  description: v.string(),
  amount: v.number(),
  type: v.union(v.literal("Income"), v.literal("Expenditure")),
  accountId: v.string(),
  accountName: v.string(),
  fundId: v.union(v.id("funds"), v.null()),
  providerTransactionId: v.string(),
});

type SyncTransactionsCursor = {
  dateFrom: string;
  dateTo: string;
  accountIndex: number;
  continuationKey?: string;
};

type SyncedBankTransaction = {
  date: string;
  description: string;
  amount: number;
  type: "Income" | "Expenditure";
  accountId: string;
  accountName: string;
  fundId: Id<"funds"> | null;
  providerTransactionId: string;
};

const assertValidAuthorizationUrl = (url: unknown) => {
  if (typeof url !== "string") {
    throw new Error("Enable Banking returned an invalid authorization URL");
  }

  const trimmedUrl = url.trim();

  try {
    const parsed = new URL(trimmedUrl);
    if (parsed.protocol !== "https:") throw new Error();
    return trimmedUrl;
  } catch {
    throw new Error("Enable Banking returned an invalid authorization URL");
  }
};

const isValidIsoDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
};

const createSyncCursor = ({
  dateFrom,
  dateTo,
  accountIndex,
  continuationKey,
}: SyncTransactionsCursor): SyncTransactionsCursor =>
  continuationKey == null
    ? { dateFrom, dateTo, accountIndex }
    : { dateFrom, dateTo, accountIndex, continuationKey };

const validateSyncCursor = (
  cursor: SyncTransactionsCursor | undefined,
  mappedAccountCount: number
) => {
  if (!cursor) return undefined;

  if (!isValidIsoDate(cursor.dateFrom) || !isValidIsoDate(cursor.dateTo)) {
    throw new Error("Invalid sync cursor: expected YYYY-MM-DD date strings");
  }

  if (cursor.dateFrom > cursor.dateTo) {
    throw new Error("Invalid sync cursor: dateFrom must be on or before dateTo");
  }

  if (
    !Number.isInteger(cursor.accountIndex) ||
    cursor.accountIndex < 0 ||
    cursor.accountIndex >= mappedAccountCount
  ) {
    throw new Error("Invalid sync cursor: accountIndex is out of range");
  }

  return cursor;
};

export const listInstitutions = action({
  args: {
    provider: v.union(v.literal("enable_banking"), v.literal("yapily")),
  },
  returns: v.array(institutionSchema),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireFinanceRole(user);

    if (args.provider === "yapily") {
      const institutions = await getYapilyInstitutions();
      return institutions.map((institution) => ({
        provider: "yapily" as const,
        ...institution,
        maximumConsentValiditySeconds: null,
        beta: institution.environmentType === "SANDBOX",
      }));
    }

    const { aspspCountry } = getEnableBankingDefaults();
    const institutions = await getAvailableInstitutions(aspspCountry);
    return institutions.map((institution) => ({
      provider: "enable_banking" as const,
      institutionId: institution.name,
      ...institution,
      environmentType: null,
    }));
  },
});

export const startConnection = action({
  args: {
    provider: v.union(v.literal("enable_banking"), v.literal("yapily")),
    institutionId: v.string(),
    institutionName: v.string(),
    institutionCountry: v.string(),
    existingConnectionId: v.optional(v.id("bankConnections")),
  },
  returns: v.object({ authorizationUrl: v.string() }),
  handler: async (ctx, args): Promise<{ authorizationUrl: string }> => {
    const user = await requireUser(ctx);
    requireFinanceRole(user);

    const { internal } = await import("../_generated/api");
    const aspspCountry = args.institutionCountry.trim().toUpperCase();
    const aspspName = args.institutionName.trim();
    const institutionId = args.institutionId.trim();

    if (!institutionId || !aspspName || aspspCountry !== "GB") {
      throw new Error("This bank is not available for UK Open Banking");
    }

    let maximumConsentValiditySeconds: number | undefined;
    const isAvailable =
      args.provider === "yapily"
        ? (await getYapilyInstitutions()).some(
            (candidate) =>
              candidate.country === aspspCountry &&
              candidate.name === aspspName &&
              candidate.institutionId === institutionId
          )
        : (await getAvailableInstitutions(aspspCountry)).some((candidate) => {
            const matches =
              candidate.country === aspspCountry && candidate.name === aspspName;
            if (matches) {
              maximumConsentValiditySeconds =
                candidate.maximumConsentValiditySeconds;
            }
            return matches;
          });
    if (!isAvailable) {
      throw new Error(
        "This bank is no longer available. Refresh the bank list and try again."
      );
    }
    if (
      args.provider === "enable_banking" &&
      maximumConsentValiditySeconds == null
    ) {
      throw new Error("Enable Banking institution has no consent validity");
    }

    const state = randomState();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const existingConnectionId = args.existingConnectionId;

    if (existingConnectionId) {
      const existingConnection = await ctx.runQuery(
        internal.queries.bankConnections.getForAction,
        { bankConnectionId: existingConnectionId }
      );

      if (
        !existingConnection ||
        existingConnection.organizationId !== user.organizationId
      ) {
        throw new Error("Bank connection not found");
      }

      if (
        existingConnection.provider !== args.provider ||
        existingConnection.institutionCountry.toUpperCase() !== aspspCountry ||
        existingConnection.institutionName !== aspspName ||
        (args.provider === "yapily" &&
          existingConnection.providerInstitutionId !== institutionId)
      ) {
        throw new Error(
          "Re-authorization must use the bank already linked to this connection"
        );
      }
    }

    await ctx.runMutation(internal.mutations.bankConnections.createPending, {
      organizationId: user.organizationId,
      createdBy: user._id,
      provider: args.provider,
      state,
      aspspCountry,
      aspspName,
      providerInstitutionId: institutionId,
      existingConnectionId,
      expiresAt,
    });

    try {
      const response =
        args.provider === "yapily"
          ? await startYapilyAccountAuthorization({
              applicationUserId: `churchcoin-${user.organizationId}`,
              institutionId,
              callback: getYapilyCallbackUrl(state),
            })
          : await startAuthorization({
              state,
              aspspCountry,
              aspspName,
              redirectUrl: getEnableBankingDefaults().redirectUrl,
              validUntil: getConsentValidUntil(
                maximumConsentValiditySeconds!
              ),
            });

      const authorizationUrl =
        "authorizationUrl" in response ? response.authorizationUrl : response.url;
      return { authorizationUrl: assertValidAuthorizationUrl(authorizationUrl) };
    } catch (error: any) {
      try {
        await ctx.runMutation(internal.mutations.bankConnections.markPendingError, {
          organizationId: user.organizationId,
          state,
          errorCode: "AUTHORIZATION_START_FAILED",
          errorMessage:
            error?.message || "Failed to start bank authorization session",
        });
      } catch {
        // Preserve the original provider or validation error for the caller.
      }

      throw error;
    }
  },
});

const optionalFutureTimestamp = (value: string | undefined) => {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now()
    ? timestamp
    : undefined;
};

export const completeYapilyConnection = internalAction({
  args: {
    organizationId: v.id("organizations"),
    state: v.string(),
    oneTimeToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { internal } = await import("../_generated/api");
    let newConsentId: string | undefined;
    let previousConsentId: string | undefined;
    let completed = false;

    try {
      const pending = await ctx.runQuery(
        internal.queries.bankConnections.getPendingForAction,
        {
          organizationId: args.organizationId,
          state: args.state,
        }
      );
      if (!pending || pending.provider !== "yapily") {
        throw new Error("Pending Yapily connection not found");
      }

      const consent = await exchangeYapilyOneTimeToken(args.oneTimeToken);
      newConsentId = consent.id;
      if (consent.status !== "AUTHORIZED") {
        throw new Error(`Yapily consent is ${consent.status.toLowerCase()}`);
      }
      if (
        !pending.providerInstitutionId ||
        consent.institutionId !== pending.providerInstitutionId
      ) {
        throw new Error("Yapily consent institution does not match the request");
      }

      const accounts = await getYapilyAccounts(consent.consentToken);
      if (pending.existingConnectionId) {
        const existing = await ctx.runQuery(
          internal.queries.bankConnections.getForAction,
          { bankConnectionId: pending.existingConnectionId }
        );
        if (
          existing?.provider === "yapily" &&
          existing.organizationId === pending.organizationId &&
          existing.providerConnectionId !== consent.id
        ) {
          previousConsentId = existing.providerConnectionId;
        }
      }

      await ctx.runMutation(
        internal.mutations.bankConnections.completePending,
        {
          organizationId: args.organizationId,
          state: args.state,
          providerConnectionId: consent.id,
          providerAccessToken: consent.consentToken,
          accounts: accounts.map(normalizeYapilyAccount),
          consentExpiresAt: optionalFutureTimestamp(consent.expiresAt),
          consentReconfirmBy: optionalFutureTimestamp(consent.reconfirmBy),
        }
      );
      completed = true;

      // Keep the old consent usable until the Convex transaction has committed
      // the replacement. Provider cleanup must not roll back a working new link.
      if (previousConsentId) {
        try {
          await deleteYapilyConsent(previousConsentId);
        } catch (error) {
          if (!(error instanceof YapilyApiError && error.status === 404)) {
            console.error("Failed to revoke replaced Yapily consent:", error);
          }
        }
      }
    } catch (error: any) {
      if (newConsentId && !completed) {
        try {
          await deleteYapilyConsent(newConsentId);
        } catch {
          // Preserve the connection failure; provider cleanup can be retried
          // from the Yapily console if the transient deletion also failed.
        }
      }
      // The replacement never committed, so preserve the existing connection's
      // credential and status. Only this authorization attempt has failed.
      await ctx.runMutation(
        internal.mutations.bankConnections.markPendingError,
        {
          organizationId: args.organizationId,
          state: args.state,
          errorCode: "YAPILY_CONNECTION_FAILED",
          errorMessage:
            error?.message || "Failed to finish the Yapily bank connection",
        }
      );
    }

    return null;
  },
});

export const syncTransactions = action({
  args: {
    bankConnectionId: v.id("bankConnections"),
    cursor: v.optional(syncCursorSchema),
  },
  returns: v.object({
    transactions: v.array(syncedTransactionSchema),
    hasMore: v.boolean(),
    nextCursor: v.optional(syncCursorSchema),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    transactions: SyncedBankTransaction[];
    hasMore: boolean;
    nextCursor?: SyncTransactionsCursor;
  }> => {
    const user = await requireUser(ctx);
    requireFinanceRole(user);

    const { internal } = await import("../_generated/api");
    const connection = await ctx.runQuery(
      internal.queries.bankConnections.getForAction,
      { bankConnectionId: args.bankConnectionId }
    );

    if (!connection || connection.organizationId !== user.organizationId) {
      throw new Error("Bank connection not found");
    }

    if (connection.status !== "active") {
      throw new Error(`Bank connection is ${connection.status}. Please re-authenticate.`);
    }

    const mappedAccounts = connection.accounts.filter((account) => account.fundId);
    if (mappedAccounts.length === 0) {
      return { transactions: [], hasMore: false };
    }

    const cursor = validateSyncCursor(args.cursor, mappedAccounts.length);
    const syncRange = cursor ?? calculateDefaultSyncRange({
      today: todayIso(),
      lastSyncedThrough: connection.lastSyncedThrough,
    });
    const { dateFrom, dateTo } = syncRange;
    const transactions: SyncedBankTransaction[] = [];
    let hasMore = false;
    let nextCursor: SyncTransactionsCursor | undefined;

    try {
      syncLoop: for (
        let accountIndex = cursor?.accountIndex ?? 0;
        accountIndex < mappedAccounts.length;
        accountIndex += 1
      ) {
        const account = mappedAccounts[accountIndex];
        let continuationKey =
          accountIndex === cursor?.accountIndex ? cursor.continuationKey : undefined;

        for (let page = 0; page < MAX_TRANSACTION_PAGES_PER_ACCOUNT; page += 1) {
          const remainingCapacity = MAX_SYNC_TRANSACTIONS - transactions.length;
          if (remainingCapacity <= 0) {
            hasMore = true;
            nextCursor = createSyncCursor({
              dateFrom,
              dateTo,
              accountIndex,
              continuationKey,
            });
            break syncLoop;
          }

          let providerTransactions: unknown[];
          let responseContinuationKey: string | undefined;

          if (connection.provider === "yapily") {
            if (!connection.providerAccessToken) {
              throw new Error("Yapily bank connection is missing its consent token");
            }
            const offset = continuationKey == null ? 0 : Number(continuationKey);
            if (!Number.isInteger(offset) || offset < 0) {
              throw new Error("Invalid Yapily transaction pagination offset");
            }
            const response = await getYapilyAccountTransactions({
              consentToken: connection.providerAccessToken,
              accountId: account.accountId,
              dateFrom,
              dateTo,
              limit: Math.min(remainingCapacity, 500),
              offset,
            });
            providerTransactions = response.transactions;
            responseContinuationKey =
              response.nextOffset == null ? undefined : String(response.nextOffset);
          } else {
            const response = await getAccountTransactions({
              accountId: account.accountId,
              dateFrom,
              dateTo,
              continuationKey,
            });
            if (!Array.isArray(response.transactions)) {
              throw new Error("Enable Banking transactions response is invalid");
            }
            providerTransactions = response.transactions;
            const rawContinuationKey = response.continuation_key;
            if (
              rawContinuationKey != null &&
              typeof rawContinuationKey !== "string"
            ) {
              throw new Error("Enable Banking transactions response is invalid");
            }
            responseContinuationKey = rawContinuationKey ?? undefined;
          }

          const hasContinuation = responseContinuationKey != null;
          if (
            providerTransactions.length > remainingCapacity &&
            transactions.length > 0
          ) {
            hasMore = true;
            nextCursor = createSyncCursor({
              dateFrom,
              dateTo,
              accountIndex,
              continuationKey,
            });
            break syncLoop;
          }

          for (const transaction of providerTransactions) {
            const normalized =
              connection.provider === "yapily"
                ? normalizeYapilyTransaction({
                    transaction: transaction as YapilyTransactionLike,
                    accountId: account.accountId,
                    accountName: account.name,
                    fundId: account.fundId,
                  })
                : normalizeEnableBankingTransaction({
                    transaction: transaction as EnableBankingTransactionLike,
                    accountId: account.accountId,
                    accountName: account.name,
                    fundId: account.fundId,
                  });
            transactions.push({
              ...normalized,
              fundId: account.fundId ?? null,
            });
          }

          if (!hasContinuation) {
            if (
              transactions.length >= MAX_SYNC_TRANSACTIONS &&
              accountIndex < mappedAccounts.length - 1
            ) {
              hasMore = true;
              nextCursor = createSyncCursor({
                dateFrom,
                dateTo,
                accountIndex: accountIndex + 1,
              });
              break syncLoop;
            }

            break;
          }

          if (page === MAX_TRANSACTION_PAGES_PER_ACCOUNT - 1) {
            hasMore = true;
            nextCursor = createSyncCursor({
              dateFrom,
              dateTo,
              accountIndex,
              continuationKey: responseContinuationKey,
            });
            break syncLoop;
          }

          if (transactions.length >= MAX_SYNC_TRANSACTIONS) {
            hasMore = true;
            nextCursor = createSyncCursor({
              dateFrom,
              dateTo,
              accountIndex,
              continuationKey: responseContinuationKey,
            });
            break syncLoop;
          }

          continuationKey = responseContinuationKey;
        }
      }
    } catch (error: any) {
      const message = error?.message || "Failed to sync bank transactions";
      const isAuthorizationError =
        connection.provider === "yapily"
          ? isYapilyAuthorizationError(error)
          : isEnableBankingExpiredSessionError(error);

      if (isAuthorizationError) {
        await ctx.runMutation(internal.mutations.bankConnections.updateStatus, {
          bankConnectionId: args.bankConnectionId,
          status: "pending_reauth",
          errorCode: "AUTHORIZATION_REQUIRED",
          errorMessage: message,
        });
      }

      throw error;
    }

    return {
      transactions,
      hasMore,
      ...(nextCursor ? { nextCursor } : {}),
    };
  },
});

export const removeConnection = action({
  args: {
    bankConnectionId: v.id("bankConnections"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const user = await requireUser(ctx);
    if (user.role !== "Admin") {
      throw new Error("Forbidden: this action requires Admin role");
    }

    const { internal } = await import("../_generated/api");
    const connection = await ctx.runQuery(
      internal.queries.bankConnections.getForAction,
      { bankConnectionId: args.bankConnectionId }
    );

    if (!connection || connection.organizationId !== user.organizationId) {
      throw new Error("Bank connection not found");
    }

    try {
      if (connection.provider === "yapily") {
        await deleteYapilyConsent(connection.providerConnectionId);
      } else {
        await closeSession(connection.providerConnectionId);
      }
    } catch (error: any) {
      if (
        !(
          ((error instanceof EnableBankingApiError ||
            error instanceof YapilyApiError) &&
          error.status === 404
          )
        )
      ) {
        throw error;
      }
    }

    await ctx.runMutation(
      internal.mutations.bankConnections.deleteConnectionInternal,
      { bankConnectionId: args.bankConnectionId }
    );

    return { success: true };
  },
});
