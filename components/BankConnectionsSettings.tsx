import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { Fund } from '../types';
import {
  Building2,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  Trash2,
  Link2,
  Clock,
  AlertCircle,
  ChevronRight
} from 'lucide-react';
import { usePlaidLinkFlow, usePlaidUpdateLink } from '../hooks/usePlaidLink';

interface BankConnectionsSettingsProps {
  funds: Fund[];
}

interface AccountMapping {
  accountId: string;
  fundId?: Id<"funds">;
}

const BankConnectionsSettings: React.FC<BankConnectionsSettingsProps> = ({ funds }) => {
  const plaidItems = useQuery(api.queries.plaid.listItems) || [];
  const itemsNeedingAttention = useQuery(api.queries.plaid.getItemsNeedingAttention) || [];
  const updateFundMapping = useMutation(api.mutations.plaid.updateAccountFundMapping);
  const removeItem = useAction(api.actions.plaid.removeItem);

  const [showFundMappingModal, setShowFundMappingModal] = useState(false);
  const [pendingMappings, setPendingMappings] = useState<AccountMapping[]>([]);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);

  // Plaid Link flow
  const {
    isLoading: isLinkLoading,
    error: linkError,
    isReady: isLinkReady,
    hasPendingAccounts,
    pendingAccounts,
    institutionName,
    initializeLink,
    open: openPlaidLink,
    completeExchange,
    cancelConnection,
  } = usePlaidLinkFlow({
    onSuccess: () => {
      setShowFundMappingModal(false);
      setPendingMappings([]);
    },
    onError: (error) => {
      console.error('Plaid Link error:', error);
    },
  });

  // Initialize mappings when accounts come in
  useEffect(() => {
    if (hasPendingAccounts && pendingAccounts.length > 0) {
      setPendingMappings(
        pendingAccounts.map((acc) => ({
          accountId: acc.id,
          fundId: undefined,
        }))
      );
      setShowFundMappingModal(true);
    }
  }, [hasPendingAccounts, pendingAccounts]);

  // Open Plaid Link when ready
  useEffect(() => {
    if (isLinkReady && !hasPendingAccounts) {
      openPlaidLink();
    }
  }, [isLinkReady, hasPendingAccounts, openPlaidLink]);

  const handleConnectBank = async () => {
    await initializeLink();
  };

  const handleCompleteFundMapping = async () => {
    try {
      await completeExchange(pendingMappings);
    } catch (error) {
      console.error('Failed to complete connection:', error);
    }
  };

  const handleRemoveConnection = async (itemId: Id<"plaidItems">) => {
    if (!window.confirm('Are you sure you want to disconnect this bank account? You will need to re-authenticate to reconnect.')) {
      return;
    }

    setIsRemoving(itemId);
    try {
      await removeItem({ plaidItemId: itemId });
    } catch (error) {
      console.error('Failed to remove connection:', error);
      alert('Failed to remove bank connection. Please try again.');
    } finally {
      setIsRemoving(null);
    }
  };

  const handleUpdateFundMapping = async (
    itemId: Id<"plaidItems">,
    accountId: string,
    fundId: Id<"funds"> | undefined
  ) => {
    try {
      await updateFundMapping({
        plaidItemId: itemId,
        accountId,
        fundId,
      });
    } catch (error) {
      console.error('Failed to update fund mapping:', error);
      alert('Failed to update account mapping. Please try again.');
    }
  };

  const getStatusBadge = (status: string, daysUntilExpiry?: number | null) => {
    switch (status) {
      case 'active':
        if (daysUntilExpiry !== null && daysUntilExpiry !== undefined && daysUntilExpiry <= 7) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-100">
              <Clock size={10} /> Expires in {daysUntilExpiry}d
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-sage-light text-sage-dark border border-sage/30">
            <CheckCircle2 size={10} /> Connected
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-error-light text-error border border-error/30">
            <AlertCircle size={10} /> Error
          </span>
        );
      case 'consent_expired':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-error-light text-error border border-error/30">
            <AlertTriangle size={10} /> Expired
          </span>
        );
      case 'pending_reauth':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-100">
            <RefreshCw size={10} /> Needs Re-auth
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Alerts for items needing attention */}
      {itemsNeedingAttention.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600 mt-0.5" size={18} />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-amber-900">Bank Connections Need Attention</h4>
              <ul className="mt-2 space-y-1">
                {itemsNeedingAttention.map((item) => (
                  <li key={item._id} className="text-xs text-amber-800">
                    <strong>{item.institutionName}</strong>: {' '}
                    {item.status === 'consent_expired' && 'Consent has expired. Please re-authenticate.'}
                    {item.status === 'pending_reauth' && 'Consent is expiring soon. Please re-authenticate.'}
                    {item.status === 'error' && `Error: ${item.errorMessage || 'Unknown error'}`}
                    {item.daysUntilExpiry !== null && item.daysUntilExpiry <= 7 && item.status === 'active' &&
                      `Consent expires in ${item.daysUntilExpiry} days.`}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Main Card */}
      <div className="swiss-card overflow-hidden">
        <div className="p-6 border-b border-ledger flex justify-between items-center bg-paper/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white border border-ledger rounded-lg flex items-center justify-center text-grey-dark">
              <Building2 size={16} />
            </div>
            <div>
              <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Connected Banks</h3>
              <p className="text-[10px] text-grey-mid">Connect your UK bank accounts via Open Banking.</p>
            </div>
          </div>
          <button
            onClick={handleConnectBank}
            disabled={isLinkLoading}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-md text-xs font-bold uppercase tracking-wide hover:bg-charcoal transition-colors shadow-sm disabled:opacity-50"
          >
            {isLinkLoading ? (
              <RefreshCw size={12} className="animate-spin" />
            ) : (
              <Plus size={12} />
            )}
            Connect Bank
          </button>
        </div>

        {linkError && (
          <div className="p-4 bg-error-light border-b border-error/30">
            <p className="text-xs text-error">{linkError}</p>
          </div>
        )}

        {plaidItems.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-grey-light rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-300">
              <Link2 size={28} />
            </div>
            <h4 className="font-bold text-ink text-sm mb-2">No Banks Connected</h4>
            <p className="text-xs text-grey-mid max-w-sm mx-auto mb-6">
              Connect your UK bank accounts to sync transactions directly. This uses secure Open Banking technology.
            </p>
            <button
              onClick={handleConnectBank}
              disabled={isLinkLoading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-ink text-white rounded-md text-xs font-bold uppercase tracking-wide hover:bg-charcoal transition-colors"
            >
              <Plus size={14} /> Connect Your First Bank
            </button>
          </div>
        ) : (
          <div className="divide-y divide-ledger">
            {plaidItems.map((item) => (
              <div key={item._id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-paper border border-ledger rounded-lg flex items-center justify-center">
                      <Building2 size={18} className="text-grey-dark" />
                    </div>
                    <div>
                      <h4 className="font-bold text-ink text-sm">{item.institutionName}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(
                          item.status,
                          item.consentExpiresAt
                            ? Math.ceil((item.consentExpiresAt - Date.now()) / (24 * 60 * 60 * 1000))
                            : null
                        )}
                        {item.lastSyncAt && (
                          <span className="text-[10px] text-grey-mid">
                            Last synced: {new Date(item.lastSyncAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(item.status === 'consent_expired' || item.status === 'pending_reauth' || item.status === 'error') && (
                      <ReauthButton plaidItemId={item._id} />
                    )}
                    <button
                      onClick={() => setEditingItem(editingItem === item._id ? null : item._id)}
                      className="p-2 text-grey-mid hover:text-ink hover:bg-paper rounded transition-colors"
                    >
                      <ChevronRight
                        size={16}
                        className={`transform transition-transform ${editingItem === item._id ? 'rotate-90' : ''}`}
                      />
                    </button>
                    <button
                      onClick={() => handleRemoveConnection(item._id)}
                      disabled={isRemoving === item._id}
                      className="p-2 text-grey-mid hover:text-error hover:bg-error-light rounded transition-colors disabled:opacity-50"
                    >
                      {isRemoving === item._id ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Account List - Expandable */}
                {editingItem === item._id && (
                  <div className="mt-4 pt-4 border-t border-ledger">
                    <h5 className="text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-3">Account Mappings</h5>
                    <div className="space-y-3">
                      {item.accounts.map((account) => (
                        <div key={account.accountId} className="flex items-center justify-between p-3 bg-paper rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-ink">{account.name}</p>
                            <p className="text-[10px] text-grey-mid">
                              {account.type} {account.subtype ? `- ${account.subtype}` : ''}
                              {account.mask && ` ••••${account.mask}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-grey-mid">Map to:</span>
                            <select
                              value={account.fundId || ''}
                              onChange={(e) => handleUpdateFundMapping(
                                item._id,
                                account.accountId,
                                e.target.value ? e.target.value as Id<"funds"> : undefined
                              )}
                              className="text-xs p-2 bg-white border border-ledger rounded outline-none focus:ring-1 focus:ring-ink min-w-[150px]"
                            >
                              <option value="">-- Not mapped --</option>
                              {funds.map((fund) => (
                                <option key={fund._id} value={fund._id}>
                                  {fund.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[10px] text-grey-mid">
                      Only mapped accounts will sync transactions. Each account can map to one fund.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* UK Open Banking Info */}
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <p className="text-xs text-blue-900 leading-relaxed">
          <strong>UK Open Banking:</strong> Bank connections require consent renewal every 90 days.
          You'll be notified before consent expires and can re-authenticate without losing your transaction history.
        </p>
      </div>

      {/* Fund Mapping Modal for New Connections */}
      {showFundMappingModal && hasPendingAccounts && (
        <div className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-lg shadow-2xl border border-ledger animate-enter">
            <div className="p-4 border-b border-ledger flex justify-between items-center bg-paper rounded-t-lg">
              <div>
                <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Map Accounts to Funds</h3>
                {institutionName && (
                  <p className="text-[10px] text-grey-mid mt-1">{institutionName}</p>
                )}
              </div>
              <button
                onClick={() => {
                  cancelConnection();
                  setShowFundMappingModal(false);
                }}
                className="text-grey-mid hover:text-grey-dark"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-grey-mid">
                Choose which fund each bank account should sync transactions to. Unmapped accounts won't sync.
              </p>

              {pendingAccounts.map((account, index) => (
                <div key={account.id} className="p-4 bg-paper rounded-lg border border-ledger">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-bold text-ink">{account.name}</p>
                      <p className="text-[10px] text-grey-mid">
                        {account.type} {account.subtype ? `- ${account.subtype}` : ''}
                        {account.mask && ` ••••${account.mask}`}
                      </p>
                    </div>
                  </div>
                  <select
                    value={pendingMappings[index]?.fundId || ''}
                    onChange={(e) => {
                      const newMappings = [...pendingMappings];
                      newMappings[index] = {
                        ...newMappings[index],
                        fundId: e.target.value ? e.target.value as Id<"funds"> : undefined,
                      };
                      setPendingMappings(newMappings);
                    }}
                    className="w-full text-sm p-2.5 bg-white border border-ledger rounded outline-none focus:ring-1 focus:ring-ink"
                  >
                    <option value="">-- Don't sync this account --</option>
                    {funds.map((fund) => (
                      <option key={fund._id} value={fund._id}>
                        {fund.name} ({fund.type})
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    cancelConnection();
                    setShowFundMappingModal(false);
                  }}
                  className="px-4 py-2 text-xs font-bold uppercase text-grey-mid hover:bg-grey-light rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCompleteFundMapping}
                  disabled={isLinkLoading}
                  className="px-6 py-2 bg-ink text-white rounded text-xs font-bold uppercase tracking-wide hover:bg-charcoal flex items-center gap-2 disabled:opacity-50"
                >
                  {isLinkLoading ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  Complete Setup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Re-authentication button component
const ReauthButton: React.FC<{ plaidItemId: Id<"plaidItems"> }> = ({ plaidItemId }) => {
  const { isLoading, error, isReady, initializeUpdate, open } = usePlaidUpdateLink(plaidItemId);

  useEffect(() => {
    if (isReady) {
      open();
    }
  }, [isReady, open]);

  return (
    <button
      onClick={initializeUpdate}
      disabled={isLoading}
      className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-800 rounded text-xs font-bold uppercase tracking-wide hover:bg-amber-200 transition-colors disabled:opacity-50"
    >
      {isLoading ? (
        <RefreshCw size={12} className="animate-spin" />
      ) : (
        <RefreshCw size={12} />
      )}
      Re-authenticate
    </button>
  );
};

export default BankConnectionsSettings;
