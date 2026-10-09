import { can } from "../lib/permissions";
import React, { useState, useMemo, useEffect, useRef, startTransition } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useAction, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { AppUser, Fund, Pledge, Transaction, TransactionType } from '../types';
import { Plus, Check, FileSpreadsheet, Building2, Edit2, X, Save, Filter, Calendar, Tag, CheckCircle2, RotateCcw, CheckSquare, Wallet, Loader2, Sparkles, Link as LinkIcon, Search, Lock, ArrowLeft, ArrowRight, ArrowLeftRight, Wand2, AlertTriangle, RefreshCw, Banknote, ChevronDown, ChevronRight, Scale, Link2, Unlink, Trash2 } from 'lucide-react';
import CashEntryWizard from './cashEntry/CashEntryWizard';
import Reconciliation from './Reconciliation';
import DonorSearchInput from './DonorSearchInput';
import { notify } from '../lib/notifications';
import { formatLocalDateInputValue } from '../lib/dateUtils';
import { categoryNamesForTransactionTypes, effectiveCategories } from '../lib/transactionCategories';
import { filterFundBalanceRows, isUnlinkedMovementLeg, isVoidedTransaction } from '../lib/reportableTransactions';
import { linkState } from '../lib/movementMatching';
import { useImportReview } from './statementImport/useImportReview';
import StatementImportWizard from './statementImport/StatementImportWizard';
import ReviewTable from './statementImport/ReviewTable';
import { roundMoney, sumMoney } from '../convex/lib/money';
import { filterInPersonGivingLedgersByMonth, groupInPersonGivingCollections, InPersonGivingLedger } from '../lib/inPersonGiving';
import CashChequeBanking from './CashChequeBanking';
import ImportCategorizationProgress from './ImportCategorizationProgress';
import LinkMovementModal from './transactions/LinkMovementModal';
import JournalTransferModal from './transactions/JournalTransferModal';
import { useGiftAidEnabled } from './app/useGiftAidEnabled';
import { linkParamsToRemove, planNewKind } from './app/newChooserRows';
import { tabBarClearance } from './app/MobileTabBar';

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

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'voided', label: 'Voided' },
  { value: 'reconciled', label: 'Reconciled' },
  { value: 'unreconciled', label: 'Pending' },
  { value: 'unlinked', label: 'Unlinked Income' },
  { value: 'awaiting-link', label: 'Waiting for other side' },
  { value: 'needs-reclassifying', label: 'Needs reclassifying' },
] as const;
type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number]['value'];
const parseStatusFilter = (value: string | null): StatusFilter =>
  STATUS_FILTER_OPTIONS.find((option) => option.value === value)?.value ?? 'all';

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
  const transactions = allTransactions ?? [];
  const cashCollections = cashCollectionsResult ?? [];

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
  const bankConnections = bankConnectionsResult || [];

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
    duplicateWarnings,
    alreadyImportedRows,
    isCategorising: isProcessingAI,
    categorisingCount: categorizationTransactionCount,
    statusMessage: categorizationStatusMessage,
    isSyncingBank,
    isFetchingMoreBank: isFetchingMoreBankTransactions,
    hasMoreBankRows,
    updateRow: updatePendingTransactionAt,
    removeRow: removePendingTransactionAt,
    pairing,
    openReview,
    syncFromBank,
    fetchNextBankBatch,
    assignFundToAll,
    includeAlreadyImported,
    categorise,
    confirm,
    clear: clearReview,
  } = importReview;
  const [isBulkProcessingAI, setIsBulkProcessingAI] = useState(false);

  // Smart Link State
  const [isReconciling, setIsReconciling] = useState(false);
  const [pledgeMatches, setPledgeMatches] = useState<any[]>([]);
  const [showMatchModal, setShowMatchModal] = useState(false);
  
  // Statement import walkthrough (file, columns, fix, categorise, check)
  const [showStatementImport, setShowStatementImport] = useState(false);

  // Bank Sync State
  const [showBankSelector, setShowBankSelector] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bulkCategoryNames = useMemo(() => {
    const selectedTypes = new Set(
      transactions
        .filter((transaction) => selectedIds.has(transaction._id))
        .map((transaction) => transaction.type)
    );
    return categoryNamesForTransactionTypes(importCategories, selectedTypes);
  }, [importCategories, selectedIds, transactions]);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTransactionTab, setActiveTransactionTab] = useState<'all' | 'inPerson' | 'cashChequeBanking'>(() =>
    searchParams.get('view') === 'cash-banking' && can(currentUser.role, "reconciliation.manage") ? 'cashChequeBanking' : 'all'
  );
  const [expandedGivingIds, setExpandedGivingIds] = useState<Set<string>>(new Set());
  const [editingGivingLedger, setEditingGivingLedger] = useState<InPersonGivingLedger | null>(null);
  const [linkTarget, setLinkTarget] = useState<Transaction | null>(null);
  const [showJournalTransfer, setShowJournalTransfer] = useState(false);

  // Manual Entry State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCashTakingsModal, setShowCashTakingsModal] = useState(false);
  // Only reconciliation users can reach the cash banking tab.
  const bankItHandler = can(currentUser.role, 'reconciliation.manage')
    ? () => setActiveTransactionTab('cashChequeBanking')
    : undefined;
  const [voidTarget, setVoidTarget] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);
  const [newTransaction, setNewTransaction] = useState<Partial<Transaction>>({
      type: 'Income' as TransactionType,
      date: formatLocalDateInputValue(new Date()),
      isGiftAidEligible: false,
      category: '',
      fundId: funds[0]?._id
  });

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

  // Date filter options (matching Reports page)
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i,
    label: new Date(2024, i).toLocaleDateString('en-GB', { month: 'long' }),
  }));
  const yearOptions = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  // Client-side pagination for performance
  const [displayLimit, setDisplayLimit] = useState(ITEMS_PER_PAGE); 

  // Effect to apply initial fund filter if passed (e.g. navigation from Fund Manager)
  useEffect(() => {
    if (initialFundId) {
        setFilterFund(initialFundId);
    }
  }, [initialFundId]);

  const canEdit = can(currentUser.role, "ledger.write");
  const editingLinked = editingTransaction !== null && ['linked', 'journal'].includes(linkState(editingTransaction).status);

  const retiredCategoryNames = useMemo(
    () => new Set(categories.filter((category) => category.isRetired).map((category) => category.name)),
    [categories]
  );

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Global Search
      if (debouncedSearchTerm) {
          const lowerTerm = debouncedSearchTerm.toLowerCase();
          const matchesDesc = t.description.toLowerCase().includes(lowerTerm);
          const matchesCat = t.category.toLowerCase().includes(lowerTerm);
          const matchesDonor = t.donorName?.toLowerCase().includes(lowerTerm);
          const matchesAmount = t.amount.toString().includes(lowerTerm);

          if (!matchesDesc && !matchesCat && !matchesDonor && !matchesAmount) return false;
      }

      // Month/Year Filter
      if (filterMonth !== null || filterYear !== null) {
        const txDate = new Date(t.date);
        if (filterYear !== null && txDate.getFullYear() !== filterYear) return false;
        if (filterMonth !== null && txDate.getMonth() !== filterMonth) return false;
      }

      // Category (Dropdown)
      if (filterCategory && t.category !== filterCategory) return false;

      // Fund (Dropdown) - compare as strings since Convex IDs are strings
      if (filterFund && t.fundId !== filterFund) return false;

      // Status
      if (filterStatus === 'active' && isVoidedTransaction(t)) return false;
      if (filterStatus === 'voided' && !isVoidedTransaction(t)) return false;
      if (filterStatus === 'reconciled' && !t.isReconciled) return false;
      if (filterStatus === 'unreconciled' && t.isReconciled) return false;
      // Unlinked: Income transactions without a linked pledge (for manual intervention)
      if (filterStatus === 'unlinked' && (t.type !== 'Income' || t.pledgeId)) return false;
      if (filterStatus === 'awaiting-link' && !isUnlinkedMovementLeg(t)) return false;
      if (filterStatus === 'needs-reclassifying' && (isVoidedTransaction(t) || !retiredCategoryNames.has(t.category))) return false;

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, debouncedSearchTerm, filterMonth, filterYear, filterCategory, filterFund, filterStatus, retiredCategoryNames]);

  // Summary strip totals for the current filtered view: money moving in and out
  // of funds (no voided rows, no cash banking deposits, so banked cash isn't
  // counted twice). In minus out is the net. The review count covers every
  // non-voided row.
  const stripTotals = useMemo(() => {
    const fundRows = filterFundBalanceRows(filteredTransactions);
    const totalIn = sumMoney(fundRows.filter((t) => t.type === TransactionType.INCOME), (t) => t.amount);
    const totalOut = sumMoney(fundRows.filter((t) => t.type === TransactionType.EXPENDITURE), (t) => t.amount);
    const needsReview = filteredTransactions.filter(
      (t) => !isVoidedTransaction(t) && (!t.isReconciled || !t.category)
    ).length;
    return { totalIn, totalOut, net: roundMoney(totalIn - totalOut), needsReview };
  }, [filteredTransactions]);

  const stripPeriodLabel =
    filterMonth !== null && filterYear !== null
      ? new Date(filterYear, filterMonth, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : 'Filtered view';

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

  // Limit displayed transactions for performance
  const displayedTransactions = useMemo(() => {
    return filteredTransactions.slice(0, displayLimit);
  }, [filteredTransactions, displayLimit]);

  const hasMore = filteredTransactions.length > displayLimit;

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

  const relevantPledges = useMemo(() => {
      // Always include the currently linked pledge so it shows in the dropdown, even if name filter doesn't match
      const linkedPledge = editingTransaction?.pledgeId
          ? pledges.find(p => p._id === editingTransaction.pledgeId)
          : null;

      const donorSearch = editingTransaction?.donorName?.toLowerCase();

      const suggestions = pledges.filter(p => {
          // Avoid duplicates
          if (linkedPledge && p._id === linkedPledge._id) return false;

          // Match name
          if (donorSearch && p.donorName.toLowerCase().includes(donorSearch)) return true;

          // Match ID
          if (editingTransaction?.donorId && p.donorId === editingTransaction.donorId) return true;

          return false;
      });

      return linkedPledge ? [linkedPledge, ...suggestions] : suggestions;
  }, [editingTransaction?.donorName, editingTransaction?.donorId, editingTransaction?.pledgeId, pledges]);

  const relevantPledgesForNew = useMemo(() => {
      if (!newTransaction?.donorName) return [];
      return pledges.filter(p =>
          (p.donorName && p.donorName.toLowerCase().includes(newTransaction.donorName!.toLowerCase()))
      );
  }, [newTransaction?.donorName, pledges]);

  const handleSelectAll = () => {
      if (!canEdit) return;
      if (selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(filteredTransactions.map(t => t._id)));
      }
  };

  const handleSelectOne = (id: string) => {
      if (!canEdit) return;
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      setSelectedIds(newSet);
  };

  const clearFilters = () => {
      setSearchTerm('');
      setFilterMonth(null);
      setFilterYear(null);
      setFilterCategory('');
      setFilterFund('');
      setFilterStatus('all');
  };

  const handlePreviousMonth = () => {
    if (filterMonth === null || filterYear === null) return;
    if (filterMonth === 0) {
      setFilterMonth(11);
      setFilterYear(filterYear - 1);
    } else {
      setFilterMonth(filterMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (filterMonth === null || filterYear === null) return;
    if (filterMonth === 11) {
      setFilterMonth(0);
      setFilterYear(filterYear + 1);
    } else {
      setFilterMonth(filterMonth + 1);
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

  const handleBulkAutoCategorize = async () => {
      if (selectedIds.size === 0) return;
      setIsBulkProcessingAI(true);
      const targetTransactions = transactions.filter(t => selectedIds.has(t._id));
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

  const handleSmartLinkPledges = async () => {
      setIsReconciling(true);
      try {
          // AI action now fetches unlinked income server-side for complete coverage
          const matches = await reconcilePledgesAI({});
          if (matches.length > 0) {
              setPledgeMatches(matches);
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

  const handleConfirmMatch = async (match: any) => {
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
              setPledgeMatches(prev => prev.filter(m => m !== match));
              if (pledgeMatches.length <= 1) setShowMatchModal(false);
          } catch (error) {
              console.error("Failed to link transaction:", error);
              notify("Error", error instanceof Error ? error.message : "Failed to link this transaction to the pledge.");
          }
      } else {
          console.error("Could not find transaction or pledge for match:", match);
          setPledgeMatches(prev => prev.filter(m => m !== match));
      }
  };

  // The sync button is disabled while a sync runs, but a "+ New" request can arrive at any time.
  const bankSyncInFlight = useRef(false);
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


  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTransaction.amount && newTransaction.description && newTransaction.fundId && newTransaction.category) {
        try {
            const result = await createTransaction({
                date: newTransaction.date!,
                description: newTransaction.description!,
                amount: Number(newTransaction.amount),
                type: newTransaction.type! as 'Income' | 'Expenditure',
                category: newTransaction.category,
                fundId: newTransaction.fundId as Id<"funds">,
                isGiftAidEligible: newTransaction.isGiftAidEligible,
                donorName: newTransaction.donorName,
                pledgeId: newTransaction.pledgeId as Id<"pledges"> | undefined
            });
            // Check if a pledge was completed
            if (result?.pledgeCompleted && onPledgeCompleted) {
                onPledgeCompleted(result.pledgeCompleted.donorName, result.pledgeCompleted.amount);
            }
            setShowAddModal(false);
            // Reset
            setNewTransaction({
                type: 'Income' as TransactionType,
                date: formatLocalDateInputValue(new Date()),
                isGiftAidEligible: false,
                category: '',
                fundId: funds[0]?._id
            });
        } catch (error) {
            console.error("Failed to create transaction:", error);
            notify("Error", error instanceof Error ? error.message : "Failed to create transaction.");
        }
    }
  };

  // "+ New" in the app shell opens one of these with ?new=<kind>. The param is removed once
  // handled, so a refresh does not repeat it; the ref stops Strict Mode's effect replay doing so.
  // "+ New" in the shell opens one of these with ?new=<kind>, and cash banking is linked with
  // ?view=cash-banking; either can arrive while this page is mounted. Both params are removed in
  // one replacement once applied (two updaters would each restore the other's param), so the same
  // link works again and a refresh does not repeat it. The ref ignores Strict Mode's effect replay.
  const newKindParam = searchParams.get('new');
  const viewParam = searchParams.get('view');
  const handledNewKind = useRef<string | null>(null);
  const bankConnectionsLoaded = bankConnectionsResult !== undefined;
  useEffect(() => {
    if (!newKindParam) handledNewKind.current = null;
    const step = planNewKind({ param: newKindParam, handled: handledNewKind.current, canEdit, bankConnectionsLoaded });
    const remove = linkParamsToRemove(step, viewParam);
    if (remove.length === 0) return;
    const takeNew = step.type === 'handled';
    const takeView = remove.includes('view');
    if (takeNew) handledNewKind.current = newKindParam;
    setSearchParams((params) => {
      remove.forEach((key) => params.delete(key));
      return params;
    }, { replace: true });
    if (takeView && can(currentUser.role, 'reconciliation.manage')) {
      setShowReconciliation(false);
      setActiveTransactionTab('cashChequeBanking');
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
    }
    // Runs once per arrival of a param; the handlers are current for that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newKindParam, viewParam, bankConnectionsLoaded, currentUser.role]);

  const formatDateUK = (dateString: string) => {
      try {
          return new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
      } catch {
          return dateString;
      }
  };

  if (showReconciliation && can(currentUser.role, "reconciliation.manage")) {
    return <Reconciliation onBack={() => setShowReconciliation(false)} />;
  }

  return (
    <div className="ledger-space-y-[22px] animate-enter max-w-7xl mx-auto pb-20">
      {/* Keep announcements mounted when the review modal closes mid-process. */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {categorizationStatusMessage}
      </p>
      <header className="swiss-card-static p-6 md:p-[26px] flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h2 className="text-[32px] leading-tight font-bold text-ink tracking-tight">Transactions</h2>
          <p className="text-grey-mid mt-2 text-[15px] font-medium">Every gift, payment, and transfer, categorized and reconciled.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
            {!canEdit && (
                <div className="flex items-center gap-2 px-3 py-1 bg-grey-light rounded-lg text-xs font-bold text-grey-mid uppercase tracking-wide">
                    <Lock size={12} /> Read Only
                </div>
            )}
            {canEdit && (
                <>
                <button
                    onClick={handleSmartLinkPledges}
                    disabled={isReconciling}
                    className="inline-flex items-center whitespace-nowrap gap-2 px-4 py-[11px] rounded-xl border border-[#e3e1dc] bg-white text-sm font-semibold text-ink hover:border-[#c9c5be] transition-colors disabled:opacity-60"
                >
                    {isReconciling ? <Loader2 size={16} strokeWidth={1.9} className="animate-spin text-grey-mid"/> : <Wand2 size={16} strokeWidth={1.9} className="text-grey-mid" />}
                    Smart Link
                </button>
                <button
                    onClick={handleSyncBank}
                    disabled={isSyncingBank}
                    className="inline-flex items-center whitespace-nowrap gap-2 px-4 py-[11px] rounded-xl border border-[#e3e1dc] bg-white text-sm font-semibold text-ink hover:border-[#c9c5be] transition-colors disabled:opacity-60"
                >
                    {isSyncingBank ? <Loader2 size={16} strokeWidth={1.9} className="animate-spin text-grey-mid"/> : <Building2 size={16} strokeWidth={1.9} className="text-grey-mid" />}
                    Sync Bank
                    {bankConnections.length > 0 && (
                      <span className="ml-0.5 px-1.5 py-0.5 bg-sage-light text-sage-dark rounded-sm text-[10px] font-bold">
                        {bankConnections.length}
                      </span>
                    )}
                </button>
                <button
                    onClick={() => setShowStatementImport(true)}
                    className="inline-flex items-center whitespace-nowrap gap-2 px-4 py-[11px] rounded-xl border border-[#e3e1dc] bg-white text-sm font-semibold text-ink hover:border-[#c9c5be] transition-colors"
                >
                    <FileSpreadsheet size={16} strokeWidth={1.9} className="text-grey-mid"/>
                    Import CSV
                </button>
                {can(currentUser.role, "reconciliation.manage") && (
                    <button
                        onClick={() => setShowReconciliation(true)}
                        className="inline-flex items-center whitespace-nowrap gap-2 px-4 py-[11px] rounded-xl border border-[#e3e1dc] bg-white text-sm font-semibold text-ink hover:border-[#c9c5be] transition-colors"
                    >
                        <Scale size={16} strokeWidth={1.9} className="text-grey-mid" />
                        Reconcile
                    </button>
                )}
                <button
                    onClick={() => setShowJournalTransfer(true)}
                    className="inline-flex items-center whitespace-nowrap gap-2 px-4 py-[11px] rounded-xl border border-[#e3e1dc] bg-white text-sm font-semibold text-ink hover:border-[#c9c5be] transition-colors"
                >
                    <ArrowLeftRight size={16} strokeWidth={1.9} className="text-grey-mid" />
                    New transfer
                </button>
                <button
                    onClick={() => startTransition(() => setShowCashTakingsModal(true))}
                    className="inline-flex items-center whitespace-nowrap gap-2 px-[18px] py-[11px] rounded-xl bg-ink text-white text-sm font-semibold hover:bg-charcoal transition-colors shadow-[0_6px_16px_-8px_rgba(28,25,23,0.5)]"
                >
                    <Banknote size={16} strokeWidth={1.9} />
                    Record Cash
                </button>
                </>
            )}
        </div>
      </header>

      {/* Summary strip — one panel with internal dividers */}
      <div className="swiss-card-static grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
        {([
          { label: 'Money in', value: `+£${stripTotals.totalIn.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: stripPeriodLabel, bar: '#6b8e6b', valueColor: '#557555' },
          { label: 'Money out', value: `−£${stripTotals.totalOut.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: stripPeriodLabel, bar: null, valueColor: '#1c1917' },
          { label: 'Net movement', value: `${stripTotals.net < 0 ? '−' : '+'}£${Math.abs(stripTotals.net).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: 'This period', bar: stripTotals.net >= 0 ? '#6b8e6b' : '#c64545', valueColor: stripTotals.net >= 0 ? '#557555' : '#b53d3d' },
          { label: 'Needs review', value: String(stripTotals.needsReview), sub: 'Unreconciled or uncategorized', bar: '#c79a5f', valueColor: '#a9743f' },
        ] as const).map((s, i, arr) => (
          <div key={s.label} className={`relative px-6 py-5 ${i < arr.length - 1 ? 'lg:border-r border-[#efeee9]' : ''}`}>
            {s.bar && (
              <span className="absolute left-0 top-[18px] bottom-[18px] w-[3px] rounded-r-sm" style={{ background: s.bar }} />
            )}
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-grey-mid whitespace-nowrap">{s.label}</div>
            <div className="font-mono text-[26px] font-bold tracking-tight mt-2 mb-1 whitespace-nowrap" style={{ color: s.valueColor }}>{s.value}</div>
            <div className="text-[12.5px] text-grey-mid whitespace-nowrap overflow-hidden text-ellipsis">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-b border-ledger">
        <button
          type="button"
          onClick={() => setActiveTransactionTab('all')}
          className={`px-4 py-[11px] text-xs font-bold uppercase tracking-[0.06em] border-b-2 transition-colors ${
            activeTransactionTab === 'all'
              ? 'border-ink text-ink'
              : 'border-transparent text-grey-mid hover:text-ink'
          }`}
        >
          All Transactions
        </button>
        <button
          type="button"
          onClick={() => setActiveTransactionTab('inPerson')}
          className={`px-4 py-[11px] text-xs font-bold uppercase tracking-[0.06em] border-b-2 transition-colors ${
            activeTransactionTab === 'inPerson'
              ? 'border-ink text-ink'
              : 'border-transparent text-grey-mid hover:text-ink'
          }`}
        >
          In-Person Giving
        </button>
        {can(currentUser.role, "reconciliation.manage") && (
            <button
              type="button"
              onClick={() => setActiveTransactionTab('cashChequeBanking')}
              className={`px-4 py-[11px] text-xs font-bold uppercase tracking-[0.06em] border-b-2 transition-colors ${
                activeTransactionTab === 'cashChequeBanking'
                  ? 'border-ink text-ink'
                  : 'border-transparent text-grey-mid hover:text-ink'
              }`}
            >
              Cash/cheque Banking
            </button>
        )}
      </div>

      {activeTransactionTab === 'all' && (
      <>
      {/* Filter Bar */}
      <div className="swiss-card-static p-3.5 flex flex-wrap gap-3 items-center">
          {/* Global Search */}
          <div className="relative flex-1 min-w-[220px] max-w-[380px]">
             <Search size={16} strokeWidth={1.9} className="absolute left-[13px] top-1/2 -translate-y-1/2 text-grey-mid" />
             <input
                type="text"
                placeholder="Search transactions, donors, or categories…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-10 pl-[38px] pr-3.5 text-sm text-ink border border-[#e3e1dc] rounded-[10px] bg-white outline-hidden focus:border-[#c79a5f] transition-colors"
             />
          </div>

          {/* Month/Year Filter with navigation */}
          <div className="flex items-center h-10 bg-white border border-[#e3e1dc] rounded-[10px] overflow-hidden">
              <button
                onClick={handlePreviousMonth}
                disabled={filterMonth === null || filterYear === null}
                className="w-[34px] h-full inline-flex items-center justify-center text-grey-mid hover:bg-grey-light transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ArrowLeft size={15} strokeWidth={2} />
              </button>
              <div className="flex items-center gap-2 px-2.5">
                <Calendar size={15} strokeWidth={1.9} className="text-grey-mid shrink-0" />
                <select
                  value={filterMonth ?? ''}
                  onChange={(e) => setFilterMonth(e.target.value === '' ? null : Number(e.target.value))}
                  className="appearance-none text-[13px] font-medium text-grey-dark outline-hidden bg-transparent cursor-pointer"
                >
                  <option value="">All Months</option>
                  {monthOptions.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select
                  value={filterYear ?? ''}
                  onChange={(e) => setFilterYear(e.target.value === '' ? null : Number(e.target.value))}
                  className="appearance-none text-[13px] font-medium text-grey-dark outline-hidden bg-transparent cursor-pointer"
                >
                  <option value="">All Years</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleNextMonth}
                disabled={filterMonth === null || filterYear === null}
                className="w-[34px] h-full inline-flex items-center justify-center text-grey-mid hover:bg-grey-light transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ArrowRight size={15} strokeWidth={2} />
              </button>
          </div>

          {/* Status Filter */}
          <div className="relative h-10">
              <select value={filterStatus} onChange={(e) => setFilterStatus(parseStatusFilter(e.target.value))} className={`h-full w-[130px] pl-[13px] pr-8 border border-[#e3e1dc] text-[13px] font-medium bg-white rounded-[10px] outline-hidden appearance-none cursor-pointer ${filterStatus !== 'all' ? 'text-ink' : 'text-grey-dark'}`}>
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
              </select>
              <Filter size={13} strokeWidth={1.9} className="absolute right-[11px] top-1/2 -translate-y-1/2 text-grey-mid pointer-events-none" />
          </div>

           {/* Fund Filter */}
           <div className="relative h-10">
              <select value={filterFund} onChange={(e) => setFilterFund(e.target.value)} className={`h-full w-[132px] pl-[13px] pr-8 border border-[#e3e1dc] text-[13px] font-medium bg-white rounded-[10px] outline-hidden appearance-none cursor-pointer ${filterFund ? 'text-ink' : 'text-grey-dark'}`}>
                  <option value="">All Funds</option>
                  {funds.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
              </select>
              <Wallet size={13} strokeWidth={1.9} className="absolute right-[11px] top-1/2 -translate-y-1/2 text-grey-mid pointer-events-none" />
          </div>

           {/* Category Filter */}
          <div className="relative h-10">
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={`h-full w-[130px] pl-[13px] pr-8 border border-[#e3e1dc] text-[13px] font-medium bg-white rounded-[10px] outline-hidden appearance-none cursor-pointer ${filterCategory ? 'text-ink' : 'text-grey-dark'}`}>
                  <option value="">Category…</option>
                  {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <Tag size={13} strokeWidth={1.9} className="absolute right-[11px] top-1/2 -translate-y-1/2 text-grey-mid pointer-events-none" />
          </div>

          {(searchTerm || filterMonth !== null || filterYear !== null || filterCategory || filterStatus !== 'all' || filterFund) && (
              <button onClick={clearFilters} className="h-10 px-3 text-xs text-error font-bold uppercase tracking-[0.04em] inline-flex items-center gap-1.5 transition-colors hover:bg-error-light rounded-[10px]">
                  <RotateCcw size={13} strokeWidth={2} /> Clear
              </button>
          )}
      </div>

      {/* Ledger Table */}
      <div className="swiss-card-static overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#fcfbf9] border-b border-[#efeee9]">
              <tr className="[&>th]:text-[11px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.08em] [&>th]:text-grey-mid [&>th]:whitespace-nowrap">
                <th className="w-11 pl-6 pr-2 py-[13px]">
                    {canEdit && (
                         <input type="checkbox" checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0} onChange={handleSelectAll} className="w-[18px] h-[18px] align-middle rounded-md border-[#cfc9c1] accent-[#a9743f] cursor-pointer" />
                    )}
                </th>
                <th className="px-4 py-[13px]">Date</th>
                <th className="px-4 py-[13px]">Description</th>
                <th className="px-4 py-[13px]">Category</th>
                <th className="px-4 py-[13px]">Fund</th>
                <th className="px-4 py-[13px] text-right">Credit / Debit</th>
                <th className="px-4 py-[13px] text-center">Status</th>
                <th className="px-4 py-[13px] text-center">Void</th>
                <th className="px-4 py-[13px]"></th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-grey-mid">
                    <Loader2 size={32} className="mx-auto mb-2 animate-spin opacity-40" />
                    <p className="text-sm">Loading transactions...</p>
                  </td>
                </tr>
              ) : displayedTransactions.length > 0 ? (
                displayedTransactions.map((t) => {
                  const fund = funds.find(f => f._id === t.fundId);
                  const isSelected = selectedIds.has(t._id);
                  const linkedPledge = pledges.find(p => p._id === t.pledgeId);
                  const link = linkState(t);
                  const isJournal = link.status === 'journal';

                  return (
                    <tr key={t._id} className={`group transition-colors border-b border-[#efeee9] last:border-0 ${isSelected ? 'bg-[#fbf5ec]' : isVoidedTransaction(t) ? 'bg-[#fdf5f5] opacity-60' : 'hover:bg-[#fcfbf9]'}`}>
                      <td className="pl-6 pr-2 py-3.5">
                          {canEdit && (
                               <input type="checkbox" checked={isSelected} onChange={() => handleSelectOne(t._id)} className="w-[18px] h-[18px] align-middle rounded-md border-[#cfc9c1] accent-[#a9743f] cursor-pointer" />
                          )}
                      </td>
                      <td className="px-4 py-3.5 text-grey-mid font-mono text-[12.5px] whitespace-nowrap">{formatDateUK(t.date)}</td>
                      <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                             <div className="font-semibold text-ink text-[14.5px] truncate max-w-[280px]">{t.description}</div>
                             {t.pledgeId && <LinkIcon size={13} strokeWidth={2} className="text-[#6b8e6b] shrink-0" />}
                             {isVoidedTransaction(t) && (
                              <span
                                className="px-1.5 py-0.5 rounded-[5px] border border-error/30 bg-error-light text-[9.5px] font-bold text-error uppercase tracking-[0.08em] shrink-0"
                                title={t.voidReason ? `Void reason: ${t.voidReason}` : "Voided transaction"}
                              >
                                Voided
                              </span>
                             )}
                             {link.status === 'linked' && (
                              <span className="px-1.5 py-0.5 rounded-[5px] border border-sage/30 bg-sage-light text-[9.5px] font-bold text-sage-dark uppercase tracking-[0.08em] shrink-0" title="Linked to its other side">
                                Linked
                              </span>
                             )}
                             {isJournal && (
                              <span className="px-1.5 py-0.5 rounded-[5px] border border-ledger bg-paper text-[9.5px] font-bold text-grey-dark uppercase tracking-[0.08em] shrink-0" title="Transfer between funds made in ChurchCoin">
                                Journal
                              </span>
                             )}
                          </div>
                          {t.donorName && <div className="text-[10.5px] text-grey-mid font-mono mt-[3px] uppercase tracking-[0.05em]">Ref: {t.donorName}</div>}
                          {linkedPledge && <div className="text-[10px] text-sage-dark font-mono mt-0.5 uppercase tracking-[0.05em]">Linked to {funds.find(f=>f._id===linkedPledge.fundId)?.name}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        {t.category ? (
                          <span className="px-[9px] py-[3px] rounded-md text-[11.5px] font-semibold bg-[#f3f1ed] text-grey-dark border border-ledger whitespace-nowrap">
                            {t.category}
                          </span>
                        ) : (
                          <span className="text-[11.5px] font-semibold text-error">Uncategorized</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-grey-dark text-[13px] font-medium whitespace-nowrap">{fund?.name}</td>
                      <td className={`px-4 py-3.5 text-right font-mono text-[15px] font-bold whitespace-nowrap ${t.type === 'Income' ? 'text-sage-dark' : 'text-ink'}`}>
                        {t.type === 'Income' ? '+' : '−'}£{t.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                          {t.isReconciled ? <Check size={16} strokeWidth={2} className="mx-auto text-[#6b8e6b]" /> : <div className="w-2 h-2 rounded-full bg-[#d6d3cd] mx-auto"></div>}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                          {!isJournal && (canEdit ? (
                            isVoidedTransaction(t) ? (
                              <button
                                type="button"
                                onClick={() => handleUnvoidTransaction(t)}
                                className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg border border-ledger bg-white text-grey-mid hover:text-sage-dark hover:border-sage transition-colors"
                                title="Restore transaction to financial calculations"
                              >
                                <RotateCcw size={14} strokeWidth={2} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenVoidModal(t)}
                                className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg border border-ledger bg-white text-grey-mid hover:text-error hover:border-error transition-colors"
                                title="Void transaction and exclude it from financial calculations"
                              >
                                <X size={14} strokeWidth={2} />
                              </button>
                            )
                          ) : (
                            isVoidedTransaction(t) && <X size={14} className="mx-auto text-error/60" />
                          ))}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                          {canEdit && link.status === 'waiting' && (
                              <button type="button" onClick={() => setLinkTarget(t)} className="text-grey-mid hover:text-sage-dark transition-colors p-1" title="Link other side" aria-label="Link other side">
                                  <Link2 size={15} strokeWidth={1.9} />
                              </button>
                          )}
                          {canEdit && link.status === 'linked' && (
                              <button type="button" onClick={() => handleUnlinkTransaction(t)} className="text-grey-mid hover:text-sage-dark transition-colors p-1" title="Unlink from its other side" aria-label="Unlink">
                                  <Unlink size={15} strokeWidth={1.9} />
                              </button>
                          )}
                          {link.status === 'journal' && can(currentUser.role, "ledger.delete") && (
                              <button type="button" onClick={() => handleDeleteJournalTransfer(t)} className="text-grey-mid hover:text-error transition-colors p-1" title="Delete transfer" aria-label="Delete transfer">
                                  <Trash2 size={15} strokeWidth={1.9} />
                              </button>
                          )}
                          {canEdit && (
                              <button onClick={() => setEditingTransaction(t)} className="text-grey-mid hover:text-ink transition-colors p-1" title="Edit">
                                  <Edit2 size={15} strokeWidth={1.9} />
                              </button>
                          )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-grey-mid">
                    <Filter size={32} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No transactions match your query.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Load More / Footer */}
        {hasMore && (
          <div className="border-t border-[#efeee9] px-6 py-3 flex justify-center">
            <button
              onClick={() => setDisplayLimit(prev => prev + ITEMS_PER_PAGE)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] text-grey-dark hover:text-ink hover:bg-grey-light rounded-lg transition-colors"
            >
              Load More ({filteredTransactions.length - displayLimit} remaining)
            </button>
          </div>
        )}
        {displayedTransactions.length > 0 && (
          <div className="border-t border-[#efeee9] px-6 py-3.5">
            <span className="text-[12.5px] text-grey-mid font-mono">
              Showing {displayedTransactions.length} of {filteredTransactions.length} filtered ({transactions.length} total)
            </span>
          </div>
        )}
      </div>
      </>
      )}

      {activeTransactionTab === 'inPerson' && (
        <>
        <div className="swiss-card-static p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center h-10 bg-white border border-[#e3e1dc] rounded-[10px] overflow-hidden">
            <button
              onClick={handlePreviousMonth}
              disabled={filterMonth === null || filterYear === null}
              className="w-[34px] h-full inline-flex items-center justify-center text-grey-mid hover:bg-grey-light transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowLeft size={15} strokeWidth={2} />
            </button>
            <div className="flex items-center gap-2 px-2.5">
              <Calendar size={15} strokeWidth={1.9} className="text-grey-mid shrink-0" />
              <select
                value={filterMonth ?? ''}
                onChange={(e) => setFilterMonth(e.target.value === '' ? null : Number(e.target.value))}
                className="appearance-none text-[13px] font-medium text-grey-dark outline-hidden bg-transparent cursor-pointer"
              >
                <option value="">All Months</option>
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <select
                value={filterYear ?? ''}
                onChange={(e) => setFilterYear(e.target.value === '' ? null : Number(e.target.value))}
                className="appearance-none text-[13px] font-medium text-grey-dark outline-hidden bg-transparent cursor-pointer"
              >
                <option value="">All Years</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleNextMonth}
              disabled={filterMonth === null || filterYear === null}
              className="w-[34px] h-full inline-flex items-center justify-center text-grey-mid hover:bg-grey-light transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowRight size={15} strokeWidth={2} />
            </button>
          </div>
          {(filterMonth !== null || filterYear !== null) && (
            <button onClick={() => { setFilterMonth(null); setFilterYear(null); }} className="h-10 px-3 text-xs text-error font-bold uppercase tracking-[0.04em] inline-flex items-center gap-1.5 hover:bg-error-light rounded-[10px] transition-colors">
              <RotateCcw size={13} strokeWidth={2} /> Clear
            </button>
          )}
        </div>
        <div className="swiss-card-static overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#fcfbf9] border-b border-[#efeee9]">
                <tr className="[&>th]:text-[11px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.08em] [&>th]:text-grey-mid [&>th]:whitespace-nowrap">
                  <th className="px-6 py-[13px]">Week Ending</th>
                  <th className="px-6 py-[13px]">Fund / Status</th>
                  <th className="px-6 py-[13px] text-right">Total</th>
                  <th className="px-6 py-[13px] w-24"></th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {isInPersonGivingLoading ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-grey-mid">
                      <Loader2 size={32} className="mx-auto mb-2 animate-spin opacity-40" />
                      <p className="text-sm">Loading in-person giving...</p>
                    </td>
                  </tr>
                ) : filteredInPersonGivingLedgers.length > 0 ? (
                  filteredInPersonGivingLedgers.map((ledger) => {
                    const isExpanded = expandedGivingIds.has(ledger.collectionId);
                    const cashTotal = ledger.rows.reduce((sum, row) => sum + row.cash, 0);
                    const pdqTotal = ledger.rows.reduce((sum, row) => sum + row.pdq, 0);
                    const chequeTotal = ledger.rows.reduce((sum, row) => sum + row.cheque, 0);
                    const serviceTotal = ledger.rows.reduce((sum, row) => sum + row.total, 0);
                    const namedDonationTotal = ledger.namedDonations.reduce((sum, donation) => sum + donation.amount, 0);

                    return (
                      <React.Fragment key={ledger.collectionId}>
                        <tr className="hover:bg-[#fcfbf9] transition-colors">
                          <td className="px-6 py-4 border-b border-[#efeee9]">
                            <div className="font-bold text-ink text-sm">{formatDateUK(ledger.weekEndingDate)}</div>
                          </td>
                          <td className="px-6 py-4 border-b border-[#efeee9]">
                            <div className="ledger-space-y-1">
                              {ledger.fundTotals.length > 0 ? (
                                ledger.fundTotals.map((fundTotal) => (
                                  <div key={fundTotal.fundId} className="flex items-center justify-between gap-4 text-sm text-ink font-medium">
                                    <span>{fundTotal.fundName}</span>
                                    <span className="font-mono">£{fundTotal.total.toFixed(2)}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-sm text-ink font-medium">Unassigned fund</div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 border-b border-[#efeee9] text-right font-mono text-sm font-bold text-sage">
                            £{ledger.total.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 border-b border-[#efeee9] text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => setEditingGivingLedger(ledger)}
                                  className="p-1.5 rounded-sm hover:bg-grey-light text-grey-mid hover:text-ink transition-colors"
                                  aria-label="Edit in-person giving"
                                >
                                  <Edit2 size={15} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleGivingExpanded(ledger.collectionId)}
                                className="p-1.5 rounded-sm hover:bg-grey-light text-grey-mid hover:text-ink transition-colors"
                                aria-label={isExpanded ? 'Collapse week' : 'Expand week'}
                              >
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={4} className="p-4 bg-paper border-b border-ledger">
                              <div className="ledger-space-y-4">
                                {ledger.rows.length > 0 && (
                                  <div>
                                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-grey-mid">
                                      Service Totals
                                    </div>
                              <div className="overflow-x-auto border border-ledger bg-white">
                                <table className="w-full border-collapse text-xs">
                                  <thead className="bg-grey-light">
                                    <tr>
                                      <th className="border border-ledger px-3 py-2 text-left">Day</th>
                                      <th className="border border-ledger px-3 py-2 text-left">Service Date</th>
                                      <th className="border border-ledger px-3 py-2 text-left">Service / Note</th>
                                      <th className="border border-ledger px-3 py-2 text-right">Cash</th>
                                      <th className="border border-ledger px-3 py-2 text-right">PDQ</th>
                                      <th className="border border-ledger px-3 py-2 text-right">Cheque</th>
                                      <th className="border border-ledger px-3 py-2 text-right">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ledger.rows.map((row) => (
                                      <tr key={row.id}>
                                        <td className="border border-ledger px-3 py-2 font-mono text-grey-mid">{row.day}</td>
                                        <td className="border border-ledger px-3 py-2 font-mono">{formatDateUK(row.serviceDate)}</td>
                                        <td className="border border-ledger px-3 py-2 font-medium text-ink">{row.serviceNote}</td>
                                        <td className="border border-ledger px-3 py-2 text-right font-mono">£{row.cash.toFixed(2)}</td>
                                        <td className="border border-ledger px-3 py-2 text-right font-mono">£{row.pdq.toFixed(2)}</td>
                                        <td className="border border-ledger px-3 py-2 text-right font-mono">£{row.cheque.toFixed(2)}</td>
                                        <td className="border border-ledger px-3 py-2 text-right font-mono font-bold">£{row.total.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                    <tr className="bg-grey-light font-bold">
                                      <td colSpan={3} className="border border-ledger px-3 py-2">TOTAL</td>
                                      <td className="border border-ledger px-3 py-2 text-right font-mono">£{cashTotal.toFixed(2)}</td>
                                      <td className="border border-ledger px-3 py-2 text-right font-mono">£{pdqTotal.toFixed(2)}</td>
                                      <td className="border border-ledger px-3 py-2 text-right font-mono">£{chequeTotal.toFixed(2)}</td>
                                      <td className="border border-ledger px-3 py-2 text-right font-mono">£{serviceTotal.toFixed(2)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                                  </div>
                                )}
                                {ledger.namedDonations.length > 0 && (
                                  <div>
                                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-grey-mid">
                                      Named Donations
                                    </div>
                                    <div className="overflow-x-auto border border-ledger bg-white">
                                      <table className="w-full border-collapse text-xs">
                                        <thead className="bg-grey-light">
                                          <tr>
                                            <th className="border border-ledger px-3 py-2 text-left">Donor</th>
                                            <th className="border border-ledger px-3 py-2 text-left">Category</th>
                                            <th className="border border-ledger px-3 py-2 text-left">Fund</th>
                                            <th className="border border-ledger px-3 py-2 text-left">Method</th>
                                            {giftAidEnabled && <th className="border border-ledger px-3 py-2 text-center">Gift Aid</th>}
                                            <th className="border border-ledger px-3 py-2 text-right">Amount</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {ledger.namedDonations.map((donation) => (
                                            <tr key={donation.id}>
                                              <td className="border border-ledger px-3 py-2 font-medium text-ink">{donation.donorName}</td>
                                              <td className="border border-ledger px-3 py-2">{donation.category}</td>
                                              <td className="border border-ledger px-3 py-2">{donation.fundName}</td>
                                              <td className="border border-ledger px-3 py-2">{donation.paymentMethod ?? "-"}</td>
                                              {giftAidEnabled && <td className="border border-ledger px-3 py-2 text-center">{donation.isGiftAidEligible ? "Yes" : "No"}</td>}
                                              <td className="border border-ledger px-3 py-2 text-right font-mono font-bold">£{donation.amount.toFixed(2)}</td>
                                            </tr>
                                          ))}
                                          <tr className="bg-grey-light font-bold">
                                            <td colSpan={giftAidEnabled ? 5 : 4} className="border border-ledger px-3 py-2">TOTAL</td>
                                            <td className="border border-ledger px-3 py-2 text-right font-mono">£{namedDonationTotal.toFixed(2)}</td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                                <div className="flex items-center justify-between border border-ledger bg-white px-3 py-2 text-xs font-bold">
                                  <span>COLLECTION TOTAL</span>
                                  <span className="font-mono">£{ledger.total.toFixed(2)}</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-grey-mid">
                      <Banknote size={32} className="mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No in-person giving matches this period.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {activeTransactionTab === 'cashChequeBanking' && can(currentUser.role, "reconciliation.manage") && (
        <CashChequeBanking funds={funds} currentUser={currentUser} />
      )}

      {/* Floating Bulk Actions - Fixed to bottom of viewport */}
      {activeTransactionTab === 'all' && selectedIds.size > 0 && canEdit && createPortal(
          <div
            className={`fixed ${tabBarClearance} md:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)] bg-ink text-white rounded-[14px] py-3 pl-5 pr-4 shadow-[0_18px_44px_-16px_rgba(0,0,0,0.55)] flex items-center gap-4 md:mb-[env(safe-area-inset-bottom)]`}
            style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
          >
              <span className="font-mono text-[12.5px] font-bold tracking-[0.06em] text-[#6b8e6b] pr-4 border-r border-white/[0.18] shrink-0 whitespace-nowrap">{selectedIds.size} SELECTED</span>
              <div className="flex items-center gap-2.5 overflow-x-auto">
                  <button onClick={handleBulkAutoCategorize} disabled={isBulkProcessingAI} className="inline-flex items-center gap-[7px] px-3 py-[7px] rounded-lg bg-white/[0.07] hover:bg-white/[0.14] transition-colors text-xs font-bold uppercase tracking-[0.04em] whitespace-nowrap disabled:opacity-60">
                      {isBulkProcessingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} strokeWidth={1.9} className="text-[#e0b878]" />}
                      <span className="hidden sm:inline">AI Auto-Cat</span>
                  </button>
                  {/* Inline Category Dropdown */}
                  <select
                      className="bg-white/[0.07] text-white text-xs font-semibold rounded-lg px-2.5 py-[7px] border border-white/[0.16] cursor-pointer outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
                      value=""
                      disabled={bulkCategoryNames.length === 0}
                      title={bulkCategoryNames.length === 0 ? "Select income or expenditure on its own to change category" : undefined}
                      onChange={(e) => e.target.value && executeBulkUpdate({ category: e.target.value })}
                  >
                      <option value="" className="text-ink">Category…</option>
                      {bulkCategoryNames.map(c => <option key={c} value={c} className="text-ink">{c}</option>)}
                  </select>
                  {/* Inline Fund Dropdown */}
                  <select
                      className="bg-white/[0.07] text-white text-xs font-semibold rounded-lg px-2.5 py-[7px] border border-white/[0.16] cursor-pointer outline-hidden"
                      value=""
                      onChange={(e) => e.target.value && executeBulkUpdate({ fundId: e.target.value as Id<"funds"> })}
                  >
                      <option value="" className="text-ink">Fund…</option>
                      {funds.map(f => <option key={f._id} value={f._id} className="text-ink">{f.name}</option>)}
                  </select>
              </div>
              <button onClick={() => setSelectedIds(new Set())} className="text-white/60 hover:text-white transition-colors shrink-0">
                  <X size={18} strokeWidth={2} />
              </button>
          </div>,
          document.body
      )}


      {/* Smart Link Review Modal */}
      {showMatchModal && canEdit && createPortal(
          <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-lg shadow-soft-lg w-full max-w-3xl animate-enter border border-ledger max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-[#efeee9] flex justify-between items-center bg-sage-light rounded-t-lg">
                    <h3 className="font-bold text-sage-dark text-sm uppercase tracking-wide flex items-center gap-2">
                        <Wand2 size={16} /> Smart Link Suggestions
                    </h3>
                    <button onClick={() => setShowMatchModal(false)} className="text-sage hover:text-sage-dark"><X size={16} /></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 bg-paper/50">
                    <p className="text-sm text-grey-mid mb-4">
                        We found <strong>{pledgeMatches.length}</strong> possible matches for unlinked income.
                    </p>
                    <div className="ledger-space-y-3">
                        {pledgeMatches.map((m, i) => {
                            const txn = transactions.find(t => t._id === m.transactionId);
                            if (!txn) return null;
                            return (
                                <div key={i} className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-4 rounded-sm border border-sage/30 shadow-xs gap-4">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-baseline gap-2">
                                            <span className="font-mono text-xs text-grey-mid">{txn.date}</span>
                                            <span className="font-medium text-ink text-sm">{txn.description}</span>
                                            <span className="font-mono text-xs font-bold text-sage">£{txn.amount}</span>
                                        </div>
                                        <div className="flex gap-2 text-[10px] items-center">
                                            <span className="text-sage-dark font-bold uppercase">Match Reason:</span>
                                            <span className="text-grey-dark italic">{m.reason}</span>
                                        </div>
                                        <div className="text-[10px] text-grey-mid uppercase tracking-wide">
                                            Suggestion: Link to <strong>{m.donorName}</strong>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                         <button onClick={() => setPledgeMatches(prev => prev.filter(match => match !== m))} className="text-[10px] border border-ledger text-grey-mid hover:text-error hover:border-error/30 px-3 py-1.5 rounded-sm font-bold uppercase flex items-center gap-1 transition-colors bg-white">
                                            <X size={12}/> Ignore
                                        </button>
                                        <button onClick={() => handleConfirmMatch(m)} className="text-[10px] bg-sage hover:bg-sage-dark text-white px-3 py-1.5 rounded-sm font-bold uppercase flex items-center gap-1 transition-colors shadow-xs">
                                            <Check size={12}/> Confirm
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
             </div>
          </div>,
          document.body
      )}

      {/* New Transaction Modal */}
      {showAddModal && canEdit && createPortal(
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-start justify-center overflow-y-auto p-4 pt-8 sm:pt-12">
            <div className="bg-white rounded-lg shadow-soft-lg w-full max-w-lg animate-enter border border-ledger my-auto sm:my-8">
                <div className="sticky top-0 p-4 border-b border-[#efeee9] flex justify-between items-center bg-paper rounded-t-lg z-10">
                    <h3 className="font-bold text-ink text-sm uppercase tracking-wide">New Entry</h3>
                    <button onClick={() => setShowAddModal(false)} className="text-grey-mid hover:text-grey-dark">
                        <X size={16} />
                    </button>
                </div>
                <form onSubmit={handleAddSubmit} className="p-4 sm:p-6 ledger-space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="min-w-0">
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Date</label>
                            <input
                                type="date"
                                required
                                value={newTransaction.date}
                                onChange={(e) => setNewTransaction({...newTransaction, date: e.target.value})}
                                className="block w-full min-w-0 appearance-none p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden transition-colors font-mono"
                            />
                        </div>
                        <div>
                             <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Amount</label>
                             <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid text-xs">£</span>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    required
                                    value={newTransaction.amount || ''} 
                                    onChange={(e) => setNewTransaction({...newTransaction, amount: parseFloat(e.target.value)})}
                                    className="w-full pl-6 p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden transition-colors font-mono"
                                    placeholder="0.00"
                                />
                             </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Description</label>
                        <input 
                            type="text" 
                            required
                            value={newTransaction.description || ''} 
                            onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
                            className="w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden transition-colors"
                            placeholder="e.g. Sunday Collection Cash"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Category</label>
                            <select
                                value={newTransaction.category}
                                onChange={(e) => setNewTransaction({...newTransaction, category: e.target.value})}
                                className="w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden"
                            >
                                {categoryNamesFor(newTransaction.type).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Fund</label>
                             <select
                                value={newTransaction.fundId}
                                onChange={(e) => setNewTransaction({...newTransaction, fundId: e.target.value})}
                                className="w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden"
                            >
                                {funds.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <div>
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Type</label>
                             <select
                                value={newTransaction.type}
                                onChange={(e) => {
                                    const type = e.target.value as TransactionType;
                                    const categoryStillValid = categoryNamesFor(type).includes(newTransaction.category ?? '');
                                    setNewTransaction({
                                        ...newTransaction,
                                        type,
                                        category: categoryStillValid ? newTransaction.category : '',
                                    });
                                }}
                                className="w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden"
                            >
                                <option value="Income">Income</option>
                                <option value="Expenditure">Expenditure</option>
                            </select>
                        </div>
                        <div>
                             <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Donor Name (Optional)</label>
                            <input
                                type="text"
                                value={newTransaction.donorName || ''}
                                onChange={(e) => setNewTransaction({...newTransaction, donorName: e.target.value})}
                                className="w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden transition-colors"
                                placeholder="Name or Ref..."
                            />
                        </div>
                    </div>

                    {newTransaction.type === 'Income' && (
                        <div>
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Link to Pledge / Schedule</label>
                            <select
                                value={newTransaction.pledgeId || ''}
                                onChange={(e) => setNewTransaction({...newTransaction, pledgeId: e.target.value || undefined})}
                                className="w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden"
                            >
                                <option value="">-- No Linked Pledge --</option>
                                {relevantPledgesForNew.map(p => {
                                    const fundName = funds.find(f => f._id === p.fundId)?.name || 'Unknown Fund';
                                    return (
                                        <option key={p._id} value={p._id}>
                                            {fundName}: £{p.amount} ({p.frequency}) - {p.status}
                                        </option>
                                    );
                                })}
                            </select>
                             {relevantPledgesForNew.length === 0 && newTransaction.donorName && (
                                <p className="text-[10px] text-grey-mid mt-1 italic">No pledges found for donor "{newTransaction.donorName}"</p>
                            )}
                        </div>
                    )}

                    {giftAidEnabled && (
                    <div className="flex gap-6 pt-2">
                         <label className="flex items-center gap-2 cursor-pointer group">
                             <input 
                                type="checkbox" 
                                checked={newTransaction.isGiftAidEligible || false}
                                onChange={(e) => setNewTransaction({...newTransaction, isGiftAidEligible: e.target.checked})}
                                className="rounded-sm border-slate-300 text-ink focus:ring-0 w-4 h-4"
                            />
                            <span className="text-sm text-grey-dark group-hover:text-ink">Gift Aid Eligible</span>
                        </label>
                    </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-[#efeee9] mt-4">
                        <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-paper rounded-sm transition-colors">Cancel</button>
                        <button type="submit" className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2">
                            <Plus size={14} /> Add Entry
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
      )}

      {/* Edit Transaction Modal */}
      {editingTransaction && canEdit && createPortal(
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-start justify-center overflow-y-auto p-4 pt-8 sm:pt-12">
            <div className="bg-white rounded-lg shadow-soft-lg w-full max-w-lg animate-enter border border-ledger my-auto sm:my-8">
                <div className="sticky top-0 p-4 border-b border-[#efeee9] flex justify-between items-center bg-paper rounded-t-lg z-10">
                    <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Edit Transaction</h3>
                    <button onClick={() => setEditingTransaction(null)} className="text-grey-mid hover:text-grey-dark">
                        <X size={16} />
                    </button>
                </div>
                <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (editingTransaction) {
                        try {
                            const result = await updateTransaction({
                                transactionId: editingTransaction._id as Id<"transactions">,
                                date: editingTransaction.date,
                                description: editingTransaction.description,
                                amount: editingTransaction.amount,
                                type: editingTransaction.type,
                                category: editingTransaction.category,
                                fundId: editingTransaction.fundId as Id<"funds">,
                                isGiftAidEligible: editingTransaction.isGiftAidEligible,
                                donorName: editingTransaction.donorName,
                                ...(editingTransaction.donorId
                                  ? { donorId: editingTransaction.donorId as Id<"donors"> }
                                  : {}),
                                pledgeId: editingTransaction.pledgeId ? (editingTransaction.pledgeId as Id<"pledges">) : null,
                            });
                            // Check if pledge was completed
                            if (result?.pledgeCompleted && onPledgeCompleted) {
                                onPledgeCompleted(result.pledgeCompleted.donorName, result.pledgeCompleted.amount);
                            }
                            setEditingTransaction(null);
                        } catch (error) {
                            console.error("Failed to update transaction:", error);
                            notify("Error", "Failed to update transaction.");
                        }
                    }
                }} className="p-4 sm:p-6 ledger-space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="min-w-0">
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Date</label>
                            <input
                                type="date"
                                required
                                value={editingTransaction.date}
                                onChange={(e) => setEditingTransaction({...editingTransaction, date: e.target.value})}
                                className="block w-full min-w-0 appearance-none p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden transition-colors font-mono"
                            />
                        </div>
                        <div>
                             <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Amount</label>
                             <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid text-xs">£</span>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    required
                                    value={editingTransaction.amount}
                                    disabled={editingLinked}
                                    onChange={(e) => setEditingTransaction({...editingTransaction, amount: parseFloat(e.target.value)})}
                                    className="w-full pl-6 p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden transition-colors font-mono"
                                />
                             </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Description</label>
                        <input 
                            type="text" 
                            required
                            value={editingTransaction.description} 
                            onChange={(e) => setEditingTransaction({...editingTransaction, description: e.target.value})}
                            className="w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden transition-colors"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Category</label>
                            <select
                                value={editingTransaction.category}
                                disabled={editingLinked}
                                onChange={(e) => setEditingTransaction({...editingTransaction, category: e.target.value})}
                                className="w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden"
                            >
                                {categoryNamesFor(editingTransaction.type, editingTransaction.category).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Fund</label>
                             <select
                                value={editingTransaction.fundId}
                                disabled={editingLinked}
                                onChange={(e) => setEditingTransaction({...editingTransaction, fundId: e.target.value})}
                                className="w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden"
                            >
                                {funds.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <div>
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Type</label>
                             <select
                                value={editingTransaction.type}
                                disabled={editingLinked}
                                onChange={(e) => {
                                    const type = e.target.value as TransactionType;
                                    const categoryStillValid = categoryNamesFor(type).includes(editingTransaction.category);
                                    setEditingTransaction({
                                        ...editingTransaction,
                                        type,
                                        category: categoryStillValid ? editingTransaction.category : '',
                                    });
                                }}
                                className="w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden"
                            >
                                <option value="Income">Income</option>
                                <option value="Expenditure">Expenditure</option>
                            </select>
                        </div>
                        <div>
                             <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Donor Name (Optional)</label>
                            <DonorSearchInput
                                value={editingTransaction.donorName || ''}
                                onChange={(name) => setEditingTransaction({...editingTransaction, donorName: name})}
                                onDonorSelect={(donor) => setEditingTransaction({
                                    ...editingTransaction,
                                    donorName: donor.donorName,
                                    donorId: donor.donorId ?? undefined,
                                    isGiftAidEligible: donor.isGiftAidActive,
                                })}
                                placeholder="Search or add donor..."
                            />
                        </div>
                    </div>
                    {editingLinked && (
                        <p className="text-xs text-grey-mid -mt-2">Linked to its other side. Unlink to change these.</p>
                    )}

                    {editingTransaction.type === 'Income' && (
                        <div>
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Link to Pledge / Schedule</label>
                            <select
                                value={editingTransaction.pledgeId || ''}
                                onChange={(e) => {
                                    const pid = e.target.value;
                                    setEditingTransaction({
                                        ...editingTransaction, 
                                        pledgeId: pid || undefined,
                                        // Optional: auto-fill donor name if selecting a pledge and name is empty
                                        donorName: (editingTransaction.donorName || !pid) ? editingTransaction.donorName : pledges.find(pl => pl._id === pid)?.donorName
                                    });
                                }}
                                className="w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden"
                            >
                                <option value="">-- No Linked Pledge --</option>
                                {relevantPledges.map(p => {
                                    const fundName = funds.find(f => f._id === p.fundId)?.name || 'Unknown Fund';
                                    return (
                                        <option key={p._id} value={p._id}>
                                            {fundName}: £{p.amount} ({p.frequency}) - {p.status}
                                        </option>
                                    );
                                })}
                            </select>
                            {relevantPledges.length === 0 && editingTransaction.donorName && !editingTransaction.pledgeId && (
                                <p className="text-[10px] text-grey-mid mt-1 italic">No pledges found for donor "{editingTransaction.donorName}"</p>
                            )}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-x-6 gap-y-3 pt-2">
                        {giftAidEnabled && (
                         <label className="flex items-center gap-2 cursor-pointer group">
                             <input
                                type="checkbox"
                                checked={editingTransaction.isGiftAidEligible || false}
                                onChange={(e) => setEditingTransaction({...editingTransaction, isGiftAidEligible: e.target.checked})}
                                className="rounded-sm border-slate-300 text-ink focus:ring-0 w-4 h-4"
                            />
                            <span className="text-sm text-grey-dark group-hover:text-ink">Gift Aid Eligible</span>
                        </label>
                        )}

                        {isVoidedTransaction(editingTransaction) && (
                          <div className="flex items-center gap-2 text-sm text-error">
                            <X size={14} />
                            <span>
                              Voided{editingTransaction.voidReason ? `: ${editingTransaction.voidReason}` : ''}
                            </span>
                          </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-[#efeee9] mt-4">
                        <button type="button" onClick={() => setEditingTransaction(null)} className="px-4 py-2 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-paper rounded-sm transition-colors">Cancel</button>
                        <button type="submit" className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2">
                            <Save size={14} /> Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
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

      {voidTarget && canEdit && createPortal(
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-soft-lg w-full max-w-md border border-ledger animate-enter">
            <div className="p-4 border-b border-[#efeee9] flex justify-between items-center bg-paper rounded-t-lg">
              <div>
                <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Void Transaction</h3>
                <p className="text-xs text-grey-mid mt-1">
                  This excludes the transaction from reports, totals, pledge progress, and AI summaries.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="text-grey-mid hover:text-grey-dark"
                disabled={isVoiding}
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 ledger-space-y-4">
              <div className="rounded-sm border border-ledger bg-paper p-3">
                <div className="text-xs font-bold text-ink truncate">{voidTarget.description}</div>
                <div className="text-xs text-grey-mid font-mono mt-1">
                  {formatDateUK(voidTarget.date)} - {voidTarget.type === 'Income' ? '+' : '-'}£{voidTarget.amount.toFixed(2)}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">
                  Reason
                </label>
                <textarea
                  value={voidReason}
                  onChange={(event) => setVoidReason(event.target.value)}
                  rows={3}
                  className="w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden resize-none"
                  placeholder="e.g. Duplicate bank import"
                  disabled={isVoiding}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setVoidTarget(null)}
                  className="px-4 py-2 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-paper rounded-sm transition-colors"
                  disabled={isVoiding}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleVoidTransaction}
                  disabled={isVoiding}
                  className="px-4 py-2 bg-error text-white rounded-sm font-bold uppercase text-xs tracking-wide flex items-center gap-2 disabled:opacity-60"
                >
                  {isVoiding ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                  Void
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showStatementImport && canEdit && (
        <StatementImportWizard
          funds={funds}
          categoryNamesFor={categoryNamesFor}
          review={importReview}
          onReconcile={can(currentUser.role, "reconciliation.manage") ? () => {
            setShowStatementImport(false);
            setShowReconciliation(true);
          } : undefined}
          onClose={() => setShowStatementImport(false)}
        />
      )}

      {/* Bank sync review. Statement imports are handled by the walkthrough above. */}
      {isReviewOpen && isBankReview && canEdit && createPortal(
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-soft-lg w-full min-w-0 max-w-4xl max-h-[90vh] flex flex-col animate-enter border border-ledger overflow-hidden">
                <div className="p-6 border-b border-[#efeee9] flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center rounded-t-lg">
                    <div>
                        <h3 className="text-lg font-bold text-ink">Review Import</h3>
                        <p className="text-xs text-grey-mid font-mono mt-1 uppercase tracking-wide">Found {pendingTransactions.length} items</p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <select
                            disabled={isProcessingAI}
                            onChange={(e) => {
                                if (e.target.value) assignFundToAll(e.target.value);
                            }}
                            className="w-full min-w-0 max-w-full px-3 py-2 border border-amber/30 bg-amber-light text-amber-dark rounded-lg text-xs font-bold cursor-pointer sm:w-auto disabled:cursor-wait disabled:opacity-60"
                            defaultValue=""
                        >
                            <option value="">Assign to Campaign...</option>
                            {funds.filter(f => f.type === 'Restricted').map(f => (
                                <option key={f._id} value={f._id}>{f.name}</option>
                            ))}
                        </select>
                        <button onClick={() => void categorise()} disabled={isProcessingAI} className="flex items-center justify-center gap-2 px-4 py-2 bg-sage-light text-sage-dark rounded-lg hover:bg-sage/20 transition-colors font-bold text-xs uppercase tracking-wide whitespace-nowrap disabled:cursor-wait disabled:opacity-80">
                            {isProcessingAI ? <><Loader2 size={14} className="animate-spin" /> Categorising</> : <><Sparkles size={14} /> Auto-Categorise</>}
                        </button>
                    </div>
                </div>
                <div className="min-w-0 overflow-y-auto overflow-x-hidden flex-1 p-6">
                    {isProcessingAI && (
                      <ImportCategorizationProgress transactionCount={categorizationTransactionCount} />
                    )}
                    {alreadyImportedRows.length > 0 && (
                      <div className="mb-4 p-3 bg-paper border border-ledger rounded-lg flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex items-center gap-2 text-xs text-grey-dark">
                          <CheckCircle2 size={16} className="shrink-0 text-sage-dark" />
                          <span>
                            <strong>{alreadyImportedRows.length} row{alreadyImportedRows.length > 1 ? 's were' : ' was'} already imported</strong> and {alreadyImportedRows.length > 1 ? 'have' : 'has'} been left out.
                          </span>
                        </p>
                        {alreadyImportedRows.some((row) => row.importKey) && (
                          <button
                            type="button"
                            onClick={includeAlreadyImported}
                            className="self-start text-xs font-bold text-grey-dark underline hover:text-ink sm:self-auto"
                          >
                            Import anyway
                          </button>
                        )}
                      </div>
                    )}
                    {duplicateWarnings.size > 0 && (
                      <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg flex items-center gap-2">
                        <AlertTriangle size={16} className="text-amber-600" />
                        <p className="text-xs text-amber-800">
                          <strong>{duplicateWarnings.size} potential duplicate{duplicateWarnings.size > 1 ? 's' : ''} found</strong> -
                          the ledger already has a transaction with the same date and amount, possibly from another source. Review and remove if needed.
                        </p>
                      </div>
                    )}
                    <ReviewTable rows={pendingTransactions} duplicateWarnings={duplicateWarnings} funds={funds} categoryNamesFor={categoryNamesFor} pairing={pairing} onUpdate={updatePendingTransactionAt} onRemove={removePendingTransactionAt} />
                </div>
                <div className="p-5 border-t border-[#efeee9] flex flex-col gap-3 rounded-b-lg bg-paper sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      {hasMoreBankRows && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <p className="text-xs font-semibold text-sage-dark">More bank transactions are available.</p>
                          <button
                            onClick={() => void fetchNextBankBatch()}
                            disabled={isFetchingMoreBankTransactions}
                            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-sage/40 rounded-md text-sage-dark hover:border-sage hover:bg-sage-light/30 transition-colors font-bold text-xs uppercase tracking-wide"
                          >
                            {isFetchingMoreBankTransactions ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            Fetch Next Batch
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end gap-3">
                    <button
                      onClick={clearReview}
                      className="px-4 py-2 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-grey-light rounded-sm transition-colors disabled:cursor-wait disabled:opacity-50"
                    >
                      Discard
                    </button>
                    <button
                      onClick={() => void confirm()}
                      disabled={isProcessingAI}
                      aria-busy={isProcessingAI}
                      className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide disabled:cursor-wait disabled:opacity-60"
                    >
                      {isProcessingAI ? 'Categorising…' : 'Confirm Import'}
                    </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
      )}

      {/* Bank Selector Modal */}
      {showBankSelector && createPortal(
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-soft-lg w-full max-w-md animate-enter border border-ledger">
            <div className="p-6 border-b border-[#efeee9] flex justify-between items-center rounded-t-lg">
              <div>
                <h3 className="text-lg font-bold text-ink">Select Bank Account</h3>
                <p className="text-xs text-grey-mid font-mono mt-1 uppercase tracking-wide">Choose which bank to sync</p>
              </div>
              <button onClick={() => setShowBankSelector(false)} className="text-grey-mid hover:text-grey-dark">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 ledger-space-y-3">
              {bankConnections.map((item) => (
                <button
                  key={item._id}
                  onClick={() => startBankSync(item._id)}
                  className="w-full p-4 bg-paper border border-ledger rounded-lg hover:border-sage hover:bg-sage-light/30 transition-all flex items-center gap-4 text-left group"
                >
                  <div className="w-10 h-10 bg-white border border-ledger rounded-lg flex items-center justify-center group-hover:border-sage">
                    <Building2 size={18} className="text-grey-dark group-hover:text-sage-dark" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-ink text-sm">{item.institutionName}</p>
                    <p className="text-[10px] text-grey-mid mt-0.5">
                      {item.accounts.length} account{item.accounts.length > 1 ? 's' : ''} mapped
                      {item.lastSyncAt && ` • Last sync: ${new Date(item.lastSyncAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <RefreshCw size={16} className="text-grey-mid group-hover:text-sage-dark" />
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
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

    </div>
  );
};

export default TransactionManager;
