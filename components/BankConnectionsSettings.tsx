import { can } from "../lib/permissions";
import { useEffect, useState, type FC } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { Fund, AppUser } from '../types';
import { ChevronRight, Landmark, Link2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { notify } from '../lib/notifications';
import WizardFrame from './wizard/WizardFrame';
import StepFooter from './wizard/StepFooter';
import { btnLg, btnPrimary, card, eyebrow, screenHelp, screenTitle, tagAmber, tagBase, tagSage, txtInput } from './wizard/ui';

interface BankConnectionsSettingsProps {
  funds: Fund[];
  currentUser: AppUser;
  onClose: () => void;
}

type AvailableInstitution = {
  provider: 'yapily';
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

const tagError = `${tagBase} bg-error-light text-error`;

// Lists the church's bank connections. Connecting, renewing and removing happen here; the account-to-fund
// mapping opens under each connection.
const BankConnectionsSettings: FC<BankConnectionsSettingsProps> = ({ funds, currentUser, onClose }) => {
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

  const loadInstitutions = async () => {
    setIsLoadingInstitutions(true);
    setAvailableInstitutions([]);
    setConnectionError(null);

    try {
      const institutions = await listInstitutions({});
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
    if (existingConnection?.provider === 'enable_banking') {
      const message = 'This legacy connection cannot be renewed. Disconnect it and reconnect with Yapily.';
      setConnectionError(message);
      notify('Action required', message);
      return;
    }

    setReauthConnection(existingConnection);
    setIsBankPickerOpen(true);
    await loadInstitutions();
  };

  const handleConnectBank = async (institution: AvailableInstitution) => {
    setIsConnecting(true);
    setConnectionError(null);

    try {
      const { authorizationUrl } = await startConnection({
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

  const getStatusBadge = (status: string, daysUntilReview?: number | null) => {
    switch (status) {
      case 'active':
        if (daysUntilReview !== null && daysUntilReview !== undefined && daysUntilReview <= 7) {
          return <span className={tagAmber}>Review in {daysUntilReview}d</span>;
        }
        return <span className={tagSage}>Connected</span>;
      case 'error':
        return <span className={tagError}>Error</span>;
      case 'consent_expired':
        return <span className={tagError}>Expired</span>;
      case 'pending_reauth':
        return <span className={tagAmber}>Needs renewal</span>;
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
          (!reauthConnection.providerInstitutionId ||
            institution.institutionId === reauthConnection.providerInstitutionId)
      )
    : availableInstitutions;

  const picker = isBankPickerOpen ? (
    <div className="absolute inset-0 z-10 flex flex-col bg-paper" role="dialog" aria-modal="true" aria-labelledby="bank-picker-title">
      <div className="flex shrink-0 items-center gap-2 px-3 pt-3 lg:px-6 lg:pt-5">
        <div className="min-w-0 flex-1 px-2">
          <h3 id="bank-picker-title" className={screenTitle}>
            {reauthConnection ? `Renew ${reauthConnection.institutionName}` : 'Choose a UK bank'}
          </h3>
        </div>
        <button
          type="button"
          onClick={closeBankPicker}
          disabled={isConnecting}
          aria-label="Close bank picker"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-grey-dark hover:bg-white disabled:opacity-50"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 lg:px-8">
        <p className={screenHelp}>UK banks are loaded live from Yapily.</p>
        {isLoadingInstitutions ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-grey-mid">
            <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
            Checking supported banks…
          </div>
        ) : connectionError ? (
          <div className="rounded-2xl border border-error/30 bg-error-light p-4 text-sm text-error">{connectionError}</div>
        ) : selectableInstitutions.length === 0 ? (
          <div className="rounded-2xl border border-[#ecd8bd] bg-[#fcf7f0] p-4 text-sm text-[#7a5a30]">
            {reauthConnection
              ? `${reauthConnection.institutionName} is not currently available under its saved name. Use Connect to create a fresh link if the bank has been renamed.`
              : 'No compatible UK banks are currently available for this Yapily application.'}
          </div>
        ) : (
          <div className="grid gap-2">
            {selectableInstitutions.map((institution) => {
              const consentDays = institution.maximumConsentValiditySeconds == null
                ? null
                : Math.max(1, Math.floor(institution.maximumConsentValiditySeconds / (24 * 60 * 60)));

              return (
                <button
                  type="button"
                  key={`${institution.provider}:${institution.institutionId}`}
                  onClick={() => handleConnectBank(institution)}
                  disabled={isConnecting}
                  className={`${card} flex w-full items-center gap-3.5 text-left transition-colors hover:bg-grey-light disabled:cursor-wait disabled:opacity-50`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-grey-light bg-paper">
                    {institution.logoUrl ? (
                      <img
                        src={institution.logoUrl}
                        alt=""
                        className="h-full w-full object-contain p-1.5"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Landmark size={17} className="text-grey-dark" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[14.5px] text-ink">{institution.name}</b>
                    <span className="block text-xs text-grey-mid">
                      Yapily
                      {consentDays ? ` · up to ${consentDays} days` : ' · bank-managed consent'}
                      {institution.environmentType === 'SANDBOX' ? ' · sandbox' : ''}
                      {institution.beta && institution.environmentType !== 'SANDBOX' ? ' · beta' : ''}
                    </span>
                  </span>
                  {isConnecting ? (
                    <RefreshCw size={14} className="shrink-0 animate-spin text-grey-mid" aria-hidden="true" />
                  ) : (
                    <ChevronRight size={18} className="shrink-0 text-grey-mid" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-5 text-xs leading-relaxed text-grey-mid">
          ChurchCoin requests read-only access to accounts and transactions through Yapily. Your bank credentials are
          entered with your bank, not ChurchCoin.
        </p>
      </div>
    </div>
  ) : undefined;

  return (
    <WizardFrame
      ariaLabel="Bank connections"
      title="Bank connections"
      onClose={onClose}
      overlay={picker}
      footer={
        <StepFooter>
          <button
            type="button"
            onClick={() => openBankPicker()}
            disabled={isConnecting || isLoadingInstitutions}
            className={`${btnPrimary} ${btnLg}`}
          >
            {isLoadingInstitutions ? <RefreshCw size={15} className="animate-spin" aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
            Connect a bank
          </button>
        </StepFooter>
      }
    >
      <h2 className={screenTitle}>Bank connections</h2>
      <p className={screenHelp}>Connected accounts sync transactions. Only mapped accounts sync.</p>

      {isAwaitingCompletion && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#cbd9e8] bg-[#f3f7fb] p-4 text-xs text-[#385a7a]">
          <RefreshCw size={16} className="shrink-0 animate-spin" aria-hidden="true" />
          Yapily authorisation received. Securely exchanging the one-time token and loading your accounts…
        </div>
      )}

      {itemsNeedingAttention.length > 0 && (
        <div className="mb-4 rounded-2xl border border-[#ecd8bd] bg-[#fcf7f0] p-4">
          <h4 className="text-sm font-bold text-[#7a5a30]">Needs your attention</h4>
          <ul className="mt-2 grid gap-1">
            {itemsNeedingAttention.map((item) => (
              <li key={item._id} className="text-xs leading-relaxed text-[#7a5a30]">
                <strong>{item.institutionName}</strong>:{' '}
                {item.provider !== 'yapily' ? (
                  'This legacy connection is no longer supported. Disconnect it and reconnect with Yapily.'
                ) : (
                  <>
                    {item.status === 'consent_expired' && 'Consent has expired. Please re-authenticate.'}
                    {item.status === 'pending_reauth' && 'Consent requires renewal. Please re-authenticate.'}
                    {item.status === 'error' && `Error: ${item.errorMessage || 'Unknown error'}`}
                    {item.daysUntilExpiry !== null && item.daysUntilExpiry <= 7 && item.status === 'active' &&
                      `Consent expires in ${item.daysUntilExpiry} days.`}
                    {item.daysUntilReconfirmation !== null && item.daysUntilReconfirmation <= 7 && item.status === 'active' &&
                      ` Please reconfirm access within ${item.daysUntilReconfirmation} days.`}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {connectionError && !isBankPickerOpen && (
        <p role="alert" className="mb-4 rounded-2xl bg-error-light px-3.5 py-2.5 text-sm text-error">
          {connectionError}
        </p>
      )}

      {bankConnections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ledger p-8 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-ledger bg-paper text-grey-mid">
            <Link2 size={22} aria-hidden="true" />
          </span>
          <h3 className="text-sm font-bold text-ink">No bank connected yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-grey-mid">
            Connect a UK bank to sync transactions through secure Open Banking.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {bankConnections.map((connection) => (
            <li key={connection._id} className={card}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-ledger bg-paper text-grey-dark">
                  <Landmark size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-[14.5px] font-semibold text-ink">{connection.institutionName}</h4>
                  <p className={`${eyebrow} mt-0.5`}>{connection.provider === 'yapily' ? 'Yapily' : 'Legacy provider'}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {getStatusBadge(
                      connection.status,
                      [connection.consentExpiresAt, connection.consentReconfirmBy]
                        .filter((value): value is number => typeof value === 'number')
                        .map((value) => Math.ceil((value - Date.now()) / (24 * 60 * 60 * 1000)))
                        .sort((a, b) => a - b)[0] ?? null
                    )}
                    {connection.lastSyncAt && (
                      <span className="whitespace-nowrap text-xs text-grey-mid">
                        Synced {new Date(connection.lastSyncAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => setEditingItem(editingItem === connection._id ? null : connection._id)}
                    aria-expanded={editingItem === connection._id}
                    aria-label={`${editingItem === connection._id ? 'Hide' : 'Show'} accounts for ${connection.institutionName}`}
                    className="flex h-11 w-11 items-center justify-center rounded-[11px] text-grey-mid hover:bg-grey-light hover:text-ink"
                  >
                    <ChevronRight
                      size={18}
                      aria-hidden="true"
                      className={`transition-transform ${editingItem === connection._id ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {can(currentUser.role, "bank.remove") && (
                    <button
                      type="button"
                      aria-label={`Remove ${connection.institutionName} connection`}
                      onClick={() => handleRemoveConnection(connection._id)}
                      disabled={isRemoving === connection._id}
                      className="flex h-11 w-11 items-center justify-center rounded-[11px] text-grey-mid hover:text-error disabled:opacity-50"
                    >
                      {isRemoving === connection._id ? (
                        <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 size={16} aria-hidden="true" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {connection.provider === 'yapily' &&
                (connection.status === 'consent_expired' ||
                  connection.status === 'pending_reauth' ||
                  connection.status === 'error' ||
                  Boolean(connection.consentReconfirmBy && connection.consentReconfirmBy < Date.now() + 7 * 24 * 60 * 60 * 1000) ||
                  Boolean(connection.consentExpiresAt && connection.consentExpiresAt < Date.now() + 7 * 24 * 60 * 60 * 1000)) && (
                  <button
                    type="button"
                    onClick={() => openBankPicker(connection)}
                    disabled={isConnecting || isLoadingInstitutions}
                    className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-[11px] border border-[#ecd8bd] bg-white px-3.5 text-sm font-bold text-[#a9743f] hover:bg-[#fcf7f0] disabled:opacity-50"
                  >
                    <RefreshCw size={13} aria-hidden="true" />
                    Renew access
                  </button>
                )}

              {editingItem === connection._id && (
                <div className="mt-3 border-t border-ledger pt-3">
                  <p className={`${eyebrow} mb-2`}>Account mapping</p>
                  <ul className="grid gap-2">
                    {connection.accounts.map((account) => (
                      <li key={account.accountId} className="flex flex-col gap-2 rounded-[13px] border border-ledger bg-paper p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{account.name}</p>
                          <p className="mt-0.5 text-xs text-grey-mid">{renderAccountDetails(account)}</p>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-grey-mid">
                          <span className="shrink-0">Goes to</span>
                          <select
                            aria-label={`Fund for ${account.name}`}
                            value={account.fundId || ''}
                            onChange={(e) => handleUpdateFundMapping(
                              connection._id,
                              account.accountId,
                              e.target.value ? e.target.value as Id<"funds"> : undefined
                            )}
                            className={`${txtInput} h-11 w-full min-w-0 sm:w-48`}
                          >
                            <option value="">Not mapped</option>
                            {funds.map((fund) => (
                              <option key={fund._id} value={fund._id}>
                                {fund.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-grey-mid">Each account can map to one fund. Unmapped accounts don't sync.</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 rounded-2xl border border-[#ecd8bd] bg-[#fcf7f0] px-3.5 py-3 text-xs leading-relaxed text-[#7a5a30]">
        <strong className="font-bold">UK Open Banking:</strong> Connections are read-only and provider-specific.
        You'll be told before access needs reconfirming or renewing, without losing imported history or fund mappings.
      </p>
    </WizardFrame>
  );
};

export default BankConnectionsSettings;
