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

const assertValidAuthorizationUrl = (url: string) => {
  const trimmedUrl = url.trim();

  try {
    const parsed = new URL(trimmedUrl);
    if (!trimmedUrl || parsed.protocol !== "https:") throw new Error();
    return trimmedUrl;
  } catch {
    throw new Error("Enable Banking returned an invalid authorization URL");
  }
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
    let existingConnectionId = args.existingConnectionId;

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

    const response = await startAuthorization({
      state,
      aspspCountry: defaults.aspspCountry,
      aspspName: defaults.aspspName,
      redirectUrl: defaults.redirectUrl,
      validUntil: getConsentValidUntil(),
    });

    return { authorizationUrl: assertValidAuthorizationUrl(response.url) };
  },
});

export const syncTransactions = action({
  args: {
    bankConnectionId: v.id("bankConnections"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    transactions: Array<{
      date: string;
      description: string;
      amount: number;
      type: "Income" | "Expenditure";
      accountId: string;
      accountName: string;
      fundId: string | null;
      providerTransactionId: string;
    }>;
    hasMore: boolean;
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

    const { dateFrom, dateTo } = calculateDefaultSyncRange({
      today: todayIso(),
      lastSyncedThrough: connection.lastSyncedThrough,
    });

    const mappedAccounts = connection.accounts.filter((account) => account.fundId);
    if (mappedAccounts.length === 0) {
      return { transactions: [], hasMore: false };
    }

    const transactions = [];

    try {
      for (const account of mappedAccounts) {
        const response = await getAccountTransactions({
          accountId: account.accountId,
          dateFrom,
          dateTo,
        });

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
      }

      await ctx.runMutation(internal.mutations.bankConnections.updateSyncState, {
        bankConnectionId: args.bankConnectionId,
        lastSyncedThrough: dateTo,
      });
    } catch (error: any) {
      const message = error?.message || "Failed to sync bank transactions";
      const isAuthorizationError =
        error instanceof EnableBankingApiError &&
        (error.status === 401 || error.status === 403);

      await ctx.runMutation(internal.mutations.bankConnections.updateStatus, {
        bankConnectionId: args.bankConnectionId,
        status: isAuthorizationError ? "pending_reauth" : "error",
        errorCode: isAuthorizationError ? "AUTHORIZATION_REQUIRED" : "SYNC_ERROR",
        errorMessage: message,
      });

      throw error;
    }

    return {
      transactions,
      hasMore: false,
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
      if (!(error instanceof EnableBankingApiError && error.status === 404)) {
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
