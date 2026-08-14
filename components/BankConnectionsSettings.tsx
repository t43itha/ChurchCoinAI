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
  ChevronRight,
  X
} from 'lucide-react';
import { notify } from '../lib/notifications';

interface BankConnectionsSettingsProps {
  funds: Fund[];
}

type AvailableInstitution = {
  provider: BankProvider;
  institutionId: string;
  name: string;
  country: string;
  logoUrl: string | null;
  maximumConsentValiditySeconds: number | null;
  beta: boolean;
  environmentType: string | null;
};

type BankProvider = 'yapily' | 'enable_banking';

type ReauthConnection = {
  _id: Id<"bankConnections">;
  institutionName: string;
  institutionCountry: string;
  provider: BankProvider;
  providerInstitutionId?: string;
};

const getCallbackAttemptState = () => {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('bankConnectionState');
};

const clearBankCallbackParams = () => {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.delete('bankConnection');
  searchParams.delete('bankConnectionState');
  const nextSearch = searchParams.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', nextUrl);
};

const BankConnectionsSettings: React.FC<BankConnectionsSettingsProps> = ({ funds }) => {
  const bankConnections = useQuery(api.queries.bankConnections.list) || [];
  const itemsNeedingAttention = useQuery(api.queries.bankConnections.getItemsNeedingAttention) || [];
  const [callbackAttemptState, setCallbackAttemptState] = useState<string | null>(getCallbackAttemptState);
  const callbackAttempt = useQuery(
    api.queries.bankConnections.getAttempt,
    callbackAttemptState ? { state: callbackAttemptState } : 'skip'
  );
  const updateFundMapping = useMutation(api.mutations.bankConnections.updateAccountFundMapping);
  const listInstitutions = useAction(api.actions.bankConnections.listInstitutions);
  const startConnection = useAction(api.actions.bankConnections.startConnection);
  const removeConnection = useAction(api.actions.bankConnections.removeConnection);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(false);
  const [isBankPickerOpen, setIsBankPickerOpen] = useState(false);
  const [availableInstitutions, setAvailableInstitutions] = useState<AvailableInstitution[]>([]);
  const [reauthConnection, setReauthConnection] = useState<ReauthConnection | undefined>();
  const [selectedProvider, setSelectedProvider] = useState<BankProvider>('yapily');
  const [isAwaitingCompletion, setIsAwaitingCompletion] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const callbackResult = searchParams.get('bankConnection');

    if (callbackResult !== 'success' && callbackResult !== 'error' && callbackResult !== 'processing') {
      return;
    }

    if (callbackResult === 'success') {
      clearBankCallbackParams();
      setCallbackAttemptState(null);
      setConnectionError(null);
      notify('Success', 'Bank connection completed successfully.');
      return;
    }

    if (callbackResult === 'processing') {
      if (!callbackAttemptState) {
        clearBankCallbackParams();
        const message = 'Bank connection status could not be verified. Please try connecting again.';
        setConnectionError(message);
        notify('Error', message);
        return;
      }

      searchParams.delete('bankConnection');
      const nextSearch = searchParams.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
      window.history.replaceState(window.history.state, '', nextUrl);
      setConnectionError(null);
      setIsAwaitingCompletion(true);
      notify('Bank authorised', 'ChurchCoin is securely finishing the Yapily connection.');
      return;
    }

    clearBankCallbackParams();
    setCallbackAttemptState(null);
    const message = 'Bank connection was not completed. Please try connecting again.';
    setConnectionError(message);
    notify('Error', message);
  }, [callbackAttemptState]);

  useEffect(() => {
    if (!callbackAttemptState || callbackAttempt === undefined) return;

    if (!callbackAttempt) {
      clearBankCallbackParams();
      setCallbackAttemptState(null);
      setIsAwaitingCompletion(false);
      const message = 'Bank connection status could not be verified. Please try connecting again.';
      setConnectionError(message);
      notify('Error', message);
      return;
    }

    if (callbackAttempt.status === 'pending' || callbackAttempt.status === 'processing') {
      setIsAwaitingCompletion(true);
      return;
    }

    clearBankCallbackParams();
    setCallbackAttemptState(null);
    if (callbackAttempt.status === 'completed') {
      setIsAwaitingCompletion(false);
      setConnectionError(null);
      notify('Success', `${callbackAttempt.institutionName} connected successfully.`);
    } else if (callbackAttempt.status === 'error') {
      const message = callbackAttempt.errorMessage || 'Yapily could not finish the bank connection.';
      setIsAwaitingCompletion(false);
      setConnectionError(message);
      notify('Error', message);
    }
  }, [callbackAttemptState, callbackAttempt]);

  const loadInstitutions = async (provider: BankProvider) => {
    setSelectedProvider(provider);
    setIsLoadingInstitutions(true);
    setAvailableInstitutions([]);
    setConnectionError(null);

    try {
      const institutions = await listInstitutions({ provider });
      setAvailableInstitutions(institutions);
    } catch (error: any) {
      const message = error?.message || 'Failed to load supported UK banks';
      setConnectionError(message);
      notify('Error', message);
    } finally {
      setIsLoadingInstitutions(false);
    }
  };

  const openBankPicker = async (existingConnection?: ReauthConnection) => {
    setReauthConnection(existingConnection);
    setIsBankPickerOpen(true);
    await loadInstitutions(existingConnection?.provider || 'yapily');
  };

  const handleConnectBank = async (institution: AvailableInstitution) => {
    setIsConnecting(true);
    setConnectionError(null);

    try {
      const { authorizationUrl } = await startConnection({
        provider: institution.provider,
        institutionId: institution.institutionId,
        institutionName: institution.name,
        institutionCountry: institution.country,
        existingConnectionId: reauthConnection?._id,
      });
      window.location.assign(authorizationUrl);
    } catch (error: any) {
      const message = error?.message || 'Failed to start bank connection';
      setConnectionError(message);
      notify('Error', message);
      setIsConnecting(false);
    }
  };

  const closeBankPicker = () => {
    if (isConnecting) return;
    setIsBankPickerOpen(false);
    setReauthConnection(undefined);
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

  const getStatusBadge = (status: string, daysUntilReview?: number | null) => {
    switch (status) {
      case 'active':
        if (daysUntilReview !== null && daysUntilReview !== undefined && daysUntilReview <= 7) {
          return pillBadge('amber', `Review in ${daysUntilReview}d`);
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

  const selectableInstitutions = reauthConnection
    ? availableInstitutions.filter(
        (institution) =>
          institution.country === reauthConnection.institutionCountry.toUpperCase() &&
          institution.name === reauthConnection.institutionName &&
          institution.provider === reauthConnection.provider &&
          (!reauthConnection.providerInstitutionId ||
            institution.institutionId === reauthConnection.providerInstitutionId)
      )
    : availableInstitutions;

  return (
    <div className="space-y-6">
      {isAwaitingCompletion && (
        <div className="flex items-center gap-3 rounded-[10px] border border-[#cbd9e8] bg-[#f3f7fb] p-4 text-xs text-[#385a7a]">
          <RefreshCw size={16} className="animate-spin shrink-0" />
          Yapily authorisation received. Securely exchanging the one-time token and loading your accounts…
        </div>
      )}
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
                    {item.daysUntilReconfirmation !== null && item.daysUntilReconfirmation <= 7 && item.status === 'active' &&
                      ` Please reconfirm access within ${item.daysUntilReconfirmation} days.`}
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
            onClick={() => openBankPicker()}
            disabled={isConnecting || isLoadingInstitutions}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[9px] bg-ink text-white text-xs font-bold uppercase tracking-[0.04em] hover:bg-charcoal transition-colors disabled:opacity-50"
          >
            {isLoadingInstitutions ? (
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
              onClick={() => openBankPicker()}
              disabled={isConnecting || isLoadingInstitutions}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-[9px] bg-ink text-white text-xs font-bold uppercase tracking-[0.04em] hover:bg-charcoal transition-colors disabled:opacity-50"
            >
              {isLoadingInstitutions ? (
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
                      <p className="mt-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-grey-mid">
                        {connection.provider === 'yapily' ? 'Yapily' : 'Enable Banking'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(
                          connection.status,
                          [connection.consentExpiresAt, connection.consentReconfirmBy]
                            .filter((value): value is number => typeof value === 'number')
                            .map((value) => Math.ceil((value - Date.now()) / (24 * 60 * 60 * 1000)))
                            .sort((a, b) => a - b)[0] ?? null
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
                    {(connection.status === 'consent_expired' ||
                      connection.status === 'pending_reauth' ||
                      connection.status === 'error' ||
                      Boolean(connection.consentReconfirmBy && connection.consentReconfirmBy < Date.now() + 7 * 24 * 60 * 60 * 1000) ||
                      Boolean(connection.consentExpiresAt && connection.consentExpiresAt < Date.now() + 7 * 24 * 60 * 60 * 1000)) && (
                      <ReauthButton
                        disabled={isConnecting || isLoadingInstitutions}
                        onClick={() => openBankPicker(connection)}
                      />
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
          <strong className="font-bold">UK Open Banking:</strong> Connections are read-only and provider-specific.
          You'll be notified before access needs reconfirmation or re-authorisation, without losing imported history or fund mappings.
        </p>
      </div>

      {isBankPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bank-picker-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeBankPicker();
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-[14px] border border-ledger bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-grey-light bg-[#fcfbf9] px-6 py-5">
              <div>
                <h3 id="bank-picker-title" className="text-base font-bold text-ink">
                  {reauthConnection
                    ? `Reconnect ${reauthConnection.institutionName}`
                    : 'Choose a UK bank'}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-grey-mid">
                  UK institutions are loaded live from {selectedProvider === 'yapily' ? 'Yapily' : 'Enable Banking'}.
                </p>
              </div>
              <button
                type="button"
                onClick={closeBankPicker}
                disabled={isConnecting}
                aria-label="Close bank picker"
                className="rounded-[8px] p-2 text-grey-mid transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-5">
              {!reauthConnection && (
                <div className="mb-5 grid grid-cols-2 gap-2 rounded-[11px] bg-paper p-1.5" aria-label="Open Banking provider">
                  {([
                    ['yapily', 'Yapily', 'Recommended · broad UK coverage'],
                    ['enable_banking', 'Enable Banking', 'Existing alternative'],
                  ] as const).map(([provider, label, description]) => (
                    <button
                      key={provider}
                      type="button"
                      disabled={isConnecting || isLoadingInstitutions}
                      onClick={() => loadInstitutions(provider)}
                      className={`rounded-[9px] px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                        selectedProvider === provider
                          ? 'bg-white text-ink shadow-sm ring-1 ring-ledger'
                          : 'text-grey-mid hover:text-ink'
                      }`}
                    >
                      <span className="block text-xs font-bold">{label}</span>
                      <span className="mt-0.5 block text-[10.5px]">{description}</span>
                    </button>
                  ))}
                </div>
              )}
              {isLoadingInstitutions ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-grey-mid">
                  <RefreshCw size={16} className="animate-spin" />
                  Checking supported banks...
                </div>
              ) : connectionError ? (
                <div className="rounded-[10px] border border-error/30 bg-error-light p-4 text-sm text-error">
                  {connectionError}
                </div>
              ) : selectableInstitutions.length === 0 ? (
                <div className="rounded-[10px] border border-[#ecd8bd] bg-[#fcf7f0] p-4 text-sm text-[#7a5a30]">
                  {reauthConnection
                    ? `${reauthConnection.institutionName} is not currently available under its saved name. Use Connect to create a fresh link if the bank has been renamed.`
                    : `No compatible UK banks are currently available for this ${selectedProvider === 'yapily' ? 'Yapily' : 'Enable Banking'} application.`}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {selectableInstitutions.map((institution) => {
                    const consentDays = institution.maximumConsentValiditySeconds == null
                      ? null
                      : Math.max(
                          1,
                          Math.floor(institution.maximumConsentValiditySeconds / (24 * 60 * 60))
                        );

                    return (
                      <button
                        type="button"
                        key={`${institution.provider}:${institution.institutionId}`}
                        onClick={() => handleConnectBank(institution)}
                        disabled={isConnecting}
                        className="group flex min-h-[112px] flex-col items-start rounded-[11px] border border-ledger bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-ink hover:shadow-[3px_3px_0_#1c1c1c] disabled:translate-y-0 disabled:cursor-wait disabled:opacity-50 disabled:shadow-none"
                      >
                        <div className="flex w-full items-start justify-between gap-3">
                          <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[9px] border border-grey-light bg-paper">
                            {institution.logoUrl ? (
                              <img
                                src={institution.logoUrl}
                                alt=""
                                className="h-full w-full object-contain p-1.5"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <Landmark size={17} className="text-grey-dark" />
                            )}
                          </span>
                          {isConnecting && (
                            <RefreshCw size={14} className="animate-spin text-grey-mid" />
                          )}
                        </div>
                        <span className="mt-3 text-sm font-bold text-ink">{institution.name}</span>
                        <span className="mt-1 text-[11.5px] text-grey-mid">
                          {institution.provider === 'yapily' ? 'Yapily' : 'Business AISP'}
                          {consentDays ? ` · up to ${consentDays} days` : ' · bank-managed consent'}
                          {institution.environmentType === 'SANDBOX' ? ' · sandbox' : ''}
                          {institution.beta && institution.environmentType !== 'SANDBOX' ? ' · beta' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-grey-light bg-[#fcfbf9] px-6 py-4">
              <p className="text-[11.5px] leading-relaxed text-grey-mid">
                ChurchCoin requests read-only access to accounts and transactions through {selectedProvider === 'yapily' ? 'Yapily' : 'Enable Banking'}. Your bank credentials are entered with your bank, not ChurchCoin.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ReauthButton: React.FC<{
  disabled: boolean;
  onClick: () => void;
}> = ({ disabled, onClick }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.05em] border border-[#ecd8bd] text-[#a9743f] rounded-[8px] bg-white hover:bg-[#fcf7f0] transition-colors disabled:opacity-50"
    >
      <RefreshCw size={10} />
      Re-auth
    </button>
  );
};

export default BankConnectionsSettings;
