import { can } from "../lib/permissions";
import React, { useState, useMemo, useEffect, useRef, startTransition } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useAction, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { AppUser, Fund, Pledge, Transaction, TransactionType } from '../types';
import { Lock, Plus, Scale, Tag } from 'lucide-react';
import CashEntryWizard from './cashEntry/CashEntryWizard';
import { gbp, dayMonth } from './cashEntry/format';
import Reconciliation from './Reconciliation';
import { notify } from '../lib/notifications';
import { formatLocalDateInputValue } from '../lib/dateUtils';
import { categoryNamesForTransactionTypes, effectiveCategories } from '../lib/transactionCategories';
import { isVoidedTransaction } from '../lib/reportableTransactions';
import { useImportReview } from './statementImport/useImportReview';
import StatementImportWizard from './statementImport/StatementImportWizard';
import { filterInPersonGivingLedgersByMonth, groupInPersonGivingCollections, InPersonGivingLedger } from '../lib/inPersonGiving';
import CashChequeBanking from './CashChequeBanking';
import LinkMovementModal from './transactions/LinkMovementModal';
import JournalTransferModal from './transactions/JournalTransferModal';
import { useGiftAidEnabled } from './app/useGiftAidEnabled';
import NewChooser from './app/NewChooser';
import { linkParamsToRemove, planNewKind } from './app/newChooserRows';
import HubHeader from './hub/HubHeader';
import HubLayout from './hub/HubLayout';
import { NeedsYou, NeedsYouItem } from './hub/NeedsYou';
import { useMediaQuery } from './hub/useMediaQuery';
import { ReceiptCard, ReceiptRow } from './wizard/Receipt';
import WizardFrame from './wizard/WizardFrame';
import { Segmented, btnMd, btnOutline, btnPrimary, eyebrow, tagGrey } from './wizard/ui';
import TransactionAddSheet from './transactions/TransactionAddSheet';
import TransactionBulkBar from './transactions/TransactionBulkBar';
import TransactionCompactTable from './transactions/TransactionCompactTable';
import TransactionDayList from './transactions/TransactionDayList';
import TransactionEditPanel from './transactions/TransactionEditPanel';
import TransactionFilterBar from './transactions/TransactionFilterBar';
import TransactionFilterSheet from './transactions/TransactionFilterSheet';
import TransactionVoidSheet from './transactions/TransactionVoidSheet';
import SmartLinkSheet, { type SmartLinkMatch } from './transactions/SmartLinkSheet';
import BankReviewSheet from './transactions/BankReviewSheet';
import BankAccountSheet from './transactions/BankAccountSheet';
import InPersonGivingList from './transactions/InPersonGivingList';
import type { TransactionListProps } from './transactions/TransactionRow';
import {
  HUB_VIEWS,
  editingAfterSave,
  errorMessage,
  filterTransactions,
  formatSignedNet,
  groupByDay,
  needsYou,
  parseStatusFilter,
  periodTotals,
  type HubView,
  type StatusFilter,
  type TransactionFilters,
} from './transactions/transactionView';

interface Category {
  _id: string;
  name: string;
  transactionType?: "Income" | "Expenditure";
  isRetired?: boolean;
}

interface TransactionManagerProps {
  funds: Fund[];
  pledges: Pledge[];
  categories: Category[];
  currentUser: AppUser;
  initialFundId?: string;
  onPledgeCompleted?: (donorName: string, amount: number) => void;
}

// Pagination for large datasets
const ITEMS_PER_PAGE = 100;
const COMPACT_KEY = 'transactions-hub-compact';

// The dense table is a desktop view, and the choice is remembered on this device.
const readCompactPreference = () => {
  try {
    return window.localStorage.getItem(COMPACT_KEY) === '1';
  } catch {
    return false;
  }
};

const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);

  return debouncedValue;
};

