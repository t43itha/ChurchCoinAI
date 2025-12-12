import { useState, useCallback } from "react";
import { usePlaidLink as usePlaidLinkOriginal, PlaidLinkOnSuccess } from "react-plaid-link";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

interface PlaidAccount {
  id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
}

interface AccountMapping {
  accountId: string;
  fundId?: Id<"funds">;
}

interface UsePlaidLinkOptions {
  onSuccess?: (itemId: string) => void;
  onExit?: () => void;
  onError?: (error: Error) => void;
}

interface PlaidLinkState {
  linkToken: string | null;
  isLoading: boolean;
  error: string | null;
  accounts: PlaidAccount[];
  institutionId: string | null;
  institutionName: string | null;
  publicToken: string | null;
}

export function usePlaidLinkFlow(options: UsePlaidLinkOptions = {}) {
  const [state, setState] = useState<PlaidLinkState>({
    linkToken: null,
    isLoading: false,
    error: null,
    accounts: [],
    institutionId: null,
    institutionName: null,
    publicToken: null,
  });

  const createLinkToken = useAction(api.actions.plaid.createLinkToken);
  const exchangePublicToken = useAction(api.actions.plaid.exchangePublicToken);

  // Initialize link by getting a link token
  const initializeLink = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const { linkToken } = await createLinkToken({});
      setState((prev) => ({ ...prev, linkToken, isLoading: false }));
      return linkToken;
    } catch (err: any) {
      const error = err.message || "Failed to initialize bank connection";
      setState((prev) => ({ ...prev, error, isLoading: false }));
      options.onError?.(err);
      return null;
    }
  }, [createLinkToken, options]);

  // Handle successful Plaid Link completion
  const handleSuccess: PlaidLinkOnSuccess = useCallback(
    (publicToken, metadata) => {
      // Store the data for the fund mapping step
      setState((prev) => ({
        ...prev,
        publicToken,
        institutionId: metadata.institution?.institution_id || null,
        institutionName: metadata.institution?.name || null,
        accounts: metadata.accounts.map((acc) => ({
          id: acc.id,
          name: acc.name,
          mask: acc.mask,
          type: acc.type,
          subtype: acc.subtype,
        })),
      }));
    },
    []
  );

  // Complete the exchange after fund mapping
  const completeExchange = useCallback(
    async (accountMappings: AccountMapping[]) => {
      if (!state.publicToken || !state.institutionId || !state.institutionName) {
        throw new Error("No pending connection to complete");
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await exchangePublicToken({
          publicToken: state.publicToken,
          institutionId: state.institutionId,
          institutionName: state.institutionName,
          accountMappings,
        });

        // Reset state
        setState({
          linkToken: null,
          isLoading: false,
          error: null,
          accounts: [],
          institutionId: null,
          institutionName: null,
          publicToken: null,
        });

        options.onSuccess?.(result.itemId);
        return result;
      } catch (err: any) {
        const error = err.message || "Failed to complete bank connection";
        setState((prev) => ({ ...prev, error, isLoading: false }));
        options.onError?.(err);
        throw err;
      }
    },
    [state.publicToken, state.institutionId, state.institutionName, exchangePublicToken, options]
  );

  // Cancel the pending connection
  const cancelConnection = useCallback(() => {
    setState({
      linkToken: null,
      isLoading: false,
      error: null,
      accounts: [],
      institutionId: null,
      institutionName: null,
      publicToken: null,
    });
    options.onExit?.();
  }, [options]);

  // Plaid Link configuration
  const { open, ready } = usePlaidLinkOriginal({
    token: state.linkToken,
    onSuccess: handleSuccess,
    onExit: () => {
      if (!state.publicToken) {
        // User exited without completing
        options.onExit?.();
      }
    },
  });

  return {
    // State
    isLoading: state.isLoading,
    error: state.error,
    isReady: ready && !!state.linkToken,
    hasPendingAccounts: state.accounts.length > 0,
    pendingAccounts: state.accounts,
    institutionName: state.institutionName,

    // Actions
    initializeLink,
    open,
    completeExchange,
    cancelConnection,
  };
}

// Hook for re-authentication flow
export function usePlaidUpdateLink(plaidItemId: Id<"plaidItems">) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);

  const createUpdateLinkToken = useAction(api.actions.plaid.createUpdateLinkToken);

  const initializeUpdate = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { linkToken } = await createUpdateLinkToken({ plaidItemId });
      setLinkToken(linkToken);
      return linkToken;
    } catch (err: any) {
      setError(err.message || "Failed to initialize re-authentication");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [createUpdateLinkToken, plaidItemId]);

  const { open, ready } = usePlaidLinkOriginal({
    token: linkToken,
    onSuccess: () => {
      setLinkToken(null);
    },
  });

  return {
    isLoading,
    error,
    isReady: ready && !!linkToken,
    initializeUpdate,
    open,
  };
}
