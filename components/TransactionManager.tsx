import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Transaction, TransactionType, Fund, Pledge, AppUser } from '../types';
import { categorizeTransactions } from '../services/gemini';
import { Plus, Check, FileSpreadsheet, Building2, Edit2, X, Save, Filter, Calendar, Tag, CheckCircle2, RotateCcw, CheckSquare, Wallet, Loader2, Sparkles, Link as LinkIcon, Search, Lock, Table as TableIcon, ArrowRight } from 'lucide-react';

interface TransactionManagerProps {
  transactions: Transaction[];
  funds: Fund[];
  pledges: Pledge[];
  categories: string[];
  onAddTransaction: (t: Transaction) => void;
  onUpdateTransaction: (t: Transaction) => void;
  onBulkAdd: (ts: Transaction[]) => void;
  onBulkUpdate: (ids: string[], updates: Partial<Transaction>) => void;
  onBatchUpdate: (updates: { id: string; changes: Partial<Transaction> }[]) => void;
  currentUser: AppUser;
  initialFundId?: string;
}

const TransactionManager: React.FC<TransactionManagerProps> = ({ 
  transactions, funds, pledges, categories, onAddTransaction, onUpdateTransaction, onBulkAdd, onBulkUpdate, onBatchUpdate, currentUser, initialFundId
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isBulkProcessingAI, setIsBulkProcessingAI] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<Partial<Transaction>[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  
  // CSV Import State
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState({ date: '', description: '', amount: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionType, setBulkActionType] = useState<'category' | 'fund' | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Manual Entry State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTransaction, setNewTransaction] = useState<Partial<Transaction>>({
      type: TransactionType.INCOME,
      date: new Date().toISOString().split('T')[0],
      isReconciled: false,
      isGiftAidEligible: false,
      category: categories[0] || 'Donations',
      fundId: funds[0]?.id
  });

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterFund, setFilterFund] = useState(initialFundId || '');
  const [filterStatus, setFilterStatus] = useState('all'); 

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

      // Fund (Dropdown)
      if (filterFund && t.fundId !== filterFund) return false;
      
      // Status
      if (filterStatus === 'reconciled' && !t.isReconciled) return false;
      if (filterStatus === 'unreconciled' && t.isReconciled) return false;
      
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, searchTerm, filterDateStart, filterDateEnd, filterCategory, filterFund, filterStatus]);

  const relevantPledges = useMemo(() => {
      if (!editingTransaction?.donorName) return [];
      return pledges.filter(p => 
          (p.donorName && p.donorName.toLowerCase().includes(editingTransaction.donorName!.toLowerCase())) ||
          (editingTransaction.donorId && p.donorId === editingTransaction.donorId)
      );
  }, [editingTransaction?.donorName, editingTransaction?.donorId, pledges]);

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
          setSelectedIds(new Set(filteredTransactions.map(t => t.id)));
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

  const executeBulkUpdate = (updates: Partial<Transaction>) => {
      onBulkUpdate(Array.from(selectedIds), updates);
      setSelectedIds(new Set());
      setBulkActionType(null);
  };

  const handleBulkAutoCategorize = async () => {
      if (selectedIds.size === 0) return;
      setIsBulkProcessingAI(true);
      const targetTransactions = transactions.filter(t => selectedIds.has(t.id));
      const descriptions = targetTransactions.map(t => t.description);
      try {
          const suggestions = await categorizeTransactions(descriptions, funds, categories);
          const updates = targetTransactions.map((t, index) => {
              const suggestion = suggestions[index];
              if (!suggestion) return { id: t.id, changes: {} };
              const suggestedFund = funds.find(f => f.name === suggestion.fundName);
              const changes: Partial<Transaction> = {
                  category: suggestion.category,
                  isGiftAidEligible: suggestion.isGiftAidEligible,
              };
              if (suggestedFund) changes.fundId = suggestedFund.id;
              if (suggestion.donorName) changes.donorName = suggestion.donorName;
              return { id: t.id, changes };
          });
          onBatchUpdate(updates);
          setSelectedIds(new Set());
      } catch (error) {
          console.error(error);
          alert("Failed to auto-categorize. Please check API connection.");
      } finally {
          setIsBulkProcessingAI(false);
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
          const newMapping = { date: '', description: '', amount: '' };
          headers.forEach(h => {
              const lower = h.toLowerCase();
              if (lower.includes('date') && !newMapping.date) newMapping.date = h;
              else if ((lower.includes('desc') || lower.includes('payee') || lower.includes('details') || lower.includes('memo')) && !newMapping.description) newMapping.description = h;
              else if ((lower.includes('amount') || lower.includes('value') || lower.includes('debit') || lower.includes('credit')) && !newMapping.amount) newMapping.amount = h;
          });
          setColumnMapping(newMapping);
          setShowColumnMapper(true);
      };
      reader.readAsText(file);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleProcessMapping = () => {
      const dateIdx = csvHeaders.indexOf(columnMapping.date);
      const descIdx = csvHeaders.indexOf(columnMapping.description);
      const amountIdx = csvHeaders.indexOf(columnMapping.amount);

      if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) {
          alert("Please map all fields before proceeding.");
          return;
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

          // Parse Amount (Remove currency symbols, handle negatives)
          let amountStr = row[amountIdx] || '0';
          amountStr = amountStr.replace(/[£$,]/g, '');
          let amount = parseFloat(amountStr);
          if (isNaN(amount)) amount = 0;

          const type = amount >= 0 ? TransactionType.INCOME : TransactionType.EXPENDITURE;

          return {
              date: dateStr,
              description: row[descIdx],
              amount: Math.abs(amount),
              type,
              isReconciled: false,
              category: '',
              fundId: funds[0].id // Default to General
          };
      }).filter(t => t.description && t.amount !== 0); // Filter out empty rows

      setPendingTransactions(parsed);
      setShowColumnMapper(false);
      setShowReviewModal(true);
  };
  // --------------------

  const handleSimulateSync = () => {
    setIsUploading(true);
    setTimeout(() => {
        const newMockTransactions: Partial<Transaction>[] = [
            { description: 'Stripe Payout 10239', amount: 320.00, type: TransactionType.INCOME, date: '2023-11-01' },
            { description: 'British Gas Bill Oct', amount: 145.00, type: TransactionType.EXPENDITURE, date: '2023-11-02' },
            { description: 'Donation Ref: Sarah Jenkins', amount: 200.00, type: TransactionType.INCOME, date: '2023-11-04' },
            { description: 'Cash Collection - Sunday', amount: 450.00, type: TransactionType.INCOME, date: '2023-11-05' },
        ];
        setPendingTransactions(newMockTransactions);
        setIsUploading(false);
        setShowReviewModal(true);
    }, 1500);
  };

  const handleApplyAI = async () => {
    setIsProcessingAI(true);
    const descriptions = pendingTransactions.map(t => t.description || '');
    try {
        const suggestions = await categorizeTransactions(descriptions, funds, categories);
        const updatedPending = pendingTransactions.map((t, idx) => {
            const suggestion = suggestions[idx];
            if (!suggestion) return t;
            const suggestedFund = funds.find(f => f.name === suggestion.fundName);
            return {
                ...t,
                category: suggestion.category,
                fundId: suggestedFund ? suggestedFund.id : funds[0].id, 
                isGiftAidEligible: suggestion.isGiftAidEligible,
                donorName: suggestion.donorName || (t.description?.includes('Ref:') ? t.description.split('Ref:')[1].trim() : undefined),
                notes: `AI Confidence: ${suggestion.confidence}`
            };
        });
        setPendingTransactions(updatedPending);
    } catch (error) {
        console.error("AI Error", error);
    } finally {
        setIsProcessingAI(false);
    }
  };

  const handleConfirmImport = () => {
    const newTransactions = pendingTransactions.map(pt => ({
        ...pt,
        id: Math.random().toString(36).substr(2, 9),
        isReconciled: false,
        // Ensure defaults if missing
        type: pt.type || TransactionType.INCOME,
        fundId: pt.fundId || funds[0].id,
        category: pt.category || categories[0],
        date: pt.date || new Date().toISOString().split('T')[0]
    })) as Transaction[];
    onBulkAdd(newTransactions);
    setShowReviewModal(false);
    setPendingTransactions([]);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTransaction.amount && newTransaction.description && newTransaction.fundId) {
        const t: Transaction = {
            id: Math.random().toString(36).substr(2, 9),
            date: newTransaction.date!,
            description: newTransaction.description!,
            amount: Number(newTransaction.amount),
            type: newTransaction.type!,
            category: newTransaction.category || categories[0],
            fundId: newTransaction.fundId!,
            isReconciled: newTransaction.isReconciled || false,
            isGiftAidEligible: newTransaction.isGiftAidEligible,
            donorName: newTransaction.donorName,
            pledgeId: newTransaction.pledgeId
        };
        onAddTransaction(t);
        setShowAddModal(false);
        // Reset
        setNewTransaction({
            type: TransactionType.INCOME,
            date: new Date().toISOString().split('T')[0],
            isReconciled: false,
            isGiftAidEligible: false,
            category: categories[0] || 'Donations',
            fundId: funds[0]?.id
        });
    }
  };

  return (
    <div className="space-y-6 animate-enter max-w-6xl mx-auto pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 font-display tracking-tight">Ledger</h2>
          <p className="text-slate-500 mt-1 text-sm font-medium">Recorded transactions and reconciliations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
            {!canEdit && (
                <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded text-xs font-bold text-slate-500 uppercase tracking-wide">
                    <Lock size={12} /> Read Only
                </div>
            )}
            {canEdit && (
                <>
                <button 
                    onClick={handleSimulateSync}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-md text-slate-700 hover:text-slate-900 hover:border-slate-300 transition-all font-semibold text-xs uppercase tracking-wide shadow-sm"
                >
                    {isUploading ? <Loader2 size={14} className="animate-spin"/> : <Building2 size={14} />}
                    Sync Bank
                </button>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-md text-slate-700 hover:text-slate-900 hover:border-slate-300 transition-all font-semibold text-xs uppercase tracking-wide shadow-sm"
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
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-all shadow-sm font-semibold text-xs uppercase tracking-wide btn-primary"
                >
                    <Plus size={14} />
                    Entry
                </button>
                </>
            )}
        </div>
      </header>

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-3">
          {/* Global Search */}
          <div className="relative flex-1">
             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
             <input 
                type="text" 
                placeholder="Search transactions, donors, or categories..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-md focus:ring-1 focus:ring-slate-900 outline-none transition-shadow" 
             />
          </div>

          <div className="flex flex-wrap items-center gap-3">
             {/* Simplified Date Range */}
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md h-[34px]">
                  <Calendar size={14} className="text-slate-400 shrink-0" />
                  <input 
                    type="date" 
                    value={filterDateStart} 
                    onChange={(e) => setFilterDateStart(e.target.value)} 
                    className="bg-transparent border-none text-xs text-slate-700 font-mono focus:ring-0 p-0 w-24 placeholder-slate-400" 
                  />
                  <span className="text-slate-300 text-[10px] shrink-0 font-bold">—</span>
                  <input 
                    type="date" 
                    value={filterDateEnd} 
                    onChange={(e) => setFilterDateEnd(e.target.value)} 
                    className="bg-transparent border-none text-xs text-slate-700 font-mono focus:ring-0 p-0 w-24 placeholder-slate-400" 
                  />
              </div>

              {/* Status Filter */}
              <div className="relative group h-[34px]">
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-full pl-3 pr-8 py-0 border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:border-slate-300 rounded-md focus:ring-1 focus:ring-slate-900 outline-none appearance-none cursor-pointer w-28">
                      <option value="all">All Status</option>
                      <option value="reconciled">Reconciled</option>
                      <option value="unreconciled">Pending</option>
                  </select>
                  <Filter size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

               {/* Fund Filter */}
               <div className="relative group h-[34px]">
                  <select value={filterFund} onChange={(e) => setFilterFund(e.target.value)} className="h-full pl-3 pr-8 py-0 border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:border-slate-300 rounded-md focus:ring-1 focus:ring-slate-900 outline-none appearance-none cursor-pointer w-36">
                      <option value="">All Funds</option>
                      {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <Wallet size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

               {/* Category Filter */}
              <div className="relative group h-[34px]">
                  <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="h-full pl-3 pr-8 py-0 border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:border-slate-300 rounded-md focus:ring-1 focus:ring-slate-900 outline-none appearance-none cursor-pointer w-32">
                      <option value="">Category...</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Tag size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {(searchTerm || filterDateStart || filterDateEnd || filterCategory || filterStatus !== 'all' || filterFund) && (
                  <button onClick={clearFilters} className="h-[34px] px-3 text-xs text-rose-600 font-bold uppercase tracking-wide hover:bg-rose-50 rounded-md flex items-center gap-1 transition-colors">
                      <RotateCcw size={12} />
                  </button>
              )}
          </div>
      </div>

      {/* Ledger Table */}
      <div className="swiss-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left ledger-table">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-10 px-4 py-3">
                    {canEdit && (
                         <input type="checkbox" checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0} onChange={handleSelectAll} className="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-0 cursor-pointer" />
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
              {filteredTransactions.map((t) => {
                const fund = funds.find(f => f.id === t.fundId);
                const isSelected = selectedIds.has(t.id);
                const linkedPledge = pledges.find(p => p.id === t.pledgeId);
                
                return (
                  <tr key={t.id} className={`hover:bg-slate-50 transition-colors group ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                    <td className="px-4 py-3 border-b border-slate-100">
                        {canEdit && (
                             <input type="checkbox" checked={isSelected} onChange={() => handleSelectOne(t.id)} className="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-0 cursor-pointer" />
                        )}
                    </td>
                    <td className="px-6 py-3 border-b border-slate-100 text-slate-500 font-mono text-xs">{t.date}</td>
                    <td className="px-6 py-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                           <div className="font-medium text-slate-800 text-sm truncate max-w-[200px]">{t.description}</div>
                           {t.pledgeId && <LinkIcon size={12} className="text-indigo-500" />}
                        </div>
                        {t.donorName && <div className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-wide">Ref: {t.donorName}</div>}
                        {linkedPledge && <div className="text-[9px] text-indigo-500 font-mono mt-0.5 uppercase tracking-wide">Linked to {funds.find(f=>f.id===linkedPledge.fundId)?.name}</div>}
                    </td>
                    <td className="px-6 py-3 border-b border-slate-100">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        {t.category}
                      </span>
                    </td>
                    <td className="px-6 py-3 border-b border-slate-100 text-slate-500 text-xs font-medium">{fund?.name}</td>
                    <td className={`px-6 py-3 border-b border-slate-100 text-right font-mono text-sm font-medium ${t.type === TransactionType.INCOME ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {t.type === TransactionType.INCOME ? '+' : '-'}£{t.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-3 border-b border-slate-100 text-center">
                        {t.isReconciled ? <Check size={14} className="mx-auto text-emerald-500" /> : <div className="w-2 h-2 rounded-full bg-slate-300 mx-auto"></div>}
                    </td>
                    <td className="px-6 py-3 border-b border-slate-100 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                        {canEdit && (
                            <button onClick={() => setEditingTransaction(t)} className="text-slate-400 hover:text-indigo-600 transition-colors">
                                <Edit2 size={14} />
                            </button>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredTransactions.length === 0 && (
              <div className="py-12 text-center text-slate-400">
                  <Filter size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No transactions match your query.</p>
              </div>
          )}
        </div>
      </div>

      {/* Floating Bulk Actions */}
      {selectedIds.size > 0 && canEdit && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-3 rounded-lg shadow-2xl flex items-center gap-4 md:gap-6 z-40 animate-enter border border-slate-800 w-[90%] md:w-auto overflow-x-auto justify-between md:justify-start">
              <div className="flex items-center gap-3 border-r border-slate-700 pr-5 shrink-0">
                  <span className="text-xs font-bold font-mono text-emerald-400">{selectedIds.size} SELECTED</span>
              </div>
              <div className="flex items-center gap-2">
                  <button onClick={handleBulkAutoCategorize} disabled={isBulkProcessingAI} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded transition-colors text-xs font-bold uppercase tracking-wide whitespace-nowrap">
                      {isBulkProcessingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-violet-400" />}
                      <span className="hidden sm:inline">AI Auto-Cat</span>
                  </button>
                  <button onClick={() => executeBulkUpdate({ isReconciled: true })} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded transition-colors text-xs font-bold uppercase tracking-wide whitespace-nowrap">
                      <CheckSquare size={14} className="text-slate-400" /> <span className="hidden sm:inline">Reconcile</span>
                  </button>
                  <button onClick={() => setBulkActionType('category')} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded transition-colors text-xs font-bold uppercase tracking-wide whitespace-nowrap">
                      <Tag size={14} className="text-slate-400" /> <span className="hidden sm:inline">Categorize</span>
                  </button>
                  <button onClick={() => setBulkActionType('fund')} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded transition-colors text-xs font-bold uppercase tracking-wide whitespace-nowrap">
                      <Wallet size={14} className="text-slate-400" /> <span className="hidden sm:inline">Move Fund</span>
                  </button>
                  <div className="w-px h-4 bg-slate-700 mx-2"></div>
                  <button onClick={() => setSelectedIds(new Set())} className="text-slate-400 hover:text-white transition-colors">
                      <X size={16} />
                  </button>
              </div>
          </div>
      )}

      {/* Bulk Action Modal */}
      {bulkActionType && canEdit && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm animate-enter border border-slate-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg">
                    <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">
                        {bulkActionType === 'category' ? 'Set Category' : 'Move to Fund'}
                    </h3>
                    <button onClick={() => setBulkActionType(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                </div>
                <div className="p-6">
                    <p className="text-sm text-slate-500 mb-4">Update <strong className="text-slate-900">{selectedIds.size}</strong> items:</p>
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        const val = formData.get('value') as string;
                        if (!val) return;
                        if (bulkActionType === 'category') executeBulkUpdate({ category: val });
                        else executeBulkUpdate({ fundId: val });
                    }}>
                        <div className="mb-6">
                            <select name="value" className="w-full p-2.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-slate-900 outline-none" required>
                                <option value="">Select...</option>
                                {bulkActionType === 'category' 
                                    ? categories.map(c => <option key={c} value={c}>{c}</option>)
                                    : funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)
                                }
                            </select>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setBulkActionType(null)} className="text-slate-500 text-xs font-bold uppercase hover:bg-slate-50 px-3 py-2 rounded">Cancel</button>
                            <button type="submit" className="btn-primary px-4 py-2 text-xs font-bold uppercase tracking-wide">Apply</button>
                        </div>
                    </form>
                </div>
             </div>
          </div>
      )}

      {/* CSV Column Mapping Modal */}
      {showColumnMapper && canEdit && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl animate-enter border border-slate-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg">
                    <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2">
                        <TableIcon size={16} /> Map CSV Columns
                    </h3>
                    <button onClick={() => setShowColumnMapper(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={16} />
                    </button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="bg-orange-50 p-4 rounded-lg border border-orange-100 mb-4">
                        <p className="text-xs text-orange-900">
                            We found <strong>{csvRows.length}</strong> rows. Please match the columns from your CSV to the fields below.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Date Column</label>
                            <select 
                                value={columnMapping.date} 
                                onChange={(e) => setColumnMapping({...columnMapping, date: e.target.value})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                <option value="">Select...</option>
                                {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                        </div>
                        <div>
                             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Description / Payee</label>
                             <select 
                                value={columnMapping.description} 
                                onChange={(e) => setColumnMapping({...columnMapping, description: e.target.value})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                <option value="">Select...</option>
                                {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                        </div>
                        <div>
                             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Amount</label>
                             <select 
                                value={columnMapping.amount} 
                                onChange={(e) => setColumnMapping({...columnMapping, amount: e.target.value})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                <option value="">Select...</option>
                                {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="mt-4">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Preview (First 3 Rows)</label>
                        <div className="overflow-x-auto border border-slate-100 rounded-lg">
                            <table className="w-full text-left ledger-table text-[10px]">
                                <thead className="bg-slate-50">
                                    <tr>
                                        {csvHeaders.map(h => <th key={h} className="px-3 py-2 text-slate-500 font-bold">{h}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {csvRows.slice(0, 3).map((row, i) => (
                                        <tr key={i} className="border-b border-slate-50 last:border-0">
                                            {row.map((cell, j) => <td key={j} className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{cell}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                        <button onClick={() => setShowColumnMapper(false)} className="px-4 py-2 text-slate-500 font-bold uppercase text-xs tracking-wide hover:bg-slate-50 rounded transition-colors">Cancel</button>
                        <button onClick={handleProcessMapping} className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2">
                            Next Step <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* New Transaction Modal */}
      {showAddModal && canEdit && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg animate-enter border border-slate-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg">
                    <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">New Entry</h3>
                    <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={16} />
                    </button>
                </div>
                <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Date</label>
                            <input 
                                type="date" 
                                required
                                value={newTransaction.date} 
                                onChange={(e) => setNewTransaction({...newTransaction, date: e.target.value})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors font-mono"
                            />
                        </div>
                        <div>
                             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Amount</label>
                             <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">£</span>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    required
                                    value={newTransaction.amount || ''} 
                                    onChange={(e) => setNewTransaction({...newTransaction, amount: parseFloat(e.target.value)})}
                                    className="w-full pl-6 p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors font-mono"
                                    placeholder="0.00"
                                />
                             </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Description</label>
                        <input 
                            type="text" 
                            required
                            value={newTransaction.description || ''} 
                            onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
                            className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                            placeholder="e.g. Sunday Collection Cash"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Category</label>
                            <select 
                                value={newTransaction.category} 
                                onChange={(e) => setNewTransaction({...newTransaction, category: e.target.value})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Fund</label>
                             <select 
                                value={newTransaction.fundId} 
                                onChange={(e) => setNewTransaction({...newTransaction, fundId: e.target.value})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Type</label>
                             <select 
                                value={newTransaction.type} 
                                onChange={(e) => setNewTransaction({...newTransaction, type: e.target.value as TransactionType})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                <option value={TransactionType.INCOME}>Income</option>
                                <option value={TransactionType.EXPENDITURE}>Expenditure</option>
                            </select>
                        </div>
                        <div>
                             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Donor Name (Optional)</label>
                            <input 
                                type="text" 
                                value={newTransaction.donorName || ''} 
                                onChange={(e) => setNewTransaction({...newTransaction, donorName: e.target.value})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                                placeholder="Name or Ref..."
                            />
                        </div>
                    </div>

                    {newTransaction.type === TransactionType.INCOME && (
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Link to Pledge / Schedule</label>
                            <select
                                value={newTransaction.pledgeId || ''}
                                onChange={(e) => setNewTransaction({...newTransaction, pledgeId: e.target.value || undefined})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                <option value="">-- No Linked Pledge --</option>
                                {relevantPledgesForNew.map(p => {
                                    const fundName = funds.find(f => f.id === p.fundId)?.name || 'Unknown Fund';
                                    return (
                                        <option key={p.id} value={p.id}>
                                            {fundName}: £{p.amount} ({p.frequency}) - {p.status}
                                        </option>
                                    );
                                })}
                            </select>
                             {relevantPledgesForNew.length === 0 && newTransaction.donorName && (
                                <p className="text-[10px] text-slate-400 mt-1 italic">No pledges found for donor "{newTransaction.donorName}"</p>
                            )}
                        </div>
                    )}

                    <div className="flex gap-6 pt-2">
                        <label className="flex items-center gap-2 cursor-pointer group">
                             <input 
                                type="checkbox" 
                                checked={newTransaction.isReconciled}
                                onChange={(e) => setNewTransaction({...newTransaction, isReconciled: e.target.checked})}
                                className="rounded border-slate-300 text-slate-900 focus:ring-0 w-4 h-4" 
                            />
                            <span className="text-sm text-slate-600 group-hover:text-slate-900">Reconciled</span>
                        </label>
                        
                         <label className="flex items-center gap-2 cursor-pointer group">
                             <input 
                                type="checkbox" 
                                checked={newTransaction.isGiftAidEligible || false}
                                onChange={(e) => setNewTransaction({...newTransaction, isGiftAidEligible: e.target.checked})}
                                className="rounded border-slate-300 text-slate-900 focus:ring-0 w-4 h-4" 
                            />
                            <span className="text-sm text-slate-600 group-hover:text-slate-900">Gift Aid Eligible</span>
                        </label>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                        <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-slate-500 font-bold uppercase text-xs tracking-wide hover:bg-slate-50 rounded transition-colors">Cancel</button>
                        <button type="submit" className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2">
                            <Plus size={14} /> Add Entry
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editingTransaction && canEdit && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg animate-enter border border-slate-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg">
                    <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Edit Transaction</h3>
                    <button onClick={() => setEditingTransaction(null)} className="text-slate-400 hover:text-slate-600">
                        <X size={16} />
                    </button>
                </div>
                <form onSubmit={(e) => {
                    e.preventDefault();
                    if (editingTransaction) {
                        onUpdateTransaction(editingTransaction);
                        setEditingTransaction(null);
                    }
                }} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Date</label>
                            <input 
                                type="date" 
                                required
                                value={editingTransaction.date} 
                                onChange={(e) => setEditingTransaction({...editingTransaction, date: e.target.value})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors font-mono"
                            />
                        </div>
                        <div>
                             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Amount</label>
                             <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">£</span>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    required
                                    value={editingTransaction.amount} 
                                    onChange={(e) => setEditingTransaction({...editingTransaction, amount: parseFloat(e.target.value)})}
                                    className="w-full pl-6 p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors font-mono"
                                />
                             </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Description</label>
                        <input 
                            type="text" 
                            required
                            value={editingTransaction.description} 
                            onChange={(e) => setEditingTransaction({...editingTransaction, description: e.target.value})}
                            className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Category</label>
                            <select 
                                value={editingTransaction.category} 
                                onChange={(e) => setEditingTransaction({...editingTransaction, category: e.target.value})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Fund</label>
                             <select 
                                value={editingTransaction.fundId} 
                                onChange={(e) => setEditingTransaction({...editingTransaction, fundId: e.target.value})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Type</label>
                             <select 
                                value={editingTransaction.type} 
                                onChange={(e) => setEditingTransaction({...editingTransaction, type: e.target.value as TransactionType})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                <option value={TransactionType.INCOME}>Income</option>
                                <option value={TransactionType.EXPENDITURE}>Expenditure</option>
                            </select>
                        </div>
                        <div>
                             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Donor Name (Optional)</label>
                            <input 
                                type="text" 
                                value={editingTransaction.donorName || ''} 
                                onChange={(e) => setEditingTransaction({...editingTransaction, donorName: e.target.value})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                                placeholder="Ref..."
                            />
                        </div>
                    </div>

                    {editingTransaction.type === TransactionType.INCOME && (
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Link to Pledge / Schedule</label>
                            <select
                                value={editingTransaction.pledgeId || ''}
                                onChange={(e) => setEditingTransaction({...editingTransaction, pledgeId: e.target.value || undefined})}
                                className="w-full p-2.5 border border-slate-200 rounded text-sm bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                            >
                                <option value="">-- No Linked Pledge --</option>
                                {relevantPledges.map(p => {
                                    const fundName = funds.find(f => f.id === p.fundId)?.name || 'Unknown Fund';
                                    return (
                                        <option key={p.id} value={p.id}>
                                            {fundName}: £{p.amount} ({p.frequency}) - {p.status}
                                        </option>
                                    );
                                })}
                            </select>
                            {relevantPledges.length === 0 && editingTransaction.donorName && (
                                <p className="text-[10px] text-slate-400 mt-1 italic">No pledges found for donor "{editingTransaction.donorName}"</p>
                            )}
                        </div>
                    )}

                    <div className="flex gap-6 pt-2">
                        <label className="flex items-center gap-2 cursor-pointer group">
                             <input 
                                type="checkbox" 
                                checked={editingTransaction.isReconciled}
                                onChange={(e) => setEditingTransaction({...editingTransaction, isReconciled: e.target.checked})}
                                className="rounded border-slate-300 text-slate-900 focus:ring-0 w-4 h-4" 
                            />
                            <span className="text-sm text-slate-600 group-hover:text-slate-900">Reconciled</span>
                        </label>
                        
                         <label className="flex items-center gap-2 cursor-pointer group">
                             <input 
                                type="checkbox" 
                                checked={editingTransaction.isGiftAidEligible || false}
                                onChange={(e) => setEditingTransaction({...editingTransaction, isGiftAidEligible: e.target.checked})}
                                className="rounded border-slate-300 text-slate-900 focus:ring-0 w-4 h-4" 
                            />
                            <span className="text-sm text-slate-600 group-hover:text-slate-900">Gift Aid Eligible</span>
                        </label>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                        <button type="button" onClick={() => setEditingTransaction(null)} className="px-4 py-2 text-slate-500 font-bold uppercase text-xs tracking-wide hover:bg-slate-50 rounded transition-colors">Cancel</button>
                        <button type="submit" className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2">
                            <Save size={14} /> Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && canEdit && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-enter border border-slate-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center rounded-t-lg">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 font-display">Review Import</h3>
                        <p className="text-xs text-slate-500 font-mono mt-1 uppercase tracking-wide">Found {pendingTransactions.length} items</p>
                    </div>
                    <button onClick={handleApplyAI} disabled={isProcessingAI} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors font-bold text-xs uppercase tracking-wide">
                        {isProcessingAI ? 'Processing...' : <><Sparkles size={14} /> Auto-Categorize</>}
                    </button>
                </div>
                <div className="overflow-y-auto flex-1 p-6">
                    <table className="w-full text-left ledger-table">
                        <thead>
                            <tr>
                                <th className="pb-2">Date</th>
                                <th className="pb-2">Description</th>
                                <th className="pb-2">Amount</th>
                                <th className="pb-2">Category</th>
                                <th className="pb-2">Fund</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pendingTransactions.map((t, i) => (
                                <tr key={i}>
                                    <td className="py-3 text-slate-500 font-mono text-xs">{t.date}</td>
                                    <td className="py-3 font-medium text-slate-800 text-sm">{t.description}</td>
                                    <td className="py-3 font-mono text-xs">£{t.amount?.toFixed(2)}</td>
                                    <td className="py-3"><select className="bg-slate-50 border-transparent rounded text-xs font-bold text-slate-700 py-1" value={t.category || ''} onChange={(e) => { const n = [...pendingTransactions]; n[i].category = e.target.value; setPendingTransactions(n); }}><option value="">Select...</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></td>
                                    <td className="py-3"><select className="bg-slate-50 border-transparent rounded text-xs font-bold text-slate-700 py-1" value={t.fundId || ''} onChange={(e) => { const n = [...pendingTransactions]; n[i].fundId = e.target.value; setPendingTransactions(n); }}><option value="">Select...</option>{funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-5 border-t border-slate-100 flex justify-end gap-3 rounded-b-lg bg-slate-50">
                    <button onClick={() => setShowReviewModal(false)} className="px-4 py-2 text-slate-500 font-bold uppercase text-xs tracking-wide hover:bg-slate-200 rounded transition-colors">Discard</button>
                    <button onClick={handleConfirmImport} className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide">Confirm Import</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default TransactionManager;