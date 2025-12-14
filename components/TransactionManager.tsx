import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useAction, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { AppUser, Fund, Pledge, Transaction, TransactionType } from '../types';
import { Plus, Check, FileSpreadsheet, Building2, Edit2, X, Save, Filter, Calendar, Tag, CheckCircle2, RotateCcw, CheckSquare, Wallet, Loader2, Sparkles, Link as LinkIcon, Search, Lock, Table as TableIcon, ArrowRight, ArrowLeftRight, Wand2, AlertTriangle, RefreshCw } from 'lucide-react';

interface Category {
  _id: string;
  name: string;
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

const TransactionManager: React.FC<TransactionManagerProps> = ({
  funds, pledges, categories, currentUser, initialFundId, onPledgeCompleted
}) => {
  // Fetch all transactions - virtualization handles rendering performance
  const allTransactions = useQuery(api.queries.transactions.list, {});
  const isLoading = allTransactions === undefined;
  const transactions = allTransactions ?? [];

  // Convex mutations and actions
  const createTransaction = useMutation(api.mutations.transactions.create);
  const updateTransaction = useMutation(api.mutations.transactions.update);
  const bulkCreateTransactions = useMutation(api.mutations.transactions.bulkCreate);
  const bulkUpdateTransactions = useMutation(api.mutations.transactions.bulkUpdate);
  const categorizeTransactionsAI = useAction(api.actions.ai.categorizeTransactions);
  const reconcilePledgesAI = useAction(api.actions.ai.reconcilePledges);

  // Plaid bank sync
  const plaidItems = useQuery(api.queries.plaid.getActiveItemsWithMappedAccounts) || [];
  const syncTransactions = useAction(api.actions.plaid.syncTransactions);

  // Extract category names for backwards compatibility
  const categoryNames = categories.map(c => c.name);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isBulkProcessingAI, setIsBulkProcessingAI] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<Partial<Transaction>[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  
  // Smart Link State
  const [isReconciling, setIsReconciling] = useState(false);
  const [pledgeMatches, setPledgeMatches] = useState<any[]>([]);
  const [showMatchModal, setShowMatchModal] = useState(false);
  
  // CSV Import State
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState({ date: '', description: '', amount: '', amountIn: '', amountOut: '' });
  const [useSplitAmount, setUseSplitAmount] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bank Sync State
  const [showBankSelector, setShowBankSelector] = useState(false);
  const [duplicateWarnings, setDuplicateWarnings] = useState<Set<number>>(new Set());

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Manual Entry State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTransaction, setNewTransaction] = useState<Partial<Transaction>>({
      type: 'Income' as TransactionType,
      date: new Date().toISOString().split('T')[0],
      isReconciled: false,
      isGiftAidEligible: false,
      category: categoryNames[0] || 'Donations',
      fundId: funds[0]?._id
  });

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterFund, setFilterFund] = useState(initialFundId || '');
  const [filterStatus, setFilterStatus] = useState('all');

  // Client-side pagination for performance
  const [displayLimit, setDisplayLimit] = useState(ITEMS_PER_PAGE); 

  // Effect to apply initial fund filter if passed (e.g. navigation from Fund Manager)
  useEffect(() => {
    if (initialFundId) {
        setFilterFund(initialFundId);
    }
  }, [initialFundId]);

  const canEdit = ['Admin', 'Finance Team'].includes(currentUser.role);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Global Search
      if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          const matchesDesc = t.description.toLowerCase().includes(lowerTerm);
          const matchesCat = t.category.toLowerCase().includes(lowerTerm);
          const matchesDonor = t.donorName?.toLowerCase().includes(lowerTerm);
          const matchesAmount = t.amount.toString().includes(lowerTerm);

          if (!matchesDesc && !matchesCat && !matchesDonor && !matchesAmount) return false;
      }

      // Date Range
      if (filterDateStart && t.date < filterDateStart) return false;
      if (filterDateEnd && t.date > filterDateEnd) return false;

      // Category (Dropdown)
      if (filterCategory && t.category !== filterCategory) return false;

      // Fund (Dropdown) - compare as strings since Convex IDs are strings
      if (filterFund && t.fundId !== filterFund) return false;

      // Status
      if (filterStatus === 'reconciled' && !t.isReconciled) return false;
      if (filterStatus === 'unreconciled' && t.isReconciled) return false;
      // Unlinked: Income transactions without a linked pledge (for manual intervention)
      if (filterStatus === 'unlinked' && (t.type !== 'Income' || t.pledgeId)) return false;

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, searchTerm, filterDateStart, filterDateEnd, filterCategory, filterFund, filterStatus]);

  // Limit displayed transactions for performance
  const displayedTransactions = useMemo(() => {
    return filteredTransactions.slice(0, displayLimit);
  }, [filteredTransactions, displayLimit]);

  const hasMore = filteredTransactions.length > displayLimit;

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
      setFilterDateStart('');
      setFilterDateEnd('');
      setFilterCategory('');
      setFilterFund('');
      setFilterStatus('all');
  };

  const executeBulkUpdate = async (updates: Partial<Transaction>) => {
      try {
          await bulkUpdateTransactions({
              transactionIds: Array.from(selectedIds) as Id<"transactions">[],
              updates: {
                  category: updates.category,
                  fundId: updates.fundId as Id<"funds"> | undefined,
                  isReconciled: updates.isReconciled,
              }
          });
          setSelectedIds(new Set());
      } catch (error) {
          console.error("Bulk update failed:", error);
          alert("Failed to update transactions.");
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
              categories: categoryNames
          });
          // Update each transaction with its suggestion
          for (let i = 0; i < targetTransactions.length; i++) {
              const t = targetTransactions[i];
              const suggestion = suggestions[i];
              if (!suggestion) continue;
              const suggestedFund = funds.find(f => f.name === suggestion.fundName);
              await updateTransaction({
                  transactionId: t._id as Id<"transactions">,
                  category: suggestion.category,
                  isGiftAidEligible: suggestion.isGiftAidEligible,
                  fundId: suggestedFund?._id ? (suggestedFund._id as Id<"funds">) : undefined,
                  donorName: suggestion.donorName || undefined,
              });
          }
          setSelectedIds(new Set());
      } catch (error) {
          console.error(error);
          alert("Failed to auto-categorize. Please check API connection.");
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
              alert("No obvious pledge matches found for unlinked income.");
          }
      } catch (e) {
          console.error(e);
          alert("Smart Link failed. Please check API connection.");
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
          }
      } else {
          console.error("Could not find transaction or pledge for match:", match);
          setPledgeMatches(prev => prev.filter(m => m !== match));
      }
  };

  // --- CSV Handling ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          // Simple CSV Parser handling quotes
          const lines = text.split(/\r?\n/).filter(l => l.trim());
          if (lines.length < 2) {
              alert("Invalid CSV: Not enough lines.");
              return;
          }

          // Regex to split by comma but ignore commas inside quotes
          const parseLine = (line: string) => line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.trim().replace(/^"|"$/g, ''));
          
          const headers = parseLine(lines[0]);
          // Check for empty headers
          if (headers.some(h => !h)) {
             alert("CSV contains empty headers. Please check the file.");
             return;
          }
          
          const rows = lines.slice(1).map(parseLine);

          setCsvHeaders(headers);
          setCsvRows(rows);
          
          // Auto-guess columns
          const newMapping = { date: '', description: '', amount: '', amountIn: '', amountOut: '' };
          let splitDetected = false;

          headers.forEach(h => {
              const lower = h.toLowerCase();
              if (lower.includes('date') && !newMapping.date) newMapping.date = h;
              else if ((lower.includes('desc') || lower.includes('payee') || lower.includes('details') || lower.includes('memo')) && !newMapping.description) newMapping.description = h;
          });

          // Split Detection logic
          const creditCol = headers.find(h => {
             const l = h.toLowerCase();
             return l.includes('credit') || l.includes('paid in') || l.includes('money in') || l === 'in' || l.includes('deposit');
          });
          const debitCol = headers.find(h => {
             const l = h.toLowerCase();
             return l.includes('debit') || l.includes('paid out') || l.includes('money out') || l === 'out' || l.includes('withdrawal');
          });

          if (creditCol && debitCol) {
              splitDetected = true;
              newMapping.amountIn = creditCol;
              newMapping.amountOut = debitCol;
          } else {
               const amt = headers.find(h => {
                   const l = h.toLowerCase();
                   return (l.includes('amount') || l.includes('value')) && !l.includes('balance');
               });
               if(amt) newMapping.amount = amt;
          }

          setUseSplitAmount(splitDetected);
          setColumnMapping(newMapping);
          setShowColumnMapper(true);
      };
      reader.readAsText(file);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const parseAmountString = (str: string) => {
      if (!str) return 0;
      const clean = str.replace(/[£$,\s]/g, '');
      const val = parseFloat(clean);
      return isNaN(val) ? 0 : val;
  };

  const handleProcessMapping = () => {
      const dateIdx = csvHeaders.indexOf(columnMapping.date);
      const descIdx = csvHeaders.indexOf(columnMapping.description);
      
      let amountIdx = -1;
      let amountInIdx = -1;
      let amountOutIdx = -1;

      if (useSplitAmount) {
         amountInIdx = csvHeaders.indexOf(columnMapping.amountIn);
         amountOutIdx = csvHeaders.indexOf(columnMapping.amountOut);
         if (dateIdx === -1 || descIdx === -1 || (amountInIdx === -1 && amountOutIdx === -1)) {
            alert("Please map Date, Description, and the In/Out columns.");
            return;
         }
      } else {
         amountIdx = csvHeaders.indexOf(columnMapping.amount);
         if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) {
            alert("Please map Date, Description, and Amount columns.");
            return;
         }
      }

      const parsed: Partial<Transaction>[] = csvRows.map(row => {
          // Parse Date (Attempt standard ISO or UK DD/MM/YYYY)
          let dateStr = row[dateIdx] || '';
          if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
              const [d, m, y] = dateStr.split('/');
              dateStr = `${y}-${m}-${d}`;
          } else if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
               const [d, m, y] = dateStr.split('-');
               dateStr = `${y}-${m}-${d}`;
          }

          let amount = 0;
          let type = 'Income' as TransactionType;

          if (useSplitAmount) {
              const inStr = amountInIdx !== -1 ? (row[amountInIdx] || '') : '';
              const outStr = amountOutIdx !== -1 ? (row[amountOutIdx] || '') : '';
              const inVal = parseAmountString(inStr);
              const outVal = parseAmountString(outStr);

              if (inVal > 0) {
                  amount = inVal;
                  type = 'Income' as TransactionType;
              } else if (outVal > 0) {
                  amount = outVal;
                  type = 'Expenditure' as TransactionType;
              }
          } else {
              // Single column logic
              let amountStr = row[amountIdx] || '0';
              // Check for DR/CR suffix in some strings (rare but possible)
              const isDebit = amountStr.toLowerCase().includes('dr');
              amount = parseAmountString(amountStr);
              
              if (isDebit) amount = -Math.abs(amount);

              type = amount >= 0 ? 'Income' : 'Expenditure';
              amount = Math.abs(amount);
          }

          return {
              date: dateStr,
              description: row[descIdx],
              amount: amount,
              type,
              isReconciled: false,
              category: '',
              fundId: funds[0]._id // Default to General
          };
      }).filter(t => t.description && t.amount !== 0); // Filter out empty rows

      setPendingTransactions(parsed);
      setShowColumnMapper(false);
      setShowReviewModal(true);
  };
  // --------------------

  // Bank sync: show selector if multiple banks, otherwise sync directly
  const handleSyncBank = () => {
    if (plaidItems.length === 0) {
      alert('No bank accounts connected. Please connect a bank account in Settings > Bank Connections first.');
      return;
    }
    if (plaidItems.length === 1) {
      // Single bank - sync directly
      handleSyncFromBank(plaidItems[0]._id);
    } else {
      // Multiple banks - show selector
      setShowBankSelector(true);
    }
  };

  // Sync transactions from a specific bank connection
  const handleSyncFromBank = async (plaidItemId: Id<"plaidItems">) => {
    setShowBankSelector(false);
    setIsUploading(true);
    setDuplicateWarnings(new Set());

    try {
      const result = await syncTransactions({ plaidItemId });

      // Check for potential duplicates (same date + amount)
      const duplicates = new Set<number>();
      result.transactions.forEach((syncedTx, idx) => {
        const isDuplicate = transactions.some(
          (existingTx) =>
            existingTx.date === syncedTx.date &&
            Math.abs(existingTx.amount - syncedTx.amount) < 0.01
        );
        if (isDuplicate) {
          duplicates.add(idx);
        }
      });
      setDuplicateWarnings(duplicates);

      // Transform to pending transaction format
      const pending: Partial<Transaction>[] = result.transactions.map((tx) => ({
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        fundId: tx.fundId || funds[0]?._id,
        category: tx.type === 'Income' ? 'Donations' : 'Operating Expenses',
        isReconciled: false,
        isGiftAidEligible: false,
      }));

      setPendingTransactions(pending);
      setShowReviewModal(true);

      if (result.hasMore) {
        console.log('More transactions available - sync again for additional batches');
      }
    } catch (error: any) {
      console.error('Bank sync error:', error);
      alert(error.message || 'Failed to sync transactions from bank. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleApplyAI = async () => {
    setIsProcessingAI(true);
    try {
        // Use simple categorization - no auto-matching donors/pledges
        const descriptions = pendingTransactions.map(t => t.description || '');
        const suggestions = await categorizeTransactionsAI({
            descriptions,
            fundNames: funds.map(f => f.name),
            categories: categoryNames
        });

        const updatedPending = pendingTransactions.map((t, idx) => {
            const suggestion = suggestions[idx];
            if (!suggestion) return t;
            const suggestedFund = funds.find(f => f.name === suggestion.fundName);

            return {
                ...t,
                category: suggestion.category,
                fundId: suggestedFund ? suggestedFund._id : funds[0]._id,
                isGiftAidEligible: suggestion.isGiftAidEligible,
                donorName: suggestion.donorName || undefined,
                notes: `AI Confidence: ${suggestion.confidence}`,
            };
        });
        setPendingTransactions(updatedPending);
    } catch (error) {
        console.error("AI Error", error);
    } finally {
        setIsProcessingAI(false);
    }
  };

  const handleConfirmImport = async () => {
    try {
        // Build transactions - NO auto-donor creation or pledge linking
        // Just store the extracted donor name as text for manual linking later
        const transactionsToCreate = pendingTransactions.map((pt: any) => {
            return {
                date: pt.date || new Date().toISOString().split('T')[0],
                description: pt.description || '',
                amount: pt.amount || 0,
                type: (pt.type || 'Income') as 'Income' | 'Expenditure',
                category: pt.category || categoryNames[0] || 'Donations',
                fundId: (pt.fundId || funds[0]._id) as Id<"funds">,
                isReconciled: false,
                isGiftAidEligible: pt.isGiftAidEligible || false,
                donorName: pt.donorName, // Keep extracted name for reference
                // No auto-linking: donorId and pledgeId left undefined
                // User can manually link transactions to donors/pledges later
                notes: pt.notes?.replace(/ \| New Donor:.*$/, '').replace(/ \| Donor:.*$/, '').replace(/ \| Pledge:.*$/, '') || undefined,
            };
        });

        const result = await bulkCreateTransactions({ transactions: transactionsToCreate });

        // Notify about completed pledges (if any were manually linked)
        if (result?.completedPledges && onPledgeCompleted) {
            for (const completed of result.completedPledges) {
                onPledgeCompleted(completed.donorName, completed.amount);
            }
        }

        setShowReviewModal(false);
        setPendingTransactions([]);
    } catch (error) {
        console.error("Import failed:", error);
        alert("Failed to import transactions.");
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTransaction.amount && newTransaction.description && newTransaction.fundId) {
        try {
            const result = await createTransaction({
                date: newTransaction.date!,
                description: newTransaction.description!,
                amount: Number(newTransaction.amount),
                type: newTransaction.type! as 'Income' | 'Expenditure',
                category: newTransaction.category || categoryNames[0],
                fundId: newTransaction.fundId as Id<"funds">,
                isReconciled: newTransaction.isReconciled || false,
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
                date: new Date().toISOString().split('T')[0],
                isReconciled: false,
                isGiftAidEligible: false,
                category: categoryNames[0] || 'Donations',
                fundId: funds[0]?._id
            });
        } catch (error) {
            console.error("Failed to create transaction:", error);
            alert("Failed to create transaction.");
        }
    }
  };

  const formatDateUK = (dateString: string) => {
      try {
          return new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
      } catch {
          return dateString;
      }
  };

  return (
    <div className="space-y-6 animate-enter max-w-6xl mx-auto pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-ledger pb-6">
        <div>
          <h2 className="text-3xl font-bold text-ink tracking-tight">Ledger</h2>
          <p className="text-grey-mid mt-1 text-sm font-medium">Recorded transactions and reconciliations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
            {!canEdit && (
                <div className="flex items-center gap-2 px-3 py-1 bg-grey-light rounded text-xs font-bold text-grey-mid uppercase tracking-wide">
                    <Lock size={12} /> Read Only
                </div>
            )}
            {canEdit && (
                <>
                <button
                    onClick={handleSmartLinkPledges}
                    disabled={isReconciling}
                    className="flex items-center gap-2 px-4 py-2 bg-sage-light border border-sage/30 rounded-md text-sage-dark hover:text-ink hover:border-sage transition-all font-semibold text-xs uppercase tracking-wide shadow-sm"
                >
                    {isReconciling ? <Loader2 size={14} className="animate-spin"/> : <Wand2 size={14} />}
                    Smart Link
                </button>
                <div className="w-px h-6 bg-ledger mx-1 self-center hidden md:block"></div>
                <button
                    onClick={handleSyncBank}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-ledger rounded-md text-grey-dark hover:text-ink hover:border-slate-300 transition-all font-semibold text-xs uppercase tracking-wide shadow-sm"
                >
                    {isUploading ? <Loader2 size={14} className="animate-spin"/> : <Building2 size={14} />}
                    Sync Bank
                    {plaidItems.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 bg-sage-light text-sage-dark rounded text-[10px] font-bold">
                        {plaidItems.length}
                      </span>
                    )}
                </button>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-ledger rounded-md text-grey-dark hover:text-ink hover:border-slate-300 transition-all font-semibold text-xs uppercase tracking-wide shadow-sm"
                >
                    <FileSpreadsheet size={14}/>
                    Import CSV
                    <input 
                        ref={fileInputRef}
                        type="file" 
                        accept=".csv" 
                        className="hidden" 
                        onChange={handleFileUpload} 
                    />
                </button>
                <button 
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-md hover:bg-charcoal transition-all shadow-sm font-semibold text-xs uppercase tracking-wide btn-primary"
                >
                    <Plus size={14} />
                    Entry
                </button>
                </>
            )}
        </div>
      </header>

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-lg border border-ledger shadow-sm flex flex-col lg:flex-row gap-3">
          {/* Global Search */}
          <div className="relative flex-1">
             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid" />
             <input 
                type="text" 
                placeholder="Search transactions, donors, or categories..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs border border-ledger rounded-md focus:ring-1 focus:ring-slate-900 outline-none transition-shadow" 
             />
          </div>

          <div className="flex flex-wrap items-center gap-3">
             {/* Simplified Date Range */}
              <div className="flex items-center gap-2 px-3 py-2 bg-paper border border-ledger rounded-md h-[34px]">
                  <Calendar size={14} className="text-grey-mid shrink-0" />
                  <input 
                    type="date" 
                    value={filterDateStart} 
                    onChange={(e) => setFilterDateStart(e.target.value)} 
                    className="bg-transparent border-none text-xs text-grey-dark font-mono focus:ring-0 p-0 w-24 placeholder-slate-400" 
                  />
                  <span className="text-ledger text-[10px] shrink-0 font-bold">—</span>
                  <input 
                    type="date" 
                    value={filterDateEnd} 
                    onChange={(e) => setFilterDateEnd(e.target.value)} 
                    className="bg-transparent border-none text-xs text-grey-dark font-mono focus:ring-0 p-0 w-24 placeholder-slate-400" 
                  />
              </div>

              {/* Status Filter */}
              <div className="relative group h-[34px]">
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-full pl-3 pr-8 py-0 border border-ledger text-xs font-medium text-grey-dark bg-white hover:border-slate-300 rounded-md focus:ring-1 focus:ring-slate-900 outline-none appearance-none cursor-pointer w-32">
                      <option value="all">All Status</option>
                      <option value="reconciled">Reconciled</option>
                      <option value="unreconciled">Pending</option>
                      <option value="unlinked">Unlinked Income</option>
                  </select>
                  <Filter size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-grey-mid pointer-events-none" />
              </div>

               {/* Fund Filter */}
               <div className="relative group h-[34px]">
                  <select value={filterFund} onChange={(e) => setFilterFund(e.target.value)} className="h-full pl-3 pr-8 py-0 border border-ledger text-xs font-medium text-grey-dark bg-white hover:border-slate-300 rounded-md focus:ring-1 focus:ring-slate-900 outline-none appearance-none cursor-pointer w-36">
                      <option value="">All Funds</option>
                      {funds.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                  </select>
                  <Wallet size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-grey-mid pointer-events-none" />
              </div>

               {/* Category Filter */}
              <div className="relative group h-[34px]">
                  <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="h-full pl-3 pr-8 py-0 border border-ledger text-xs font-medium text-grey-dark bg-white hover:border-slate-300 rounded-md focus:ring-1 focus:ring-slate-900 outline-none appearance-none cursor-pointer w-32">
                      <option value="">Category...</option>
                      {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Tag size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-grey-mid pointer-events-none" />
              </div>

              {(searchTerm || filterDateStart || filterDateEnd || filterCategory || filterStatus !== 'all' || filterFund) && (
                  <button onClick={clearFilters} className="h-[34px] px-3 text-xs text-error font-bold uppercase tracking-wide hover:bg-error-light rounded-md flex items-center gap-1 transition-colors">
                      <RotateCcw size={12} />
                  </button>
              )}
          </div>
      </div>

      {/* Ledger Table */}
      <div className="swiss-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left ledger-table">
            <thead className="bg-paper border-b border-ledger">
              <tr>
                <th className="w-10 px-4 py-3">
                    {canEdit && (
                         <input type="checkbox" checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0} onChange={handleSelectAll} className="w-4 h-4 text-ink rounded border-slate-300 focus:ring-0 cursor-pointer" />
                    )}
                </th>
                <th className="px-6 py-3 text-xs">Date</th>
                <th className="px-6 py-3 text-xs">Description</th>
                <th className="px-6 py-3 text-xs">Category</th>
                <th className="px-6 py-3 text-xs">Fund</th>
                <th className="px-6 py-3 text-xs text-right">Credit/Debit</th>
                <th className="px-6 py-3 text-xs text-center">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-grey-mid">
                    <Loader2 size={32} className="mx-auto mb-2 animate-spin opacity-40" />
                    <p className="text-sm">Loading transactions...</p>
                  </td>
                </tr>
              ) : displayedTransactions.length > 0 ? (
                displayedTransactions.map((t) => {
                  const fund = funds.find(f => f._id === t.fundId);
                  const isSelected = selectedIds.has(t._id);
                  const linkedPledge = pledges.find(p => p._id === t.pledgeId);

                  return (
                    <tr key={t._id} className={`hover:bg-paper transition-colors group ${isSelected ? 'bg-amber-light/30' : ''}`}>
                      <td className="px-4 py-3 border-b border-slate-100">
                          {canEdit && (
                               <input type="checkbox" checked={isSelected} onChange={() => handleSelectOne(t._id)} className="w-4 h-4 text-ink rounded border-slate-300 focus:ring-0 cursor-pointer" />
                          )}
                      </td>
                      <td className="px-6 py-3 border-b border-slate-100 text-grey-mid font-mono text-xs">{formatDateUK(t.date)}</td>
                      <td className="px-6 py-3 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                             <div className="font-medium text-ink text-sm truncate max-w-[200px]">{t.description}</div>
                             {t.pledgeId && <LinkIcon size={12} className="text-sage" />}
                          </div>
                          {t.donorName && <div className="text-[10px] text-grey-mid font-mono mt-0.5 uppercase tracking-wide">Ref: {t.donorName}</div>}
                          {linkedPledge && <div className="text-[9px] text-sage font-mono mt-0.5 uppercase tracking-wide">Linked to {funds.find(f=>f._id===linkedPledge.fundId)?.name}</div>}
                      </td>
                      <td className="px-6 py-3 border-b border-slate-100">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-grey-light text-grey-dark border border-ledger">
                          {t.category}
                        </span>
                      </td>
                      <td className="px-6 py-3 border-b border-slate-100 text-grey-mid text-xs font-medium">{fund?.name}</td>
                      <td className={`px-6 py-3 border-b border-slate-100 text-right font-mono text-sm font-medium ${t.type === 'Income' ? 'text-sage' : 'text-ink'}`}>
                        {t.type === 'Income' ? '+' : '-'}£{t.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-3 border-b border-slate-100 text-center">
                          {t.isReconciled ? <Check size={14} className="mx-auto text-sage" /> : <div className="w-2 h-2 rounded-full bg-ledger mx-auto"></div>}
                      </td>
                      <td className="px-6 py-3 border-b border-slate-100 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                          {canEdit && (
                              <button onClick={() => setEditingTransaction(t)} className="text-grey-mid hover:text-sage transition-colors">
                                  <Edit2 size={14} />
                              </button>
                          )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-grey-mid">
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
          <div className="border-t border-ledger bg-paper px-4 py-3 flex justify-center">
            <button
              onClick={() => setDisplayLimit(prev => prev + ITEMS_PER_PAGE)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wide text-grey-dark hover:text-ink hover:bg-grey-light rounded-md transition-colors"
            >
              Load More ({filteredTransactions.length - displayLimit} remaining)
            </button>
          </div>
        )}
        {displayedTransactions.length > 0 && (
          <div className="border-t border-ledger bg-paper px-4 py-2 text-center">
            <span className="text-[10px] text-grey-mid font-mono uppercase tracking-wide">
              Showing {displayedTransactions.length} of {filteredTransactions.length} filtered ({transactions.length} total)
            </span>
          </div>
        )}
      </div>

      {/* Floating Bulk Actions */}
      {selectedIds.size > 0 && canEdit && createPortal(
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white px-5 py-3 rounded-lg shadow-2xl flex items-center gap-4 md:gap-6 z-40 animate-enter border border-slate-800 w-[90%] md:w-auto overflow-x-auto justify-between md:justify-start">
              <div className="flex items-center gap-3 border-r border-slate-700 pr-5 shrink-0">
                  <span className="text-xs font-bold font-mono text-sage">{selectedIds.size} SELECTED</span>
              </div>
              <div className="flex items-center gap-2">
                  <button onClick={handleBulkAutoCategorize} disabled={isBulkProcessingAI} className="flex items-center gap-2 px-3 py-1.5 hover:bg-charcoal rounded transition-colors text-xs font-bold uppercase tracking-wide whitespace-nowrap">
                      {isBulkProcessingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-amber" />}
                      <span className="hidden sm:inline">AI Auto-Cat</span>
                  </button>
                  <button onClick={() => executeBulkUpdate({ isReconciled: true })} className="flex items-center gap-2 px-3 py-1.5 hover:bg-charcoal rounded transition-colors text-xs font-bold uppercase tracking-wide whitespace-nowrap">
                      <CheckSquare size={14} className="text-grey-mid" /> <span className="hidden sm:inline">Reconcile</span>
                  </button>
                  {/* Inline Category Dropdown */}
                  <select
                      className="bg-charcoal text-white text-xs rounded px-2 py-1.5 border border-slate-600 hover:border-slate-500 cursor-pointer outline-none"
                      value=""
                      onChange={(e) => e.target.value && executeBulkUpdate({ category: e.target.value })}
                  >
                      <option value="">Category...</option>
                      {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {/* Inline Fund Dropdown */}
                  <select
                      className="bg-charcoal text-white text-xs rounded px-2 py-1.5 border border-slate-600 hover:border-slate-500 cursor-pointer outline-none"
                      value=""
                      onChange={(e) => e.target.value && executeBulkUpdate({ fundId: e.target.value as Id<"funds"> })}
                  >
                      <option value="">Fund...</option>
                      {funds.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                  </select>
                  <div className="w-px h-4 bg-slate-700 mx-2"></div>
                  <button onClick={() => setSelectedIds(new Set())} className="text-grey-mid hover:text-white transition-colors">
                      <X size={16} />
                  </button>
              </div>
          </div>,
          document.body
      )}


      {/* Smart Link Review Modal */}
      {showMatchModal && canEdit && createPortal(
          <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl animate-enter border border-ledger max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-sage-light rounded-t-lg">
                    <h3 className="font-bold text-sage-dark text-sm uppercase tracking-wide flex items-center gap-2">
                        <Wand2 size={16} /> Smart Link Suggestions
                    </h3>
                    <button onClick={() => setShowMatchModal(false)} className="text-sage hover:text-sage-dark"><X size={16} /></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 bg-paper/50">
                    <p className="text-sm text-grey-mid mb-4">
                        We found <strong>{pledgeMatches.length}</strong> possible matches for unlinked income.
                    </p>
                    <div className="space-y-3">
                        {pledgeMatches.map((m, i) => {
                            const txn = transactions.find(t => t._id === m.transactionId);
                            if (!txn) return null;
                            return (
                                <div key={i} className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-4 rounded border border-sage/30 shadow-sm gap-4">
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
                                         <button onClick={() => setPledgeMatches(prev => prev.filter(match => match !== m))} className="text-[10px] border border-ledger text-grey-mid hover:text-error hover:border-error/30 px-3 py-1.5 rounded font-bold uppercase flex items-center gap-1 transition-colors bg-white">
                                            <X size={12}/> Ignore
                                        </button>
                                        <button onClick={() => handleConfirmMatch(m)} className="text-[10px] bg-sage hover:bg-sage-dark text-white px-3 py-1.5 rounded font-bold uppercase flex items-center gap-1 transition-colors shadow-sm">
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

      {/* CSV Column Mapping Modal - REFINED UI 2.0 */}
      {showColumnMapper && canEdit && createPortal(
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl animate-enter border border-ledger overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-paper/50">
                    <div>
                        <h3 className="font-bold text-ink text-sm uppercase tracking-wide flex items-center gap-2">
                            <TableIcon size={16} className="text-grey-mid" /> Map CSV Columns
                        </h3>
                        <p className="text-[10px] text-grey-mid mt-1 font-medium">Match your bank statement columns to the ledger.</p>
                    </div>
                    <button onClick={() => setShowColumnMapper(false)} className="text-grey-mid hover:text-grey-dark transition-colors p-2 hover:bg-grey-light rounded-full">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-8">
                    {/* Mode Toggle */}
                    <div className="flex justify-center mb-8">
                            <div className="flex bg-grey-light p-1.5 rounded-xl border border-ledger">
                                <button 
                                onClick={() => setUseSplitAmount(false)}
                                className={`px-6 py-2.5 text-xs font-bold rounded-lg transition-all border border-transparent ${!useSplitAmount ? 'bg-white shadow-sm text-ink border-ledger' : 'text-grey-mid hover:text-grey-dark hover:bg-grey-light'}`}
                            >
                                Single Amount Column
                            </button>
                            <button
                                onClick={() => setUseSplitAmount(true)}
                                className={`px-6 py-2.5 text-xs font-bold rounded-lg transition-all border border-transparent flex items-center gap-2 ${useSplitAmount ? 'bg-white shadow-sm text-ink border-ledger' : 'text-grey-mid hover:text-grey-dark hover:bg-grey-light'}`}
                            >
                                Split In/Out Columns
                                <ArrowLeftRight size={14} />
                            </button>
                            </div>
                    </div>

                    <div className={`grid grid-cols-1 gap-6 mb-8 ${useSplitAmount ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                        <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide">Date Column</label>
                            <div className="relative">
                                <select 
                                    value={columnMapping.date} 
                                    onChange={(e) => setColumnMapping({...columnMapping, date: e.target.value})}
                                    className="w-full py-2 pl-3 pr-8 border border-ledger rounded-lg text-xs bg-paper/50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all appearance-none font-medium text-grey-dark cursor-pointer"
                                >
                                    <option value="">Select Column...</option>
                                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <TableIcon size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-grey-mid pointer-events-none"/>
                            </div>
                        </div>
                        
                         <div className="space-y-2">
                             <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide">Description / Payee</label>
                             <div className="relative">
                                <select 
                                    value={columnMapping.description} 
                                    onChange={(e) => setColumnMapping({...columnMapping, description: e.target.value})}
                                    className="w-full py-2 pl-3 pr-8 border border-ledger rounded-lg text-xs bg-paper/50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all appearance-none font-medium text-grey-dark cursor-pointer"
                                >
                                    <option value="">Select Column...</option>
                                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <TableIcon size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-grey-mid pointer-events-none"/>
                            </div>
                        </div>
                        
                        {useSplitAmount ? (
                             <>
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-bold text-sage uppercase tracking-wide">Money In (Credit)</label>
                                    <div className="relative">
                                    <select
                                        value={columnMapping.amountIn}
                                        onChange={(e) => setColumnMapping({...columnMapping, amountIn: e.target.value})}
                                        className="w-full py-2 pl-3 pr-8 border border-sage/30 rounded-lg text-xs bg-sage-light/50 hover:bg-sage-light focus:bg-white focus:ring-2 focus:ring-sage focus:border-transparent outline-none transition-all appearance-none font-medium text-sage-dark cursor-pointer"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <TableIcon size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-sage pointer-events-none"/>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-bold text-error uppercase tracking-wide">Money Out (Debit)</label>
                                    <div className="relative">
                                    <select
                                        value={columnMapping.amountOut}
                                        onChange={(e) => setColumnMapping({...columnMapping, amountOut: e.target.value})}
                                        className="w-full py-2 pl-3 pr-8 border border-error/30 rounded-lg text-xs bg-error-light/50 hover:bg-error-light focus:bg-white focus:ring-2 focus:ring-error focus:border-transparent outline-none transition-all appearance-none font-medium text-error cursor-pointer"
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <TableIcon size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-error pointer-events-none"/>
                                    </div>
                                </div>
                             </>
                        ) : (
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide">Amount</label>
                                <div className="relative">
                                <select 
                                    value={columnMapping.amount} 
                                    onChange={(e) => setColumnMapping({...columnMapping, amount: e.target.value})}
                                    className="w-full py-2 pl-3 pr-8 border border-ledger rounded-lg text-xs bg-paper/50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all appearance-none font-medium text-grey-dark cursor-pointer"
                                >
                                    <option value="">Select Column...</option>
                                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <TableIcon size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-grey-mid pointer-events-none"/>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="rounded-lg border border-ledger overflow-hidden">
                        <div className="bg-paper px-4 py-2 border-b border-ledger flex justify-between items-center">
                            <h4 className="text-[10px] font-bold text-grey-mid uppercase tracking-wide">Preview (First 3 Rows)</h4>
                            <span className="text-[10px] text-grey-mid font-mono">{csvRows.length} Rows Detected</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left ledger-table text-[10px]">
                                <thead className="bg-white">
                                    <tr>
                                        {csvHeaders.map(h => <th key={h} className="px-3 py-2 text-grey-mid font-bold border-b border-slate-100 whitespace-nowrap">{h}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {csvRows.slice(0, 3).map((row, i) => (
                                        <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-paper/50 transition-colors">
                                            {row.map((cell, j) => <td key={j} className="px-3 py-2 font-mono text-grey-dark whitespace-nowrap max-w-[200px] truncate">{cell}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-8 mt-4">
                        <button onClick={() => setShowColumnMapper(false)} className="px-5 py-2.5 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-paper rounded-lg transition-colors">Cancel</button>
                        <button onClick={handleProcessMapping} className="btn-primary px-6 py-2.5 font-bold uppercase text-xs tracking-wide flex items-center gap-2 shadow-lg shadow-slate-900/10">
                            Process Import <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
      )}

      {/* New Transaction Modal */}
      {showAddModal && canEdit && createPortal(
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto p-4 pt-8 sm:pt-12">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg animate-enter border border-ledger my-auto sm:my-8">
                <div className="sticky top-0 p-4 border-b border-slate-100 flex justify-between items-center bg-paper rounded-t-lg z-10">
                    <h3 className="font-bold text-ink text-sm uppercase tracking-wide">New Entry</h3>
                    <button onClick={() => setShowAddModal(false)} className="text-grey-mid hover:text-grey-dark">
                        <X size={16} />
                    </button>
                </div>
                <form onSubmit={handleAddSubmit} className="p-4 sm:p-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="min-w-0">
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Date</label>
                            <input
                                type="date"
                                required
                                value={newTransaction.date}
                                onChange={(e) => setNewTransaction({...newTransaction, date: e.target.value})}
                                className="block w-full min-w-0 appearance-none p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors font-mono"
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
                                    className="w-full pl-6 p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors font-mono"
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
                            className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                            placeholder="e.g. Sunday Collection Cash"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Category</label>
                            <select
                                value={newTransaction.category}
                                onChange={(e) => setNewTransaction({...newTransaction, category: e.target.value})}
                                className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Fund</label>
                             <select
                                value={newTransaction.fundId}
                                onChange={(e) => setNewTransaction({...newTransaction, fundId: e.target.value})}
                                className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
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
                                onChange={(e) => setNewTransaction({...newTransaction, type: e.target.value as TransactionType})}
                                className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
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
                                className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
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
                                className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
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

                    <div className="flex gap-6 pt-2">
                        <label className="flex items-center gap-2 cursor-pointer group">
                             <input 
                                type="checkbox" 
                                checked={newTransaction.isReconciled}
                                onChange={(e) => setNewTransaction({...newTransaction, isReconciled: e.target.checked})}
                                className="rounded border-slate-300 text-ink focus:ring-0 w-4 h-4" 
                            />
                            <span className="text-sm text-grey-dark group-hover:text-ink">Reconciled</span>
                        </label>
                        
                         <label className="flex items-center gap-2 cursor-pointer group">
                             <input 
                                type="checkbox" 
                                checked={newTransaction.isGiftAidEligible || false}
                                onChange={(e) => setNewTransaction({...newTransaction, isGiftAidEligible: e.target.checked})}
                                className="rounded border-slate-300 text-ink focus:ring-0 w-4 h-4" 
                            />
                            <span className="text-sm text-grey-dark group-hover:text-ink">Gift Aid Eligible</span>
                        </label>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                        <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-paper rounded transition-colors">Cancel</button>
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
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto p-4 pt-8 sm:pt-12">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg animate-enter border border-ledger my-auto sm:my-8">
                <div className="sticky top-0 p-4 border-b border-slate-100 flex justify-between items-center bg-paper rounded-t-lg z-10">
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
                                isReconciled: editingTransaction.isReconciled,
                                isGiftAidEligible: editingTransaction.isGiftAidEligible,
                                donorName: editingTransaction.donorName,
                                pledgeId: editingTransaction.pledgeId ? (editingTransaction.pledgeId as Id<"pledges">) : null
                            });
                            // Check if pledge was completed
                            if (result?.pledgeCompleted && onPledgeCompleted) {
                                onPledgeCompleted(result.pledgeCompleted.donorName, result.pledgeCompleted.amount);
                            }
                            setEditingTransaction(null);
                        } catch (error) {
                            console.error("Failed to update transaction:", error);
                            alert("Failed to update transaction.");
                        }
                    }
                }} className="p-4 sm:p-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="min-w-0">
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Date</label>
                            <input
                                type="date"
                                required
                                value={editingTransaction.date}
                                onChange={(e) => setEditingTransaction({...editingTransaction, date: e.target.value})}
                                className="block w-full min-w-0 appearance-none p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors font-mono"
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
                                    onChange={(e) => setEditingTransaction({...editingTransaction, amount: parseFloat(e.target.value)})}
                                    className="w-full pl-6 p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors font-mono"
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
                            className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Category</label>
                            <select
                                value={editingTransaction.category}
                                onChange={(e) => setEditingTransaction({...editingTransaction, category: e.target.value})}
                                className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Fund</label>
                             <select
                                value={editingTransaction.fundId}
                                onChange={(e) => setEditingTransaction({...editingTransaction, fundId: e.target.value})}
                                className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
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
                                onChange={(e) => setEditingTransaction({...editingTransaction, type: e.target.value as TransactionType})}
                                className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                <option value="Income">Income</option>
                                <option value="Expenditure">Expenditure</option>
                            </select>
                        </div>
                        <div>
                             <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Donor Name (Optional)</label>
                            <input
                                type="text"
                                value={editingTransaction.donorName || ''} 
                                onChange={(e) => setEditingTransaction({...editingTransaction, donorName: e.target.value})}
                                className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                                placeholder="Ref..."
                            />
                        </div>
                    </div>

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
                                className="w-full p-2.5 border border-ledger rounded text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
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

                    <div className="flex gap-6 pt-2">
                        <label className="flex items-center gap-2 cursor-pointer group">
                             <input 
                                type="checkbox" 
                                checked={editingTransaction.isReconciled}
                                onChange={(e) => setEditingTransaction({...editingTransaction, isReconciled: e.target.checked})}
                                className="rounded border-slate-300 text-ink focus:ring-0 w-4 h-4" 
                            />
                            <span className="text-sm text-grey-dark group-hover:text-ink">Reconciled</span>
                        </label>
                        
                         <label className="flex items-center gap-2 cursor-pointer group">
                             <input 
                                type="checkbox" 
                                checked={editingTransaction.isGiftAidEligible || false}
                                onChange={(e) => setEditingTransaction({...editingTransaction, isGiftAidEligible: e.target.checked})}
                                className="rounded border-slate-300 text-ink focus:ring-0 w-4 h-4" 
                            />
                            <span className="text-sm text-grey-dark group-hover:text-ink">Gift Aid Eligible</span>
                        </label>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                        <button type="button" onClick={() => setEditingTransaction(null)} className="px-4 py-2 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-paper rounded transition-colors">Cancel</button>
                        <button type="submit" className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2">
                            <Save size={14} /> Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
      )}

      {/* Review Modal */}
      {showReviewModal && canEdit && createPortal(
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-enter border border-ledger">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center rounded-t-lg">
                    <div>
                        <h3 className="text-lg font-bold text-ink">Review Import</h3>
                        <p className="text-xs text-grey-mid font-mono mt-1 uppercase tracking-wide">Found {pendingTransactions.length} items</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <select
                            onChange={(e) => {
                                if (e.target.value) {
                                    setPendingTransactions(prev => prev.map(t => ({
                                        ...t,
                                        category: 'Donations',
                                        fundId: e.target.value
                                    })));
                                }
                            }}
                            className="px-3 py-2 border border-amber/30 bg-amber-light text-amber-dark rounded-lg text-xs font-bold cursor-pointer"
                            defaultValue=""
                        >
                            <option value="">Assign to Campaign...</option>
                            {funds.filter(f => f.type === 'Restricted').map(f => (
                                <option key={f._id} value={f._id}>{f.name}</option>
                            ))}
                        </select>
                        <button onClick={handleApplyAI} disabled={isProcessingAI} className="flex items-center gap-2 px-4 py-2 bg-sage-light text-sage-dark rounded-lg hover:bg-sage/20 transition-colors font-bold text-xs uppercase tracking-wide">
                            {isProcessingAI ? 'Processing...' : <><Sparkles size={14} /> Auto-Categorize</>}
                        </button>
                    </div>
                </div>
                <div className="overflow-y-auto flex-1 p-6">
                    {duplicateWarnings.size > 0 && (
                      <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg flex items-center gap-2">
                        <AlertTriangle size={16} className="text-amber-600" />
                        <p className="text-xs text-amber-800">
                          <strong>{duplicateWarnings.size} potential duplicate{duplicateWarnings.size > 1 ? 's' : ''} found</strong> -
                          transactions with matching date and amount already exist. Review and remove if needed.
                        </p>
                      </div>
                    )}
                    <table className="w-full text-left ledger-table">
                        <thead>
                            <tr>
                                <th className="pb-2">Date</th>
                                <th className="pb-2">Description</th>
                                <th className="pb-2">Amount</th>
                                <th className="pb-2">Category</th>
                                <th className="pb-2">Fund</th>
                                <th className="pb-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {pendingTransactions.map((t, i) => (
                                <tr key={i} className={duplicateWarnings.has(i) ? 'bg-amber-50' : ''}>
                                    <td className="py-3 text-grey-mid font-mono text-xs">
                                      <div className="flex items-center gap-2">
                                        {duplicateWarnings.has(i) && (
                                          <span title="Potential duplicate">
                                            <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                                          </span>
                                        )}
                                        {t.date}
                                      </div>
                                    </td>
                                    <td className="py-3 font-medium text-ink text-sm">{t.description}</td>
                                    <td className="py-3 font-mono text-xs">£{t.amount?.toFixed(2)}</td>
                                    <td className="py-3"><select className="bg-paper border-transparent rounded text-xs font-bold text-grey-dark py-1" value={t.category || ''} onChange={(e) => { const n = [...pendingTransactions]; n[i].category = e.target.value; setPendingTransactions(n); }}><option value="">Select...</option>{categoryNames.map(c => <option key={c} value={c}>{c}</option>)}</select></td>
                                    <td className="py-3"><select className="bg-paper border-transparent rounded text-xs font-bold text-grey-dark py-1" value={t.fundId || ''} onChange={(e) => { const n = [...pendingTransactions]; n[i].fundId = e.target.value; setPendingTransactions(n); }}><option value="">Select...</option>{funds.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}</select></td>
                                    <td className="py-3 text-center">
                                      {duplicateWarnings.has(i) && (
                                        <button
                                          onClick={() => {
                                            const newPending = pendingTransactions.filter((_, idx) => idx !== i);
                                            setPendingTransactions(newPending);
                                            const newWarnings = new Set(duplicateWarnings);
                                            newWarnings.delete(i);
                                            // Reindex warnings
                                            const reindexed = new Set<number>();
                                            newWarnings.forEach(w => {
                                              if (w > i) reindexed.add(w - 1);
                                              else reindexed.add(w);
                                            });
                                            setDuplicateWarnings(reindexed);
                                          }}
                                          className="text-error hover:text-error-dark text-xs font-bold"
                                          title="Remove duplicate"
                                        >
                                          <X size={14} />
                                        </button>
                                      )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-5 border-t border-slate-100 flex justify-end gap-3 rounded-b-lg bg-paper">
                    <button onClick={() => setShowReviewModal(false)} className="px-4 py-2 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-grey-light rounded transition-colors">Discard</button>
                    <button onClick={handleConfirmImport} className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide">Confirm Import</button>
                </div>
            </div>
        </div>,
        document.body
      )}

      {/* Bank Selector Modal */}
      {showBankSelector && createPortal(
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md animate-enter border border-ledger">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center rounded-t-lg">
              <div>
                <h3 className="text-lg font-bold text-ink">Select Bank Account</h3>
                <p className="text-xs text-grey-mid font-mono mt-1 uppercase tracking-wide">Choose which bank to sync</p>
              </div>
              <button onClick={() => setShowBankSelector(false)} className="text-grey-mid hover:text-grey-dark">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              {plaidItems.map((item) => (
                <button
                  key={item._id}
                  onClick={() => handleSyncFromBank(item._id)}
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
    </div>
  );
};

export default TransactionManager;
