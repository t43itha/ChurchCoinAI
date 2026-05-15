"use node";

import { action, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import {
  closeSession,
  EnableBankingApiError,
  getAccountTransactions,
  getConsentValidUntil,
  getEnableBankingDefaults,
  startAuthorization,
} from "../lib/enableBanking";
import {
  calculateDefaultSyncRange,
  normalizeEnableBankingTransaction,
} from "../lib/bankConnectionUtils";

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
  fundId: string | null;
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

export const startConnection = action({
  args: {
    existingConnectionId: v.optional(v.id("bankConnections")),
  },
  handler: async (ctx, args): Promise<{ authorizationUrl: string }> => {
    const user = await requireUser(ctx);
    requireFinanceRole(user);

    const { internal } = await import("../_generated/api");
    const defaults = getEnableBankingDefaults();
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
    }

    await ctx.runMutation(internal.mutations.bankConnections.createPending, {
      organizationId: user.organizationId,
      createdBy: user._id,
      provider: "enable_banking",
      state,
      aspspCountry: defaults.aspspCountry,
      aspspName: defaults.aspspName,
      existingConnectionId,
      expiresAt,
    });

    try {
      const response = await startAuthorization({
        state,
        aspspCountry: defaults.aspspCountry,
        aspspName: defaults.aspspName,
        redirectUrl: defaults.redirectUrl,
        validUntil: getConsentValidUntil(),
      });

      return { authorizationUrl: assertValidAuthorizationUrl(response.url) };
    } catch (error: any) {
      try {
        await ctx.runMutation(internal.mutations.bankConnections.markPendingError, {
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

export const syncTransactions = action({
  args: {
    bankConnectionId: v.id("bankConnections"),
    cursor: v.optional(
      v.object({
        dateFrom: v.string(),
        dateTo: v.string(),
        accountIndex: v.number(),
        continuationKey: v.optional(v.string()),
      })
    ),
  },
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

          const response = await getAccountTransactions({
            accountId: account.accountId,
            dateFrom,
            dateTo,
            continuationKey,
          });

          if (!Array.isArray(response.transactions)) {
            throw new Error("Enable Banking transactions response is invalid");
          }

          const responseContinuationKey = response.continuation_key;
          const hasContinuation = responseContinuationKey != null;
          if (hasContinuation && typeof responseContinuationKey !== "string") {
            throw new Error("Enable Banking transactions response is invalid");
          }

          if (
            response.transactions.length > remainingCapacity &&
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

          for (const transaction of response.transactions) {
            transactions.push(
              normalizeEnableBankingTransaction({
                transaction: transaction as any,
                accountId: account.accountId,
                accountName: account.name,
                fundId: account.fundId as string,
              })
            );
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
        error instanceof EnableBankingApiError &&
        (error.status === 401 || error.status === 403);

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
      await closeSession(connection.providerConnectionId);
    } catch (error: any) {
      if (
        !(
          error instanceof EnableBankingApiError &&
          error.status === 404
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
