import React, { useEffect, useState } from 'react';
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
  Trash2,
  Link2,
  Clock,
  AlertCircle,
  ChevronRight
} from 'lucide-react';
import { notify } from '../lib/notifications';

interface BankConnectionsSettingsProps {
  funds: Fund[];
}

const BankConnectionsSettings: React.FC<BankConnectionsSettingsProps> = ({ funds }) => {
  const bankConnections = useQuery(api.queries.bankConnections.list) || [];
  const itemsNeedingAttention = useQuery(api.queries.bankConnections.getItemsNeedingAttention) || [];
  const updateFundMapping = useMutation(api.mutations.bankConnections.updateAccountFundMapping);
  const startConnection = useAction(api.actions.bankConnections.startConnection);
  const removeConnection = useAction(api.actions.bankConnections.removeConnection);

  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const callbackResult = searchParams.get('bankConnection');

    if (callbackResult !== 'success' && callbackResult !== 'error') {
      return;
    }

    searchParams.delete('bankConnection');
    const nextSearch = searchParams.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);

    if (callbackResult === 'success') {
      setConnectionError(null);
      notify('Success', 'Bank connection completed successfully.');
      return;
    }

    const message = 'Bank connection was not completed. Please try connecting again.';
    setConnectionError(message);
    notify('Error', message);
  }, []);

  const handleConnectBank = async () => {
    setIsConnecting(true);
    setConnectionError(null);

    try {
      const { authorizationUrl } = await startConnection({});
      window.location.assign(authorizationUrl);
    } catch (error: any) {
      const message = error?.message || 'Failed to start bank connection';
      setConnectionError(message);
      notify('Error', message);
      setIsConnecting(false);
    }
  };

  const handleRemoveConnection = async (connectionId: Id<"bankConnections">) => {
    if (!window.confirm('Are you sure you want to disconnect this bank account? You will need to re-authenticate to reconnect.')) {
      return;
    }

    setIsRemoving(connectionId);
    try {
      await removeConnection({ bankConnectionId: connectionId });
    } catch (error) {
      console.error('Failed to remove connection:', error);
      notify('Error', 'Failed to remove bank connection. Please try again.');
    } finally {
      setIsRemoving(null);
    }
  };

  const handleUpdateFundMapping = async (
    connectionId: Id<"bankConnections">,
    accountId: string,
    fundId: Id<"funds"> | undefined
  ) => {
    try {
      await updateFundMapping({
        bankConnectionId: connectionId,
        accountId,
        fundId,
      });
    } catch (error) {
      console.error('Failed to update fund mapping:', error);
      notify('Error', 'Failed to update account mapping. Please try again.');
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

  const renderAccountDetails = (account: {
    type?: string;
    currency?: string;
    mask?: string;
  }) => {
    const details = [
      account.type,
      account.currency,
      account.mask ? `****${account.mask}` : undefined,
    ].filter(Boolean);

    return details.length > 0 ? details.join(' - ') : 'Bank account';
  };

  return (
    <div className="space-y-6">
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
                    {item.status === 'pending_reauth' && 'Consent requires renewal. Please re-authenticate.'}
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

      <div className="swiss-card overflow-hidden">
        <div className="p-6 border-b border-ledger flex justify-between items-center bg-paper/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white border border-ledger rounded-lg flex items-center justify-center text-grey-dark">
              <Building2 size={16} />
            </div>
            <div>
              <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Connected Banks</h3>
              <p className="text-[10px] text-grey-mid">
                Connect UK bank accounts via GoCardless Open Banking.
              </p>
            </div>
          </div>
          <button
            onClick={handleConnectBank}
            disabled={isConnecting}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-md text-xs font-bold uppercase tracking-wide hover:bg-charcoal transition-colors shadow-sm disabled:opacity-50"
          >
            {isConnecting ? (
              <RefreshCw size={12} className="animate-spin" />
            ) : (
              <Plus size={12} />
            )}
            Connect Bank
          </button>
        </div>

        <div className="px-6 py-3 border-b border-ledger bg-blue-50">
          <p className="text-[11px] leading-relaxed text-blue-900">
            Metro Bank users: when the bank login opens, select the business
            account or profile you want ChurchCoinAI to read. Personal accounts
            can appear in the same Metro Bank flow.
          </p>
        </div>

        {connectionError && (
          <div className="p-4 bg-error-light border-b border-error/30">
            <p className="text-xs text-error">{connectionError}</p>
          </div>
        )}

        {bankConnections.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-grey-light rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-300">
              <Link2 size={28} />
            </div>
            <h4 className="font-bold text-ink text-sm mb-2">No Banks Connected</h4>
            <p className="text-xs text-grey-mid max-w-sm mx-auto mb-6">
              Connect a UK bank account through GoCardless, map it to a fund,
              then manually sync transactions for review before import.
            </p>
            <button
              onClick={handleConnectBank}
              disabled={isConnecting}
              className="inline-flex items-center gap-2 px-6 py-3 bg-ink text-white rounded-md text-xs font-bold uppercase tracking-wide hover:bg-charcoal transition-colors disabled:opacity-50"
            >
              {isConnecting ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Connect Your First Bank
            </button>
          </div>
        ) : (
          <div className="divide-y divide-ledger">
            {bankConnections.map((connection) => (
              <div key={connection._id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-paper border border-ledger rounded-lg flex items-center justify-center">
                      <Building2 size={18} className="text-grey-dark" />
                    </div>
                    <div>
                      <h4 className="font-bold text-ink text-sm">{connection.institutionName}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(
                          connection.status,
                          connection.consentExpiresAt
                            ? Math.ceil((connection.consentExpiresAt - Date.now()) / (24 * 60 * 60 * 1000))
                            : null
                        )}
                        {connection.lastSyncAt && (
                          <span className="text-[10px] text-grey-mid">
                            Last synced: {new Date(connection.lastSyncAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(connection.status === 'consent_expired' || connection.status === 'pending_reauth' || connection.status === 'error') && (
                      <ReauthButton bankConnectionId={connection._id} />
                    )}
                    <button
                      onClick={() => setEditingItem(editingItem === connection._id ? null : connection._id)}
                      className="p-2 text-grey-mid hover:text-ink hover:bg-paper rounded transition-colors"
                    >
                      <ChevronRight
                        size={16}
                        className={`transform transition-transform ${editingItem === connection._id ? 'rotate-90' : ''}`}
                      />
                    </button>
                    <button
                      onClick={() => handleRemoveConnection(connection._id)}
                      disabled={isRemoving === connection._id}
                      className="p-2 text-grey-mid hover:text-error hover:bg-error-light rounded transition-colors disabled:opacity-50"
                    >
                      {isRemoving === connection._id ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </div>

                {editingItem === connection._id && (
                  <div className="mt-4 pt-4 border-t border-ledger">
                    <h5 className="text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-3">Account Mappings</h5>
                    <div className="space-y-3">
                      {connection.accounts.map((account) => (
                        <div key={account.accountId} className="flex items-center justify-between p-3 bg-paper rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-ink">{account.name}</p>
                            <p className="text-[10px] text-grey-mid">
                              {renderAccountDetails(account)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-grey-mid">Map to:</span>
                            <select
                              value={account.fundId || ''}
                              onChange={(e) => handleUpdateFundMapping(
                                connection._id,
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

      <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <p className="text-xs text-blue-900 leading-relaxed">
          <strong>GoCardless Open Banking:</strong> Connections are read-only and require consent renewal every 90 days.
          You'll be notified before consent expires and can re-authenticate without losing your transaction history.
        </p>
      </div>
    </div>
  );
};

const ReauthButton: React.FC<{ bankConnectionId: Id<"bankConnections"> }> = ({ bankConnectionId }) => {
  const [isLoading, setIsLoading] = useState(false);
  const startConnection = useAction(api.actions.bankConnections.startConnection);

  const handleReauth = async () => {
    setIsLoading(true);
    try {
      const { authorizationUrl } = await startConnection({ existingConnectionId: bankConnectionId });
      window.location.assign(authorizationUrl);
    } catch (error: any) {
      notify('Error', error?.message || 'Failed to start re-authentication');
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleReauth}
      disabled={isLoading}
      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wide border border-amber-200 text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50"
    >
      <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
      Re-auth
    </button>
  );
};

export default BankConnectionsSettings;