const TransactionManager: React.FC<TransactionManagerProps> = ({
  funds, pledges, categories, currentUser, initialFundId, onPledgeCompleted
}) => {
  const giftAidEnabled = useGiftAidEnabled();
  // Fetch all transactions - virtualization handles rendering performance
  const allTransactions = useQuery(api.queries.transactions.list, {});
  const cashCollectionsResult = useQuery(api.queries.cashCollections.list, {});
  const isLoading = allTransactions === undefined;
  const transactions = useMemo(() => allTransactions ?? [], [allTransactions]);
  const cashCollections = useMemo(() => cashCollectionsResult ?? [], [cashCollectionsResult]);

  // Convex mutations and actions
  const createTransaction = useMutation(api.mutations.transactions.create);
  const updateTransaction = useMutation(api.mutations.transactions.update);
  const bulkUpdateTransactions = useMutation(api.mutations.transactions.bulkUpdate);
  const batchUpdateTransactions = useMutation(api.mutations.transactions.batchUpdate);
  const categorizeTransactionsAI = useAction(api.actions.ai.categorizeTransactions);
  const voidTransaction = useMutation(api.mutations.transactions.voidTransaction);
  const unvoidTransaction = useMutation(api.mutations.transactions.unvoidTransaction);
  const reconcilePledgesAI = useAction(api.actions.ai.reconcilePledges);
  const unlinkTransaction = useMutation(api.mutations.movements.unlink);
  const deleteJournalTransfer = useMutation(api.mutations.movements.deleteJournalTransfer);

  // Bank sync
  const bankConnectionsResult = useQuery(api.queries.bankConnections.getActiveWithMappedAccounts);
  const bankConnections = useMemo(() => bankConnectionsResult || [], [bankConnectionsResult]);
  const bankConnectionsLoaded = bankConnectionsResult !== undefined;

  // Extract category names for backwards compatibility
  const categoryNames = categories.map(c => c.name);
  const importCategories = useMemo(() => effectiveCategories(categories), [categories]);
  // A row already in a retired category keeps it selectable so its select shows the saved value.
  const categoryNamesFor = (type?: TransactionType, current?: string) => {
    const names = categoryNamesForTransactionTypes(importCategories, [type]);
    return current && !names.includes(current) ? [...names, current] : names;
  };
  // Import review batch shared by the statement walkthrough and bank sync.
  const importReview = useImportReview({ funds, categories, ledger: allTransactions, onPledgeCompleted });
  const {
    isReviewOpen,
    isBankReview,
    rows: pendingTransactions,
    statusMessage: categorizationStatusMessage,
    openReview,
    syncFromBank,
  } = importReview;
  const [isBulkProcessingAI, setIsBulkProcessingAI] = useState(false);

  // Smart Link State
  const [isReconciling, setIsReconciling] = useState(false);
  const [pledgeMatches, setPledgeMatches] = useState<SmartLinkMatch[]>([]);
  const [showMatchModal, setShowMatchModal] = useState(false);

  // Statement import walkthrough (file, columns, fix, categorise, check)
  const [showStatementImport, setShowStatementImport] = useState(false);

  // Bank Sync State
  const [showBankSelector, setShowBankSelector] = useState(false);
  // The sync button is disabled while a sync runs, but a "+ New" request can arrive at any time.
  const bankSyncInFlight = useRef(false);

  // "+ Add" opens the same chooser as the shell's "+ New".
  const [showChooser, setShowChooser] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bulkCategoryNames = useMemo(() => {
    const selectedTypes = new Set(
      transactions
        .filter((transaction) => selectedIds.has(transaction._id))
        .map((transaction) => transaction.type)
    );
    return categoryNamesForTransactionTypes(importCategories, selectedTypes);
  }, [importCategories, selectedIds, transactions]);
  // The row open in the edit panel, held by id so it stays current as the list updates.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const canEdit = can(currentUser.role, "ledger.write");
  const canBank = can(currentUser.role, "reconciliation.manage");
  const canDeleteTransfer = can(currentUser.role, "ledger.delete");
  const [view, setView] = useState<HubView>(() =>
    searchParams.get('view') === 'cash-banking' && canBank ? 'Banking' : 'Everything'
  );
  const [expandedGivingIds, setExpandedGivingIds] = useState<Set<string>>(new Set());
  const [editingGivingLedger, setEditingGivingLedger] = useState<InPersonGivingLedger | null>(null);
  const [linkTarget, setLinkTarget] = useState<Transaction | null>(null);
  const [showJournalTransfer, setShowJournalTransfer] = useState(false);

  // Manual Entry State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCashTakingsModal, setShowCashTakingsModal] = useState(false);
  // Only reconciliation users can reach the cash banking view.
  const bankItHandler = canBank ? () => setView('Banking') : undefined;
  const [voidTarget, setVoidTarget] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 200);
  const today = new Date();
  // Status links from the dashboard count rows across all dates.
  const linkedFromStatus = parseStatusFilter(searchParams.get('status')) !== 'all';
  const [filterMonth, setFilterMonth] = useState<number | null>(linkedFromStatus ? null : today.getMonth());
  const [filterYear, setFilterYear] = useState<number | null>(linkedFromStatus ? null : today.getFullYear());
  const [filterCategory, setFilterCategory] = useState('');
  const [filterFund, setFilterFund] = useState(initialFundId || '');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>(() => parseStatusFilter(searchParams.get('status')));
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i,
    label: new Date(2024, i).toLocaleDateString('en-GB', { month: 'long' }),
  }));
  const yearOptions = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  // Client-side pagination for performance
  const [displayLimit, setDisplayLimit] = useState(ITEMS_PER_PAGE);

  const [compact, setCompact] = useState(readCompactPreference);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const isWide = useMediaQuery('(min-width: 1280px)');
  const showCompact = compact && isDesktop;

  // Effect to apply initial fund filter if passed (e.g. navigation from Fund Manager)
  useEffect(() => {
    if (initialFundId) {
        setFilterFund(initialFundId);
    }
  }, [initialFundId]);

  const retiredCategoryNames = useMemo(
    () => new Set(categories.filter((category) => category.isRetired).map((category) => category.name)),
    [categories]
  );

  const filters = useMemo<TransactionFilters>(
    () => ({
      search: debouncedSearchTerm,
      month: filterMonth,
      year: filterYear,
      category: filterCategory,
      fundId: filterFund,
      status: filterStatus,
    }),
    [debouncedSearchTerm, filterMonth, filterYear, filterCategory, filterFund, filterStatus]
  );
  const filteredTransactions = useMemo(
    () => filterTransactions(transactions, filters, retiredCategoryNames),
    [transactions, filters, retiredCategoryNames]
  );
  // Period, fund and search only. The "Needs you" count and the amber prompt use this,
  // so picking a status doesn't hide the work still waiting.
  const scopeRows = useMemo(
    () => filterTransactions(transactions, { ...filters, status: 'all', category: '' }, retiredCategoryNames),
    [transactions, filters, retiredCategoryNames]
  );
  const needsRows = useMemo(
    () => scopeRows.filter((t) => needsYou(t, retiredCategoryNames)),
    [scopeRows, retiredCategoryNames]
  );
  const uncategorisedRows = useMemo(
    () => scopeRows.filter((t) => !isVoidedTransaction(t) && !t.category),
    [scopeRows]
  );

  const isListView = view === 'Everything' || view === 'Needs you';
  const visibleTransactions = useMemo(
    () => (view === 'Needs you' ? filteredTransactions.filter((t) => needsYou(t, retiredCategoryNames)) : filteredTransactions),
    [view, filteredTransactions, retiredCategoryNames]
  );
  const displayedTransactions = useMemo(
    () => visibleTransactions.slice(0, displayLimit),
    [visibleTransactions, displayLimit]
  );
  const dayGroups = useMemo(() => groupByDay(displayedTransactions), [displayedTransactions]);
  const totals = useMemo(() => periodTotals(visibleTransactions), [visibleTransactions]);
  const hasMore = visibleTransactions.length > displayLimit;

  const inPersonGivingLedgers = useMemo(
    () =>
      groupInPersonGivingCollections({
        collections: cashCollections,
        transactions,
        funds,
      }),
    [cashCollections, transactions, funds]
  );
  const filteredInPersonGivingLedgers = useMemo(
    () => filterInPersonGivingLedgersByMonth(inPersonGivingLedgers, filterMonth, filterYear),
    [inPersonGivingLedgers, filterMonth, filterYear]
  );

  const isInPersonGivingLoading = cashCollectionsResult === undefined || isLoading;

  const thisYear = today.getFullYear();
  const thisYearCount = transactions.filter(
    (t) => !isVoidedTransaction(t) && new Date(t.date).getFullYear() === thisYear
  ).length;
  const latestSync = [...bankConnections]
    .filter((connection) => connection.lastSyncAt)
    .sort((a, b) => new Date(b.lastSyncAt!).getTime() - new Date(a.lastSyncAt!).getTime())[0];
  const headerStatus = `${thisYearCount.toLocaleString('en-GB')} this year${
    latestSync?.lastSyncAt
      ? ` · ${latestSync.institutionName} synced ${dayMonth(formatLocalDateInputValue(new Date(latestSync.lastSyncAt)))}`
      : ''
  }`;

  const toggleGivingExpanded = (collectionId: string) => {
    setExpandedGivingIds((current) => {
      const next = new Set(current);
      if (next.has(collectionId)) {
        next.delete(collectionId);
      } else {
        next.add(collectionId);
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    if (!canEdit) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!canEdit) return;
    const allSelected = visibleTransactions.length > 0 && selectedIds.size === visibleTransactions.length;
    setSelectedIds(allSelected ? new Set() : new Set(visibleTransactions.map(t => t._id)));
  };

  const hasFilters =
    searchTerm !== '' || filterMonth !== null || filterYear !== null || filterCategory !== '' || filterStatus !== 'all' || filterFund !== '';

  const clearFilters = () => {
      setSearchTerm('');
      setFilterMonth(null);
      setFilterYear(null);
      setFilterCategory('');
      setFilterFund('');
      setFilterStatus('all');
  };

  const stepMonth = (direction: -1 | 1) => {
    if (filterMonth === null || filterYear === null) return;
    const next = filterMonth + direction;
    if (next < 0) {
      setFilterMonth(11);
      setFilterYear(filterYear - 1);
    } else if (next > 11) {
      setFilterMonth(0);
      setFilterYear(filterYear + 1);
    } else {
      setFilterMonth(next);
    }
  };

  const executeBulkUpdate = async (updates: Partial<Transaction>) => {
      try {
          await bulkUpdateTransactions({
              transactionIds: Array.from(selectedIds) as Id<"transactions">[],
              updates: {
                  category: updates.category,
                  fundId: updates.fundId as Id<"funds"> | undefined,
              }
          });
          setSelectedIds(new Set());
      } catch (error) {
          console.error("Bulk update failed:", error);
          notify(
            "Error",
            error instanceof Error ? error.message : "Failed to update transactions."
          );
      }
  };

  // Suggests categories for the given rows and saves the ones that fit their type.
  const runAutoCategorise = async (ids: Set<string>) => {
      if (ids.size === 0) return;
      setIsBulkProcessingAI(true);
      const targetTransactions = transactions.filter(t => ids.has(t._id));
      const descriptions = targetTransactions.map(t => t.description);
      try {
          const suggestions = await categorizeTransactionsAI({
              descriptions,
              fundNames: funds.map(f => f.name),
              categories: categories.filter((category) => !category.isRetired).map((category) => category.name)
          });
          const updates = [];
          for (let i = 0; i < targetTransactions.length; i++) {
            const t = targetTransactions[i];
            const suggestion = suggestions[i];
            if (!suggestion) continue;
            const suggestedFund = funds.find(f => f.name === suggestion.fundName);
            updates.push({
              transactionId: t._id as Id<"transactions">,
              changes: {
                // The server rejects the whole batch if one category doesn't
                // fit its transaction's type, so drop mismatched suggestions.
                category: categoryNamesFor(t.type).includes(suggestion.category)
                  ? suggestion.category
                  : undefined,
                isGiftAidEligible: suggestion.isGiftAidEligible,
                fundId: suggestedFund?._id ? (suggestedFund._id as Id<"funds">) : undefined,
                donorName: suggestion.donorName || undefined,
              }
            });
          }
          if (updates.length > 0) {
            await batchUpdateTransactions({ updates });
          }
          setSelectedIds(new Set());
      } catch (error) {
          console.error(error);
          notify("Error", "Failed to auto-categorize. Please check API connection.");
      } finally {
          setIsBulkProcessingAI(false);
      }
  };

  // Selects the uncategorised lines and opens them in "Needs you", so each is categorised in the
  // edit panel and saved there. Nothing is written here, so starting again is harmless.
  const startCategorising = () => {
      setFilterStatus('all');
      setFilterCategory('');
      setSelectedIds(new Set(uncategorisedRows.map((t) => t._id)));
      setView('Needs you');
  };

  const handleSmartLinkPledges = async () => {
      setIsReconciling(true);
      try {
          // AI action now fetches unlinked income server-side for complete coverage
          const matches = await reconcilePledgesAI({});
          if (matches.length > 0) {
              setPledgeMatches(matches as SmartLinkMatch[]);
              setShowMatchModal(true);
          } else {
              notify("Notice", "No obvious pledge matches found for unlinked income.");
          }
      } catch (e) {
          console.error(e);
          notify("Error", "Smart Link failed. Please check API connection.");
      } finally {
          setIsReconciling(false);
      }
  };

  const handleConfirmMatch = async (match: SmartLinkMatch) => {
      const t = transactions.find(tx => tx._id === match.transactionId);
      // Find the pledge by the AI-suggested pledgeId to get the proper typed ID
      const matchedPledge = pledges.find(p => p._id === match.pledgeId);

      if (t && matchedPledge) {
          try {
              const result = await updateTransaction({
                  transactionId: t._id as Id<"transactions">,
                  pledgeId: matchedPledge._id as Id<"pledges">, // Use the actual pledge ID from our data
                  donorName: match.donorName || matchedPledge.donorName || t.donorName
              });
              // Check if pledge was completed
              if (result?.pledgeCompleted && onPledgeCompleted) {
                  onPledgeCompleted(result.pledgeCompleted.donorName, result.pledgeCompleted.amount);
              }
          } catch (error) {
              console.error("Failed to link transaction:", error);
              notify("Error", errorMessage(error, "Failed to link this transaction to the pledge."));
              return;
          }
      } else {
          console.error("Could not find transaction or pledge for match:", match);
      }
      setPledgeMatches(prev => prev.filter(m => m !== match));
  };

  const startBankSync = (bankConnectionId: Id<"bankConnections">) => {
    setShowBankSelector(false);
    if (bankSyncInFlight.current) return;
    bankSyncInFlight.current = true;
    void syncFromBank(bankConnectionId).finally(() => {
      bankSyncInFlight.current = false;
    });
  };

  // Bank sync: show selector if multiple banks, otherwise sync directly
  const handleSyncBank = () => {
    if (bankConnections.length === 0) {
      notify("Error", "No bank accounts connected. Please connect a bank account in Settings > Bank Connections first.");
      return;
    }
    if (pendingTransactions.length > 0) {
      openReview();
      notify("Review Import", "Finish or discard the current review batch before starting a new bank sync.");
      return;
    }
    if (bankConnections.length === 1) {
      // Single bank - sync directly
      startBankSync(bankConnections[0]._id);
    } else {
      // Multiple banks - show selector
      setShowBankSelector(true);
    }
  };

  const handleAddSubmit = async (draft: Partial<Transaction>) => {
    if (!draft.amount || !draft.description || !draft.fundId || !draft.category) return;
    try {
        const result = await createTransaction({
            date: draft.date!,
            description: draft.description!,
            amount: Number(draft.amount),
            type: draft.type! as 'Income' | 'Expenditure',
            category: draft.category,
            fundId: draft.fundId as Id<"funds">,
            isGiftAidEligible: draft.isGiftAidEligible,
            donorName: draft.donorName,
            pledgeId: draft.pledgeId as Id<"pledges"> | undefined
        });
        // Check if a pledge was completed
        if (result?.pledgeCompleted && onPledgeCompleted) {
            onPledgeCompleted(result.pledgeCompleted.donorName, result.pledgeCompleted.amount);
        }
        setShowAddModal(false);
    } catch (error) {
        console.error("Failed to create transaction:", error);
        notify("Error", error instanceof Error ? error.message : "Failed to create transaction.");
    }
  };

  const handleOpenVoidModal = (transaction: Transaction) => {
    setVoidTarget(transaction);
    setVoidReason('');
  };

  const handleVoidTransaction = async () => {
    if (!voidTarget) return;
    const reason = voidReason.trim();
    if (reason.length < 3) {
      notify("Reason Required", "Add a short reason before voiding this transaction.");
      return;
    }

    setIsVoiding(true);
    try {
      await voidTransaction({
        transactionId: voidTarget._id as Id<"transactions">,
        reason,
      });
      notify("Transaction Voided", "The transaction has been excluded from financial calculations.");
      setVoidTarget(null);
      setVoidReason('');
    } catch (error) {
      console.error("Failed to void transaction:", error);
      notify("Error", "Failed to void transaction.");
    } finally {
      setIsVoiding(false);
    }
  };

  const handleUnlinkTransaction = async (transaction: Transaction) => {
    try {
      await unlinkTransaction({ transactionId: transaction._id as Id<"transactions"> });
      notify("Unlinked", "This transaction is no longer linked to its other side.");
    } catch (error) {
      notify("Error", error instanceof Error ? error.message : "Failed to unlink transaction.");
    }
  };

  const handleDeleteJournalTransfer = async (transaction: Transaction) => {
    if (!window.confirm("Delete this transfer between funds? Both sides will be removed.")) return;
    try {
      await deleteJournalTransfer({ transactionId: transaction._id as Id<"transactions"> });
      notify("Transfer Deleted", "Both sides of the transfer have been removed.");
      setEditingId(null);
    } catch (error) {
      notify("Error", error instanceof Error ? error.message : "Failed to delete transfer.");
    }
  };

  const handleUnvoidTransaction = async (transaction: Transaction) => {
    try {
      await unvoidTransaction({
        transactionId: transaction._id as Id<"transactions">,
      });
      notify("Transaction Restored", "The transaction is included in financial calculations again.");
    } catch (error) {
      console.error("Failed to restore transaction:", error);
      notify("Error", "Failed to restore transaction.");
    }
  };

  // "+ New" in the shell opens one of these with ?new=<kind>, and cash banking is linked with
  // ?view=cash-banking; either can arrive while this page is mounted. Both params are removed in
  // one replacement once applied (two updaters would each restore the other's param), so the same
  // link works again and a refresh does not repeat it. The ref ignores Strict Mode's effect replay.
  const newKindParam = searchParams.get('new');
  const viewParam = searchParams.get('view');
  const handledNewKind = useRef<string | null>(null);
  useEffect(() => {
    if (!newKindParam) handledNewKind.current = null;
    const step = planNewKind({ param: newKindParam, handled: handledNewKind.current, canEdit, bankConnectionsLoaded });
    const remove = linkParamsToRemove(step, viewParam, newKindParam, handledNewKind.current);
    if (remove.length === 0) return;
    const takeNew = step.type === 'handled';
    const takeView = remove.includes('view');
    if (takeNew) handledNewKind.current = newKindParam;
    setSearchParams((params) => {
      remove.forEach((key) => params.delete(key));
      return params;
    }, { replace: true });
    if (takeView && canBank) {
      setShowReconciliation(false);
      setView('Banking');
    }
    if (!takeNew || !step.modal) return;
    if (step.leaveReconciliation) setShowReconciliation(false);
    switch (step.modal) {
      case 'cashTakings':
        startTransition(() => setShowCashTakingsModal(true));
        break;
      case 'statementImport':
        setShowStatementImport(true);
        break;
      case 'bankSync':
        handleSyncBank();
        break;
      case 'singleEntry':
        setShowAddModal(true);
        break;
      case 'journalTransfer':
        setShowJournalTransfer(true);
        break;
      case 'smartLink':
        void handleSmartLinkPledges();
        break;
    }
    // Runs once per arrival of a param; the handlers are current for that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newKindParam, viewParam, bankConnectionsLoaded, canBank]);

  // Read-only roles can open a row too; the panel shows it as text.
  const editingTransaction = editingId ? transactions.find((t) => t._id === editingId) ?? null : null;
  const editingIndex = editingTransaction ? displayedTransactions.findIndex((t) => t._id === editingTransaction._id) : -1;
  const nextTransaction = editingIndex >= 0 ? displayedTransactions[editingIndex + 1] : undefined;

  // Saves the edit panel's draft. Throws with the server's message when the save is refused.
  const saveEdit = async (draft: Transaction, goNext: boolean) => {
    try {
      const result = await updateTransaction({
        transactionId: draft._id as Id<"transactions">,
        date: draft.date,
        description: draft.description,
        amount: draft.amount,
        type: draft.type,
        category: draft.category,
        fundId: draft.fundId as Id<"funds">,
        isGiftAidEligible: draft.isGiftAidEligible,
        donorName: draft.donorName,
        ...(draft.donorId
          ? { donorId: draft.donorId as Id<"donors"> }
          : {}),
        pledgeId: draft.pledgeId ? (draft.pledgeId as Id<"pledges">) : null,
      });
      // Check if pledge was completed
      if (result?.pledgeCompleted && onPledgeCompleted) {
        onPledgeCompleted(result.pledgeCompleted.donorName, result.pledgeCompleted.amount);
      }
      // The save may finish after another row was opened; only move on from the row it saved.
      const nextId = goNext && nextTransaction ? nextTransaction._id : null;
      setEditingId((current) => editingAfterSave(current, draft._id, nextId));
    } catch (error) {
      console.error("Failed to update transaction:", error);
      notify("Error", "Failed to update transaction.");
      throw new Error(errorMessage(error, "Failed to update transaction."), { cause: error });
    }
  };

  if (showReconciliation && canBank) {
    return <Reconciliation onBack={() => setShowReconciliation(false)} />;
  }

  const listProps: TransactionListProps = {
    funds,
    pledges,
    selectedIds,
    activeId: editingTransaction?._id,
    canEdit,
    canDeleteTransfer,
    onOpen: (transaction) => setEditingId(transaction._id),
    onToggleSelect: toggleSelect,
    onLinkOtherSide: setLinkTarget,
    onUnlink: handleUnlinkTransaction,
    onDeleteTransfer: handleDeleteJournalTransfer,
  };

  const editPanel = (variant: 'panel' | 'sheet') =>
    editingTransaction ? (
      <TransactionEditPanel
        key={editingTransaction._id}
        transaction={editingTransaction}
        funds={funds}
        pledges={pledges}
        categoryNamesFor={categoryNamesFor}
        giftAidEnabled={giftAidEnabled}
        canEdit={canEdit}
        canDeleteTransfer={canDeleteTransfer}
        nextTransaction={nextTransaction}
        onSave={saveEdit}
        onClose={() => setEditingId(null)}
        onVoid={handleOpenVoidModal}
        onRestore={handleUnvoidTransaction}
        onLinkOtherSide={setLinkTarget}
        onUnlink={handleUnlinkTransaction}
        onDeleteTransfer={handleDeleteJournalTransfer}
        variant={variant}
      />
    ) : null;

  // Wide screens keep the edit panel in the right column; narrower ones open it as a sheet.
  const periodLabel =
    filterMonth !== null && filterYear !== null
      ? new Date(filterYear, filterMonth, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : 'This view';
  const totalsCard = isListView ? <TotalsReceipt label={periodLabel} totals={totals} /> : null;
  const receipt =
    isWide && editingTransaction ? (
      <>
        {editPanel('panel')}
        {totalsCard}
      </>
    ) : (
      totalsCard ?? undefined
    );

  const headerActions = (
    <>
      {!canEdit && (
        <span className={`${tagGrey} h-11`}>
          <Lock size={12} aria-hidden="true" /> Read only
        </span>
      )}
      {canBank && (
        <button type="button" onClick={() => setShowReconciliation(true)} className={`${btnOutline} ${btnMd} !w-auto px-4`}>
          <Scale size={16} strokeWidth={1.9} aria-hidden="true" />
          Reconcile
        </button>
      )}
      {canEdit && (
        <button type="button" onClick={() => setShowChooser(true)} className={`${btnPrimary} ${btnMd} !w-auto px-5`}>
          <Plus size={16} strokeWidth={2} aria-hidden="true" />
          Add
        </button>
      )}
    </>
  );

  const viewOptions = canBank ? HUB_VIEWS : HUB_VIEWS.filter((option) => option !== 'Banking');
  const moreCount = (filterStatus !== 'all' ? 1 : 0) + (filterCategory ? 1 : 0);

  const filterBar = (periodOnly: boolean) => (
    <TransactionFilterBar
      search={searchTerm}
      onSearch={setSearchTerm}
      month={filterMonth}
      year={filterYear}
      onMonth={setFilterMonth}
      onYear={setFilterYear}
      onStepMonth={stepMonth}
      monthOptions={monthOptions}
      yearOptions={yearOptions}
      fundId={filterFund}
      funds={funds}
      onFund={setFilterFund}
      moreCount={moreCount}
      onOpenMore={() => setShowMoreFilters(true)}
      hasFilters={hasFilters}
      onClear={clearFilters}
      periodOnly={periodOnly}
    />
  );

  return (
    <>
      {/* Keep announcements mounted when the review modal closes mid-process. */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {categorizationStatusMessage}
      </p>

      <HubLayout receipt={receipt}>
        <HubHeader title="Transactions" status={headerStatus} actions={headerActions} />

        {isReconciling && (
          <p role="status" className="text-sm font-semibold text-sage">Looking for pledge matches…</p>
        )}

        {isListView && (
          <NeedsYou emptyText="Nothing needs you right now.">
            {canEdit && uncategorisedRows.length > 0 && (
              <NeedsYouItem
                tone="amber"
                icon={Tag}
                title={`${uncategorisedRows.length} ${uncategorisedRows.length === 1 ? 'line needs' : 'lines need'} a category`}
                detail="Open each line and choose one. Nothing is saved until you do."
                action="Start"
                onClick={startCategorising}
              />
            )}
          </NeedsYou>
        )}

        <Segmented
          label="Show"
          options={viewOptions}
          value={view}
          onChange={setView}
          counts={{ 'Needs you': needsRows.length }}
        />

        {isListView && (
          <section className="space-y-4" aria-label="Transactions">
            {filterBar(false)}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {canEdit && (
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-grey-dark">
                    <input
                      type="checkbox"
                      checked={visibleTransactions.length > 0 && selectedIds.size === visibleTransactions.length}
                      onChange={handleSelectAll}
                      className="h-[18px] w-[18px] rounded-md accent-ink"
                    />
                    Select all
                  </label>
                )}
                <p className="text-xs text-grey-mid">
                  {isLoading
                    ? 'Loading transactions…'
                    : `Showing ${displayedTransactions.length} of ${visibleTransactions.length} (${transactions.length} in total)`}
                </p>
              </div>
              <button
                type="button"
                aria-pressed={showCompact}
                onClick={() => {
                  const next = !compact;
                  setCompact(next);
                  try {
                    window.localStorage.setItem(COMPACT_KEY, next ? '1' : '0');
                  } catch {
                    // Private browsing can refuse storage; the choice still applies this session.
                  }
                }}
                className={`${btnOutline} ${btnMd} hidden !w-auto px-4 md:inline-flex`}
              >
                {compact ? 'Day view' : 'Compact view'}
              </button>
            </div>

            {!isLoading && displayedTransactions.length === 0 && (
              <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-ledger py-12 text-center">
                <p className="text-sm font-semibold text-ink">No transactions match these filters.</p>
                {hasFilters && <p className="text-sm text-grey-mid">Clear a filter to see more.</p>}
              </div>
            )}

            {showCompact ? (
              displayedTransactions.length > 0 && <TransactionCompactTable rows={displayedTransactions} list={listProps} />
            ) : (
              <TransactionDayList groups={dayGroups} list={listProps} />
            )}

            {hasMore && (
              <button
                type="button"
                onClick={() => setDisplayLimit(prev => prev + ITEMS_PER_PAGE)}
                className={`${btnOutline} ${btnMd} mx-auto !w-auto px-5`}
              >
                Load more ({visibleTransactions.length - displayLimit} left)
              </button>
            )}
          </section>
        )}

        {view === 'Giving' && (
          <section className="space-y-4" aria-label="In-person giving">
            {filterBar(true)}
            <InPersonGivingList
              ledgers={filteredInPersonGivingLedgers}
              isLoading={isInPersonGivingLoading}
              expandedIds={expandedGivingIds}
              onToggle={toggleGivingExpanded}
              canEdit={canEdit}
              onEdit={setEditingGivingLedger}
              giftAidEnabled={giftAidEnabled}
            />
          </section>
        )}

        {view === 'Banking' && canBank && <CashChequeBanking funds={funds} currentUser={currentUser} />}
      </HubLayout>

      {/* Edit sheet below xl. Wide screens use the receipt column instead. */}
      {editingTransaction && !isWide && (
        <WizardFrame ariaLabel="Edit transaction" title="Edit transaction" onClose={() => setEditingId(null)}>
          {editPanel('sheet')}
        </WizardFrame>
      )}

      {isListView && selectedIds.size > 0 && canEdit && (
        <TransactionBulkBar
          count={selectedIds.size}
          busy={isBulkProcessingAI}
          categoryNames={bulkCategoryNames}
          funds={funds}
          onAutoCategorise={() => void runAutoCategorise(selectedIds)}
          onCategory={(category) => void executeBulkUpdate({ category })}
          onFund={(fundId) => void executeBulkUpdate({ fundId: fundId as Id<"funds"> })}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {showChooser && canEdit && <NewChooser role={currentUser.role} onClose={() => setShowChooser(false)} />}

      {showMoreFilters && (
        <TransactionFilterSheet
          status={filterStatus}
          onStatus={setFilterStatus}
          category={filterCategory}
          onCategory={setFilterCategory}
          categoryNames={categoryNames}
          onClear={() => {
            setFilterStatus('all');
            setFilterCategory('');
          }}
          onClose={() => setShowMoreFilters(false)}
        />
      )}

      {showMatchModal && canEdit && (
        <SmartLinkSheet
          matches={pledgeMatches}
          transactions={transactions}
          onConfirm={handleConfirmMatch}
          onIgnore={(match) => setPledgeMatches(prev => prev.filter(m => m !== match))}
          onClose={() => setShowMatchModal(false)}
        />
      )}

      {showAddModal && canEdit && (
        <TransactionAddSheet
          funds={funds}
          pledges={pledges}
          categoryNamesFor={categoryNamesFor}
          giftAidEnabled={giftAidEnabled}
          onSubmit={handleAddSubmit}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {voidTarget && canEdit && (
        <TransactionVoidSheet
          transaction={voidTarget}
          reason={voidReason}
          busy={isVoiding}
          onReason={setVoidReason}
          onConfirm={handleVoidTransaction}
          onClose={() => setVoidTarget(null)}
        />
      )}

      {linkTarget && canEdit && (
        <LinkMovementModal
          transaction={linkTarget}
          transactions={transactions}
          funds={funds}
          onClose={() => setLinkTarget(null)}
        />
      )}

      {showJournalTransfer && canEdit && (
        <JournalTransferModal funds={funds} onClose={() => setShowJournalTransfer(false)} />
      )}

      {showStatementImport && canEdit && (
        <StatementImportWizard
          funds={funds}
          categoryNamesFor={categoryNamesFor}
          review={importReview}
          onReconcile={canBank ? () => {
            setShowStatementImport(false);
            setShowReconciliation(true);
          } : undefined}
          onClose={() => setShowStatementImport(false)}
        />
      )}

      {/* Bank sync review. Statement imports are handled by the walkthrough above. */}
      {isReviewOpen && isBankReview && canEdit && (
        <BankReviewSheet review={importReview} funds={funds} categoryNamesFor={categoryNamesFor} />
      )}

      {showBankSelector && (
        <BankAccountSheet connections={bankConnections} onPick={startBankSync} onClose={() => setShowBankSelector(false)} />
      )}

      {/* Cash giving walkthrough: new collections and edits of an existing one */}
      {showCashTakingsModal && canEdit && (
        <CashEntryWizard
          funds={funds}
          categories={categories}
          storageScope={currentUser._id}
          onClose={() => setShowCashTakingsModal(false)}
          onBankIt={bankItHandler}
        />
      )}

      {editingGivingLedger && canEdit && (
        <CashEntryWizard
          funds={funds}
          categories={categories}
          initialCollection={editingGivingLedger}
          storageScope={currentUser._id}
          onClose={() => setEditingGivingLedger(null)}
          onBankIt={bankItHandler}
        />
      )}
    </>
  );
};

// Money in, money out and net for the rows the view shows. Voided rows and cash banking deposits are left out.
function TotalsReceipt({ label, totals }: { label: string; totals: ReturnType<typeof periodTotals> }) {
  return (
    <ReceiptCard>
      <p className={`${eyebrow} pb-1`}>{label}</p>
      <ReceiptRow label="Money in" value={`+${gbp(totals.moneyIn)}`} />
      <ReceiptRow label="Money out" value={`−${gbp(totals.moneyOut)}`} />
      <ReceiptRow label="Net" value={formatSignedNet(totals.net)} />
    </ReceiptCard>
  );
}

export default TransactionManager;
