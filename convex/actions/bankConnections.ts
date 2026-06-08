"use node";

import { action, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import {
  createEndUserAgreement,
  createRequisition,
  deleteRequisition,
  getAccountTransactions,
  getGoCardlessDefaults,
  GoCardlessApiError,
  isGoCardlessReauthError,
} from "../lib/gocardless";
import {
  calculateDefaultSyncRange,
  normalizeGoCardlessTransaction,
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
    throw new Error("GoCardless returned an invalid authorization URL");
  }

  const trimmedUrl = url.trim();

  try {
    const parsed = new URL(trimmedUrl);
    if (parsed.protocol !== "https:") throw new Error();
    return trimmedUrl;
  } catch {
    throw new Error("GoCardless returned an invalid authorization URL");
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
    const defaults = getGoCardlessDefaults();
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
      provider: "gocardless",
      state,
      aspspCountry: defaults.country,
      aspspName: defaults.institutionName,
      existingConnectionId,
      expiresAt,
    });

    try {
      const agreement = await createEndUserAgreement({
        institutionId: defaults.institutionId,
        maxHistoricalDays: 90,
        accessValidForDays: 90,
      });

      const requisition = await createRequisition({
        redirectUrl: defaults.redirectUrl,
        institutionId: defaults.institutionId,
        reference: state,
        agreementId: agreement.id,
      });

      await ctx.runMutation(
        internal.mutations.bankConnections.attachPendingProviderConnection,
        {
          state,
          providerConnectionId: requisition.id,
        }
      );

      return { authorizationUrl: assertValidAuthorizationUrl(requisition.link) };
    } catch (error: any) {
      try {
        await ctx.runMutation(internal.mutations.bankConnections.markPendingError, {
          state,
          errorCode: "AUTHORIZATION_START_FAILED",
          errorMessage:
            error?.message || "Failed to start GoCardless bank authorization",
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
        const remainingCapacity = MAX_SYNC_TRANSACTIONS - transactions.length;
        if (remainingCapacity <= 0) {
          hasMore = true;
          nextCursor = createSyncCursor({
            dateFrom,
            dateTo,
            accountIndex,
          });
          break syncLoop;
        }

        const response = await getAccountTransactions({
          accountId: account.accountId,
          dateFrom,
          dateTo,
        });

        const bookedTransactions = response.transactions?.booked;
        if (!Array.isArray(bookedTransactions)) {
          throw new Error("GoCardless transactions response is invalid");
        }

        if (bookedTransactions.length > remainingCapacity) {
          throw new Error(
            "GoCardless returned more transactions than can be reviewed in one sync. Try again after importing the current review batch or reduce the sync range."
          );
        }

        for (const transaction of bookedTransactions) {
          transactions.push(
            normalizeGoCardlessTransaction({
              transaction: transaction as any,
              accountId: account.accountId,
              accountName: account.name,
              fundId: account.fundId as string,
            })
          );
        }

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
      }
    } catch (error: any) {
      const message = error?.message || "Failed to sync bank transactions";
      const isAuthorizationError =
        error instanceof GoCardlessApiError && isGoCardlessReauthError(error);

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
      await deleteRequisition(connection.providerConnectionId);
    } catch (error: any) {
      if (!(error instanceof GoCardlessApiError && error.status === 404)) {
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
