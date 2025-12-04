import React, { useState, useMemo } from 'react';
import { Transaction, TransactionType, Fund } from '../types';
import { categorizeTransactions } from '../services/gemini';
import { CATEGORIES } from '../constants';
import { Upload, Plus, Wand2, Check, FileSpreadsheet, Building2, Edit2, X, Save, Filter, Calendar, Tag, CheckCircle2, RotateCcw, CheckSquare, Wallet, Trash2, Loader2, Sparkles } from 'lucide-react';

interface TransactionManagerProps {
  transactions: Transaction[];
  funds: Fund[];
  onAddTransaction: (t: Transaction) => void;
  onUpdateTransaction: (t: Transaction) => void;
  onBulkAdd: (ts: Transaction[]) => void;
  onBulkUpdate: (ids: string[], updates: Partial<Transaction>) => void;
  onBatchUpdate: (updates: { id: string; changes: Partial<Transaction> }[]) => void;
}

const TransactionManager: React.FC<TransactionManagerProps> = ({ 
  transactions, funds, onAddTransaction, onUpdateTransaction, onBulkAdd, onBulkUpdate, onBatchUpdate
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isBulkProcessingAI, setIsBulkProcessingAI] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<Partial<Transaction>[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  
  // Selection & Bulk Action State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionType, setBulkActionType] = useState<'category' | 'fund' | null>(null);

  // Edit State
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Filter State
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'reconciled', 'unreconciled'

  // Filter Logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Date Range
      if (filterDateStart && t.date < filterDateStart) return false;
      if (filterDateEnd && t.date > filterDateEnd) return false;
      
      // Category
      if (filterCategory && t.category !== filterCategory) return false;
      
      // Status
      if (filterStatus === 'reconciled' && !t.isReconciled) return false;
      if (filterStatus === 'unreconciled' && t.isReconciled) return false;
      
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, filterDateStart, filterDateEnd, filterCategory, filterStatus]);

  // Selection Logic
  const handleSelectAll = () => {
      if (selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(filteredTransactions.map(t => t.id)));
      }
  };

  const handleSelectOne = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedIds(newSet);
  };

  const clearFilters = () => {
      setFilterDateStart('');
      setFilterDateEnd('');
      setFilterCategory('');
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
          const suggestions = await categorizeTransactions(descriptions, funds, CATEGORIES);
          
          const updates = targetTransactions.map((t, index) => {
              const suggestion = suggestions[index];
              if (!suggestion) return { id: t.id, changes: {} };

              const suggestedFund = funds.find(f => f.name === suggestion.fundName);
              
              const changes: Partial<Transaction> = {
                  category: suggestion.category,
                  isGiftAidEligible: suggestion.isGiftAidEligible,
              };

              // Only update fund if confident and found
              if (suggestedFund) {
                  changes.fundId = suggestedFund.id;
              }
              
              // Only update donor if found
              if (suggestion.donorName) {
                  changes.donorName = suggestion.donorName;
              }

              return { id: t.id, changes };
          });

          onBatchUpdate(updates);
          setSelectedIds(new Set());
          alert(`Successfully auto-categorized ${updates.length} transactions.`);
      } catch (error) {
          console.error(error);
          alert("Failed to auto-categorize. Please check API connection.");
      } finally {
          setIsBulkProcessingAI(false);
      }
  };

  // Simulate Plaid/Bank Sync
  const handleSimulateSync = () => {
    setIsUploading(true);
    setTimeout(() => {
        const newMockTransactions: Partial<Transaction>[] = [
            { description: 'Stripe Payout 10239', amount: 320.00, type: TransactionType.INCOME, date: '2023-11-01' },
            { description: 'British Gas Bill Oct', amount: 145.00, type: TransactionType.EXPENDITURE, date: '2023-11-02' },
            { description: 'Donation Ref: Sarah Jenkins', amount: 200.00, type: TransactionType.INCOME, date: '2023-11-04' },
            { description: 'Cash Collection - Sunday', amount: 450.00, type: TransactionType.INCOME, date: '2023-11-05' },
            { description: 'Amazon: Office Supplies', amount: 34.99, type: TransactionType.EXPENDITURE, date: '2023-11-05' },
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
        const suggestions = await categorizeTransactions(descriptions, funds, CATEGORIES);
        
        const updatedPending = pendingTransactions.map((t, idx) => {
            const suggestion = suggestions[idx];
            // Find fund ID by name
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
        alert("Failed to categorize with Gemini. Check your API key.");
    } finally {
        setIsProcessingAI(false);
    }
  };

  const handleConfirmImport = () => {
    const newTransactions = pendingTransactions.map(pt => ({
        ...pt,
        id: Math.random().toString(36).substr(2, 9),
        isReconciled: false,
    })) as Transaction[];
    
    onBulkAdd(newTransactions);
    setShowReviewModal(false);
    setPendingTransactions([]);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
      e.preventDefault();
      if (editingTransaction) {
          onUpdateTransaction(editingTransaction);
          setEditingTransaction(null);
      }
  };

  return (
    <div className="space-y-6 relative">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-slate-800">Transactions</h2>
          <p className="text-slate-500">Manage income, expenditure, and gift aid.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleSimulateSync}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors shadow-sm font-medium"
          >
            <Building2 size={18} className="text-blue-600"/>
            {isUploading ? 'Syncing...' : 'Sync Bank'}
          </button>
          <button 
            onClick={() => document.getElementById('csvInput')?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors shadow-sm font-medium"
          >
            <FileSpreadsheet size={18} className="text-green-600"/>
            Import CSV
            <input 
                id="csvInput" 
                type="file" 
                accept=".csv" 
                className="hidden" 
                onChange={(e) => {
                    if (e.target.files?.length) handleSimulateSync();
                }} 
            />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-md font-medium">
            <Plus size={18} />
            Manual Entry
          </button>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 items-end md:items-center">
          <div className="flex items-center gap-2 text-slate-500 font-medium mr-2">
              <Filter size={18} /> Filters:
          </div>
          
          <div className="flex items-center gap-2 flex-1">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <Calendar size={16} className="text-slate-400" />
                  <input 
                      type="date" 
                      value={filterDateStart}
                      onChange={(e) => setFilterDateStart(e.target.value)}
                      className="bg-transparent border-none text-sm text-slate-700 focus:ring-0 p-0 w-32 placeholder-slate-400"
                      placeholder="Start Date"
                  />
                  <span className="text-slate-400">-</span>
                  <input 
                      type="date" 
                      value={filterDateEnd}
                      onChange={(e) => setFilterDateEnd(e.target.value)}
                      className="bg-transparent border-none text-sm text-slate-700 focus:ring-0 p-0 w-32"
                  />
              </div>

              <div className="relative">
                  <Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select 
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                  >
                      <option value="">All Categories</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
              </div>

              <div className="relative">
                  <CheckCircle2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select 
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                  >
                      <option value="all">All Status</option>
                      <option value="reconciled">Reconciled</option>
                      <option value="unreconciled">Unreconciled</option>
                  </select>
              </div>
          </div>

          {(filterDateStart || filterDateEnd || filterCategory || filterStatus !== 'all') && (
              <button 
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-sm text-slate-500 hover:text-rose-500 transition-colors px-3 py-2 hover:bg-rose-50 rounded-lg"
              >
                  <RotateCcw size={14} /> Clear
              </button>
          )}
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden mb-16">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-10 px-4 py-4">
                     <input 
                        type="checkbox" 
                        checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                        onChange={handleSelectAll}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                     />
                </th>
                <th className="px-6 py-4 font-semibold text-slate-600">Date</th>
                <th className="px-6 py-4 font-semibold text-slate-600">Description</th>
                <th className="px-6 py-4 font-semibold text-slate-600">Category</th>
                <th className="px-6 py-4 font-semibold text-slate-600">Fund</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-center">Gift Aid</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-right">Amount</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-center">Rec.</th>
                <th className="px-6 py-4 font-semibold text-slate-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.length > 0 ? (
                  filteredTransactions.map((t) => {
                    const fund = funds.find(f => f.id === t.fundId);
                    const isSelected = selectedIds.has(t.id);
                    return (
                      <tr key={t.id} className={`hover:bg-slate-50 transition-colors group ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                        <td className="px-4 py-4">
                             <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={() => handleSelectOne(t.id)}
                                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                             />
                        </td>
                        <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{t.date}</td>
                        <td className="px-6 py-4">
                            <div className="font-medium text-slate-800">{t.description}</div>
                            {t.donorName && <div className="text-xs text-indigo-500">Donor: {t.donorName}</div>}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            {t.category}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500">{fund?.name || 'Unknown'}</td>
                        <td className="px-6 py-4 text-center">
                            {t.type === TransactionType.INCOME && (
                                t.isGiftAidEligible ? 
                                <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-1 rounded">Yes</span> : 
                                <span className="text-slate-300 text-xs">-</span>
                            )}
                        </td>
                        <td className={`px-6 py-4 text-right font-bold ${t.type === TransactionType.INCOME ? 'text-emerald-600' : 'text-slate-800'}`}>
                          {t.type === TransactionType.INCOME ? '+' : '-'}£{t.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-center">
                            {t.isReconciled ? (
                                <Check size={18} className="mx-auto text-emerald-500" />
                            ) : (
                                <div className="w-4 h-4 rounded-full border-2 border-slate-300 mx-auto"></div>
                            )}
                        </td>
                        <td className="px-6 py-4 text-right">
                            <button 
                                onClick={() => setEditingTransaction(t)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            >
                                <Edit2 size={16} />
                            </button>
                        </td>
                      </tr>
                    );
                  })
              ) : (
                  <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center gap-2">
                              <Filter size={32} className="opacity-20" />
                              <p>No transactions match your filters.</p>
                              <button onClick={clearFilters} className="text-indigo-600 text-xs font-medium hover:underline">Clear all filters</button>
                          </div>
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex justify-between">
              <span>Showing {filteredTransactions.length} of {transactions.length} transactions</span>
              <span>Sorted by Date (Newest First)</span>
          </div>
        </div>
      </div>

      {/* Bulk Actions Floating Toolbar */}
      {selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-6 z-40 animate-fade-in-up border border-slate-700">
              <div className="flex items-center gap-2 border-r border-slate-700 pr-6">
                  <div className="bg-emerald-500 text-slate-900 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                      {selectedIds.size}
                  </div>
                  <span className="text-sm font-medium">Selected</span>
              </div>
              
              <div className="flex items-center gap-2">
                  <button 
                      onClick={handleBulkAutoCategorize}
                      disabled={isBulkProcessingAI}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium bg-gradient-to-r from-indigo-600 to-indigo-500"
                      title="Auto-Categorize with AI"
                  >
                      {isBulkProcessingAI ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} className="text-amber-300" />}
                      AI Auto-Cat
                  </button>

                  <div className="w-px h-6 bg-slate-700 mx-1"></div>

                  <button 
                      onClick={() => executeBulkUpdate({ isReconciled: true })}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium"
                      title="Mark as Reconciled"
                  >
                      <CheckSquare size={16} className="text-emerald-400" />
                      Reconcile
                  </button>
                  <button 
                      onClick={() => setBulkActionType('category')}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium"
                      title="Change Category"
                  >
                      <Tag size={16} className="text-blue-400" />
                      Categorize
                  </button>
                  <button 
                      onClick={() => setBulkActionType('fund')}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium"
                      title="Move to Fund"
                  >
                      <Wallet size={16} className="text-amber-400" />
                      Move Fund
                  </button>
                  <div className="w-px h-6 bg-slate-700 mx-2"></div>
                  <button 
                      onClick={() => setSelectedIds(new Set())}
                      className="text-slate-400 hover:text-white"
                  >
                      <X size={20} />
                  </button>
              </div>
          </div>
      )}

      {/* Bulk Action Edit Modal */}
      {bulkActionType && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800">
                        {bulkActionType === 'category' ? 'Set Category' : 'Move to Fund'}
                    </h3>
                    <button onClick={() => setBulkActionType(null)} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-sm text-slate-500 mb-4">
                        Applying to {selectedIds.size} transactions.
                    </p>
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        const val = formData.get('value') as string;
                        if (!val) return;
                        
                        if (bulkActionType === 'category') {
                            executeBulkUpdate({ category: val });
                        } else {
                            executeBulkUpdate({ fundId: val });
                        }
                    }}>
                        <div className="mb-6">
                            {bulkActionType === 'category' ? (
                                <select name="value" className="w-full p-2 border border-slate-300 rounded-lg" required>
                                    <option value="">Select Category...</option>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            ) : (
                                <select name="value" className="w-full p-2 border border-slate-300 rounded-lg" required>
                                    <option value="">Select Fund...</option>
                                    {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                            )}
                        </div>
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setBulkActionType(null)} className="text-slate-600 font-medium">Cancel</button>
                            <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-medium">Apply Update</button>
                        </div>
                    </form>
                </div>
             </div>
          </div>
      )}

      {/* Edit Transaction Modal */}
      {editingTransaction && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                  <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <Edit2 size={18} className="text-indigo-600"/> Edit Transaction
                      </h3>
                      <button onClick={() => setEditingTransaction(null)} className="text-slate-400 hover:text-slate-600">
                          <X size={20} />
                      </button>
                  </div>
                  <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                              <input 
                                  type="date"
                                  required
                                  value={editingTransaction.date}
                                  onChange={(e) => setEditingTransaction({...editingTransaction, date: e.target.value})}
                                  className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                              />
                          </div>
                          <div>
                               <label className="block text-sm font-medium text-slate-700 mb-1">Amount (£)</label>
                               <input 
                                  type="number"
                                  step="0.01"
                                  required
                                  value={editingTransaction.amount}
                                  onChange={(e) => setEditingTransaction({...editingTransaction, amount: parseFloat(e.target.value)})}
                                  className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                               />
                          </div>
                      </div>

                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                          <input 
                              type="text"
                              required
                              value={editingTransaction.description}
                              onChange={(e) => setEditingTransaction({...editingTransaction, description: e.target.value})}
                              className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                          />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                               <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                               <select 
                                  value={editingTransaction.type}
                                  onChange={(e) => setEditingTransaction({...editingTransaction, type: e.target.value as TransactionType})}
                                  className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                               >
                                   <option value={TransactionType.INCOME}>Income</option>
                                   <option value={TransactionType.EXPENDITURE}>Expenditure</option>
                               </select>
                          </div>
                          <div>
                               <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                               <select 
                                  value={editingTransaction.category}
                                  onChange={(e) => setEditingTransaction({...editingTransaction, category: e.target.value})}
                                  className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                               >
                                   {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                               </select>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                               <label className="block text-sm font-medium text-slate-700 mb-1">Fund</label>
                               <select 
                                  value={editingTransaction.fundId}
                                  onChange={(e) => setEditingTransaction({...editingTransaction, fundId: e.target.value})}
                                  className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                               >
                                   {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                               </select>
                          </div>
                          <div>
                               <label className="block text-sm font-medium text-slate-700 mb-1">Donor Name</label>
                               <input 
                                  type="text"
                                  value={editingTransaction.donorName || ''}
                                  onChange={(e) => setEditingTransaction({...editingTransaction, donorName: e.target.value})}
                                  placeholder="Optional"
                                  className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                               />
                          </div>
                      </div>
                      
                      {editingTransaction.type === TransactionType.INCOME && (
                          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                              <input 
                                  type="checkbox"
                                  id="edit-ga"
                                  checked={editingTransaction.isGiftAidEligible || false}
                                  onChange={(e) => setEditingTransaction({...editingTransaction, isGiftAidEligible: e.target.checked})}
                                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                              />
                              <label htmlFor="edit-ga" className="text-sm text-slate-700 select-none cursor-pointer">Eligible for Gift Aid</label>
                          </div>
                      )}

                      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                          <button 
                              type="button" 
                              onClick={() => setEditingTransaction(null)}
                              className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg"
                          >
                              Cancel
                          </button>
                          <button 
                              type="submit" 
                              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium shadow-sm"
                          >
                              <Save size={18} />
                              Save Changes
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 font-serif">Review Imported Transactions</h3>
                        <p className="text-sm text-slate-500">Found {pendingTransactions.length} new transactions.</p>
                    </div>
                    <button 
                        onClick={handleApplyAI}
                        disabled={isProcessingAI}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200"
                    >
                        {isProcessingAI ? (
                            <>Processing...</>
                        ) : (
                            <>
                                <Wand2 size={18} />
                                Auto-Categorize & Identify Gift Aid
                            </>
                        )}
                    </button>
                </div>
                
                <div className="overflow-y-auto flex-1 p-6">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="pb-3 font-semibold text-slate-600">Date</th>
                                <th className="pb-3 font-semibold text-slate-600">Description</th>
                                <th className="pb-3 font-semibold text-slate-600">Amount</th>
                                <th className="pb-3 font-semibold text-indigo-600">Category</th>
                                <th className="pb-3 font-semibold text-indigo-600">Fund</th>
                                <th className="pb-3 font-semibold text-indigo-600 w-24 text-center">Gift Aid?</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {pendingTransactions.map((t, i) => (
                                <tr key={i} className="group">
                                    <td className="py-3 text-slate-500">{t.date}</td>
                                    <td className="py-3 font-medium text-slate-800">
                                        {t.description}
                                        {t.donorName && <div className="text-xs text-indigo-500">Detected: {t.donorName}</div>}
                                    </td>
                                    <td className="py-3">£{t.amount?.toFixed(2)}</td>
                                    <td className="py-3">
                                        <select 
                                            className="bg-indigo-50 border-none rounded text-indigo-900 text-sm py-1 px-2 focus:ring-2 focus:ring-indigo-500"
                                            value={t.category || ''}
                                            onChange={(e) => {
                                                const newPending = [...pendingTransactions];
                                                newPending[i].category = e.target.value;
                                                setPendingTransactions(newPending);
                                            }}
                                        >
                                            <option value="">Select...</option>
                                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </td>
                                    <td className="py-3">
                                        <select 
                                            className="bg-indigo-50 border-none rounded text-indigo-900 text-sm py-1 px-2 focus:ring-2 focus:ring-indigo-500"
                                            value={t.fundId || ''}
                                            onChange={(e) => {
                                                const newPending = [...pendingTransactions];
                                                newPending[i].fundId = e.target.value;
                                                setPendingTransactions(newPending);
                                            }}
                                        >
                                            <option value="">Select...</option>
                                            {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                        </select>
                                    </td>
                                    <td className="py-3 text-center">
                                        {t.type === TransactionType.INCOME && (
                                            <input 
                                                type="checkbox" 
                                                checked={t.isGiftAidEligible || false}
                                                onChange={(e) => {
                                                     const newPending = [...pendingTransactions];
                                                     newPending[i].isGiftAidEligible = e.target.checked;
                                                     setPendingTransactions(newPending);
                                                }}
                                                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                            />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
                    <button 
                        onClick={() => setShowReviewModal(false)}
                        className="px-5 py-2 text-slate-600 font-medium hover:text-slate-800"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleConfirmImport}
                        className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium shadow-md"
                    >
                        Confirm & Import
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default TransactionManager;