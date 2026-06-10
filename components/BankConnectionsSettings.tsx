import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { Fund } from '../types';
import {
  Plus,
  RefreshCw,
  AlertTriangle,
  Trash2,
  Link2,
  Landmark,
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

  // Refined Ledger pill badge with status dot
  const pillBadge = (tone: 'sage' | 'amber' | 'error', label: string) => {
    const styles = {
      sage: { wash: '#eef3ee', line: '#d7e3d7', fg: '#557555', dot: '#6b8e6b' },
      amber: { wash: '#faf2e9', line: '#ecd8bd', fg: '#a9743f', dot: '#c79a5f' },
      error: { wash: '#fbeded', line: '#eccaca', fg: '#b53d3d', dot: '#c64545' },
    }[tone];
    return (
      <span
        className="inline-flex items-center gap-1.5 px-[11px] py-[5px] rounded-full text-[11px] font-bold uppercase tracking-[0.05em] whitespace-nowrap"
        style={{ color: styles.fg, background: styles.wash, border: `1px solid ${styles.line}` }}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: styles.dot }} />
        {label}
      </span>
    );
  };

  const getStatusBadge = (status: string, daysUntilExpiry?: number | null) => {
    switch (status) {
      case 'active':
        if (daysUntilExpiry !== null && daysUntilExpiry !== undefined && daysUntilExpiry <= 7) {
          return pillBadge('amber', `Expires in ${daysUntilExpiry}d`);
        }
        return pillBadge('sage', 'Connected');
      case 'error':
        return pillBadge('error', 'Error');
      case 'consent_expired':
        return pillBadge('error', 'Expired');
      case 'pending_reauth':
        return pillBadge('amber', 'Needs Re-auth');
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
        <div className="bg-[#fcf7f0] border border-[#ecd8bd] rounded-[10px] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-[#a9743f] mt-0.5 shrink-0" size={18} strokeWidth={1.9} />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-[#7a5a30]">Bank Connections Need Attention</h4>
              <ul className="mt-2 space-y-1">
                {itemsNeedingAttention.map((item) => (
                  <li key={item._id} className="text-xs text-[#7a5a30] leading-relaxed">
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

      <div className="swiss-card-static overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-[18px] border-b border-grey-light bg-[#fcfbf9]">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-[9px] bg-white border border-ledger text-grey-dark shrink-0">
              <Landmark size={16} strokeWidth={1.9} />
            </span>
            <div>
              <h3 className="text-[13.5px] font-bold text-ink uppercase tracking-[0.02em]">Bank connections</h3>
              <p className="text-[11.5px] text-grey-mid mt-0.5">Connected accounts used for transaction sync.</p>
            </div>
          </div>
          <button
            onClick={handleConnectBank}
            disabled={isConnecting}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[9px] bg-ink text-white text-xs font-bold uppercase tracking-[0.04em] hover:bg-charcoal transition-colors disabled:opacity-50"
          >
            {isConnecting ? (
              <RefreshCw size={14} className="animate-spin" strokeWidth={2} />
            ) : (
              <Plus size={14} strokeWidth={2} />
            )}
            Connect
          </button>
        </div>

        {connectionError && (
          <div className="p-4 bg-error-light border-b border-error/30">
            <p className="text-xs text-error">{connectionError}</p>
          </div>
        )}

        {bankConnections.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-paper border border-ledger rounded-2xl flex items-center justify-center mx-auto mb-4 text-grey-mid">
              <Link2 size={28} strokeWidth={1.5} />
            </div>
            <h4 className="font-bold text-ink text-sm mb-2">No Banks Connected</h4>
            <p className="text-xs text-grey-mid max-w-sm mx-auto mb-6 leading-relaxed">
              Connect your UK bank accounts to sync transactions directly. This uses secure Open Banking technology.
            </p>
            <button
              onClick={handleConnectBank}
              disabled={isConnecting}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-[9px] bg-ink text-white text-xs font-bold uppercase tracking-[0.04em] hover:bg-charcoal transition-colors disabled:opacity-50"
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
          <div className="divide-y divide-grey-light">
            {bankConnections.map((connection) => (
              <div key={connection._id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-paper border border-ledger text-grey-dark shrink-0">
                      <Landmark size={18} strokeWidth={1.7} />
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-[14.5px] font-semibold text-ink truncate">{connection.institutionName}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(
                          connection.status,
                          connection.consentExpiresAt
                            ? Math.ceil((connection.consentExpiresAt - Date.now()) / (24 * 60 * 60 * 1000))
                            : null
                        )}
                        {connection.lastSyncAt && (
                          <span className="text-[12.5px] text-grey-mid whitespace-nowrap">
                            · Synced {new Date(connection.lastSyncAt).toLocaleDateString()}
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
                  <div className="mt-4 pt-4 border-t border-grey-light">
                    <h5 className="text-[10.5px] font-bold text-grey-mid uppercase tracking-[0.08em] mb-3">Account Mappings</h5>
                    <div className="space-y-2.5">
                      {connection.accounts.map((account) => (
                        <div key={account.accountId} className="flex items-center justify-between gap-3 px-3.5 py-3 bg-[#fbfaf8] border border-[#efeee9] rounded-[10px]">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink truncate">{account.name}</p>
                            <p className="text-[12px] text-grey-mid mt-0.5">
                              {renderAccountDetails(account)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-grey-mid">Map to</span>
                            <select
                              value={account.fundId || ''}
                              onChange={(e) => handleUpdateFundMapping(
                                connection._id,
                                account.accountId,
                                e.target.value ? e.target.value as Id<"funds"> : undefined
                              )}
                              className="text-xs p-2 bg-white border border-ledger rounded-[9px] outline-none focus:ring-1 focus:ring-ink min-w-[150px] cursor-pointer"
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
                    <p className="mt-3 text-[12px] text-grey-mid">
                      Only mapped accounts will sync transactions. Each account can map to one fund.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[#fcf7f0] border border-[#ecd8bd] rounded-[10px] px-3.5 py-[11px]">
        <p className="text-xs text-[#7a5a30] leading-relaxed">
          <strong className="font-bold">UK Open Banking:</strong> Bank connections require consent renewal every 90 days.
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
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.05em] border border-[#ecd8bd] text-[#a9743f] rounded-[8px] bg-white hover:bg-[#fcf7f0] transition-colors disabled:opacity-50"
    >
      <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
      Re-auth
    </button>
  );
};

export default BankConnectionsSettings;
