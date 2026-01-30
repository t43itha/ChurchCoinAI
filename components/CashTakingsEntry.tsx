import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { Fund } from '../types';
import DonorSearchInput from './DonorSearchInput';
import {
  X,
  Plus,
  Trash2,
  Banknote,
  Users,
  PiggyBank,
  Receipt,
  Save,
  Send,
  Loader2,
  Calendar,
  Gift,
  AlertCircle,
} from 'lucide-react';

interface Category {
  _id: string;
  name: string;
}

// Contribution types for named contributions
type ContributionType = 'Tithe' | 'Pledge' | 'First Fruit' | 'Thanksgiving' | 'Offering';

interface NamedContributionEntry {
  id: string;
  donorName: string;
  donorId: Id<"donors"> | null;
  amount: string;
  isGiftAidEligible: boolean;
  type: ContributionType;
  fundId?: string; // Required when type='Pledge'
}

interface CategoryTotalEntry {
  id: string;
  category: string;
  fundId: string;
  amount: string;
}

interface PettyCashEntry {
  id: string;
  purpose: string;
  amount: string;
  category: string;
}

interface CashTakingsEntryProps {
  funds: Fund[];
  categories: Category[];
  onClose: () => void;
  onSuccess?: (result: { cashCollectionId: string; transactionCount: number }) => void;
}

// Helper to get the next Sunday (week ending date)
function getWeekEndingDate(date: Date): string {
  const dayOfWeek = date.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const sunday = new Date(date);
  sunday.setDate(date.getDate() + daysUntilSunday);
  return sunday.toISOString().split("T")[0];
}

// Generate a unique ID for entries
const generateId = () => Math.random().toString(36).substring(2, 9);

const CashTakingsEntry: React.FC<CashTakingsEntryProps> = ({
  funds,
  categories,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'tithes' | 'categories' | 'petty'>('tithes');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dates
  const today = new Date().toISOString().split("T")[0];
  const [weekEndingDate, setWeekEndingDate] = useState(getWeekEndingDate(new Date()));
  const [collectionDate, setCollectionDate] = useState(today);
  const [notes, setNotes] = useState("");

  // Entries
  const [namedContributions, setNamedContributions] = useState<NamedContributionEntry[]>([
    { id: generateId(), donorName: "", donorId: null, amount: "", isGiftAidEligible: false, type: 'Tithe' },
  ]);
  const [categoryTotals, setCategoryTotals] = useState<CategoryTotalEntry[]>([
    { id: generateId(), category: "Offering", fundId: "", amount: "" },
  ]);
  const [pettyCash, setPettyCash] = useState<PettyCashEntry[]>([]);

  // Mutation
  const submitCollection = useMutation(api.mutations.cashCollections.submitCollection);

  // Get unrestricted fund as default
  const unrestrictedFund = funds.find((f) => f.type === "Unrestricted");
  const restrictedFunds = funds.filter((f) => f.type === "Restricted" || f.type === "Designated");

  // Set default fund for category totals
  useEffect(() => {
    if (unrestrictedFund && categoryTotals.some((ct) => !ct.fundId)) {
      setCategoryTotals((prev) =>
        prev.map((ct) => (ct.fundId ? ct : { ...ct, fundId: unrestrictedFund._id }))
      );
    }
  }, [unrestrictedFund]);

  // Calculate totals
  const totals = useMemo(() => {
    const namedTotal = namedContributions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const categoryTotal = categoryTotals.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
    const pettyTotal = pettyCash.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const grossIncome = namedTotal + categoryTotal;
    const bankableTotal = grossIncome - pettyTotal;
    const giftAidEligible = namedContributions
      .filter((t) => t.isGiftAidEligible)
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

    return {
      namedTotal,
      categoryTotal,
      pettyTotal,
      grossIncome,
      bankableTotal,
      giftAidEligible,
    };
  }, [namedContributions, categoryTotals, pettyCash]);

  // Named contribution handlers
  const addContribution = () => {
    setNamedContributions([
      ...namedContributions,
      { id: generateId(), donorName: "", donorId: null, amount: "", isGiftAidEligible: false, type: 'Tithe' },
    ]);
  };

  const updateContribution = (id: string, updates: Partial<NamedContributionEntry>) => {
    setNamedContributions(namedContributions.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  };

  const removeContribution = (id: string) => {
    if (namedContributions.length > 1) {
      setNamedContributions(namedContributions.filter((t) => t.id !== id));
    }
  };

  // Category handlers
  const addCategory = () => {
    setCategoryTotals([
      ...categoryTotals,
      { id: generateId(), category: "", fundId: unrestrictedFund?._id || "", amount: "" },
    ]);
  };

  const updateCategory = (id: string, updates: Partial<CategoryTotalEntry>) => {
    setCategoryTotals(categoryTotals.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const removeCategory = (id: string) => {
    if (categoryTotals.length > 1) {
      setCategoryTotals(categoryTotals.filter((c) => c.id !== id));
    }
  };

  // Petty cash handlers
  const addPettyCash = () => {
    setPettyCash([
      ...pettyCash,
      { id: generateId(), purpose: "", amount: "", category: "Miscellaneous" },
    ]);
  };

  const updatePettyCash = (id: string, updates: Partial<PettyCashEntry>) => {
    setPettyCash(pettyCash.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const removePettyCash = (id: string) => {
    setPettyCash(pettyCash.filter((p) => p.id !== id));
  };

  // Submit handler
  const handleSubmit = async (asDraft: boolean = false) => {
    setError(null);
    setIsSubmitting(true);

    try {
      // Validate entries
      const validContributions = namedContributions.filter((t) => {
        const hasBasics = t.donorName && parseFloat(t.amount) > 0;
        // Pledges require a fund selection
        if (t.type === 'Pledge' && !t.fundId) return false;
        return hasBasics;
      });
      const validCategories = categoryTotals.filter(
        (c) => c.category && c.fundId && parseFloat(c.amount) > 0
      );
      const validPetty = pettyCash.filter((p) => p.purpose && parseFloat(p.amount) > 0);

      if (validContributions.length === 0 && validCategories.length === 0) {
        throw new Error("Please add at least one named contribution or category total");
      }

      const result = await submitCollection({
        weekEndingDate,
        collectionDate,
        notes: notes || undefined,
        status: asDraft ? "draft" : "submitted",
        namedContributions: validContributions.map((t) => ({
          donorName: t.donorName,
          donorId: t.donorId || undefined,
          amount: parseFloat(t.amount),
          isGiftAidEligible: t.isGiftAidEligible,
          type: t.type,
          fundId: t.fundId as Id<"funds"> | undefined,
        })),
        categoryTotals: validCategories.map((c) => ({
          category: c.category,
          fundId: c.fundId as Id<"funds">,
          amount: parseFloat(c.amount),
        })),
        pettyCash: validPetty.map((p) => ({
          purpose: p.purpose,
          amount: parseFloat(p.amount),
          category: p.category,
        })),
      });

      onSuccess?.({
        cashCollectionId: result.cashCollectionId,
        transactionCount: result.transactionCount,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to submit collection");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(amount);
  };

  const tabs = [
    { id: 'tithes' as const, label: 'Named Contributions', icon: Users, count: namedContributions.filter(t => t.donorName && t.amount).length },
    { id: 'categories' as const, label: 'Category Totals', icon: Receipt, count: categoryTotals.filter(c => c.category && c.amount).length },
    { id: 'petty' as const, label: 'Petty Cash', icon: PiggyBank, count: pettyCash.filter(p => p.purpose && p.amount).length },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-lg border-2 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-black">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sage-100 rounded-lg">
              <Banknote className="h-5 w-5 text-sage-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Record Cash Collection</h2>
              <p className="text-sm text-gray-500">Enter weekly cash takings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Date Selection */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Week Ending (Sunday)
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={weekEndingDate}
                  onChange={(e) => setWeekEndingDate(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black font-mono"
                />
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Collection Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={collectionDate}
                  onChange={(e) => setCollectionDate(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors
                ${activeTab === tab.id
                  ? "border-b-2 border-black text-black bg-white"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.count > 0 && (
                <span className="ml-1 bg-sage-100 text-sage-700 text-xs px-1.5 py-0.5 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Named Contributions Tab */}
          {activeTab === 'tithes' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">
                Enter individual contributions with donor names for Gift Aid tracking. Use "Pledge" for fund-specific pledge redemptions.
              </p>
              {namedContributions.map((contribution, index) => (
                <div
                  key={contribution.id}
                  className="flex flex-wrap items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="w-32">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Type
                    </label>
                    <select
                      value={contribution.type}
                      onChange={(e) => updateContribution(contribution.id, {
                        type: e.target.value as ContributionType,
                        // Clear fundId if switching away from Pledge
                        fundId: e.target.value === 'Pledge' ? contribution.fundId : undefined
                      })}
                      className="w-full h-10 px-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black"
                    >
                      <option value="Tithe">Tithe</option>
                      <option value="Pledge">Pledge</option>
                      <option value="First Fruit">First Fruit</option>
                      <option value="Thanksgiving">Thanksgiving</option>
                      <option value="Offering">Offering</option>
                    </select>
                  </div>
                  {contribution.type === 'Pledge' && (
                    <div className="w-40">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Fund
                      </label>
                      <select
                        value={contribution.fundId || ""}
                        onChange={(e) => updateContribution(contribution.id, { fundId: e.target.value })}
                        className="w-full h-10 px-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black"
                      >
                        <option value="">Select fund...</option>
                        {restrictedFunds.map((f) => (
                          <option key={f._id} value={f._id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex-[2] min-w-[150px]">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Donor Name
                    </label>
                    <DonorSearchInput
                      value={contribution.donorName}
                      onChange={(name) => updateContribution(contribution.id, { donorName: name })}
                      onDonorSelect={(donor) =>
                        updateContribution(contribution.id, {
                          donorName: donor.donorName,
                          donorId: donor.donorId,
                          isGiftAidEligible: donor.isGiftAidActive,
                        })
                      }
                      autoFocus={index === namedContributions.length - 1}
                    />
                  </div>
                  <div className="w-28">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Amount
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        £
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={contribution.amount}
                        onChange={(e) => updateContribution(contribution.id, { amount: e.target.value })}
                        placeholder="0.00"
                        className="w-full h-10 pl-7 pr-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black font-mono text-right"
                      />
                    </div>
                  </div>
                  <div className="flex items-end gap-1 h-[62px]">
                    <button
                      type="button"
                      onClick={() => updateContribution(contribution.id, { isGiftAidEligible: !contribution.isGiftAidEligible })}
                      className={`p-2 rounded-md transition-all ${
                        contribution.isGiftAidEligible
                          ? 'bg-sage-100 text-sage-700 ring-1 ring-sage-300'
                          : 'text-gray-300 hover:text-sage-500 hover:bg-sage-50'
                      }`}
                      title={contribution.isGiftAidEligible ? 'Gift Aid enabled' : 'Enable Gift Aid'}
                      aria-label={contribution.isGiftAidEligible ? 'Gift Aid enabled - click to disable' : 'Gift Aid disabled - click to enable'}
                      aria-pressed={contribution.isGiftAidEligible}
                    >
                      <Gift className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeContribution(contribution.id)}
                      disabled={namedContributions.length === 1}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={addContribution}
                className="w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-sage-400 hover:text-sage-700 hover:bg-sage-50 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Contribution
              </button>
            </div>
          )}

          {/* Categories Tab */}
          {activeTab === 'categories' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">
                Enter total amounts for each income category (offerings, restricted fund donations, etc.)
              </p>
              {categoryTotals.map((cat, index) => (
                <div
                  key={cat.id}
                  className="flex flex-wrap items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex-1 min-w-[150px]">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Category
                    </label>
                    <select
                      value={cat.category}
                      onChange={(e) => updateCategory(cat.id, { category: e.target.value })}
                      className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black font-mono"
                    >
                      <option value="">Select category...</option>
                      <option value="Tithe">Tithe</option>
                      <option value="Offering">Offering</option>
                      <option value="Merchandise">Merchandise</option>
                      <option value="Books">Books</option>
                      <option value="Other">Other</option>
                      <option value="Thanksgiving">Thanksgiving</option>
                      <option value="First Fruit">First Fruit</option>
                    </select>
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Fund
                    </label>
                    <select
                      value={cat.fundId}
                      onChange={(e) => updateCategory(cat.id, { fundId: e.target.value })}
                      className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black font-mono"
                    >
                      <option value="">Select fund...</option>
                      {funds.map((f) => (
                        <option key={f._id} value={f._id}>
                          {f.name} ({f.type})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Amount
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        £
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={cat.amount}
                        onChange={(e) => updateCategory(cat.id, { amount: e.target.value })}
                        placeholder="0.00"
                        className="w-full h-10 pl-7 pr-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black font-mono text-right"
                      />
                    </div>
                  </div>
                  <div className="flex items-end h-[62px]">
                    <button
                      onClick={() => removeCategory(cat.id)}
                      disabled={categoryTotals.length === 1}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={addCategory}
                className="w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-sage-400 hover:text-sage-700 hover:bg-sage-50 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Category
              </button>
            </div>
          )}

          {/* Petty Cash Tab */}
          {activeTab === 'petty' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">
                Record petty cash withdrawals. These will be deducted from the bankable total.
              </p>
              {pettyCash.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <PiggyBank className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No petty cash entries yet</p>
                </div>
              ) : (
                pettyCash.map((petty) => (
                  <div
                    key={petty.id}
                    className="flex flex-wrap items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200"
                  >
                    <div className="flex-[2] min-w-[200px]">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Purpose
                      </label>
                      <input
                        type="text"
                        value={petty.purpose}
                        onChange={(e) => updatePettyCash(petty.id, { purpose: e.target.value })}
                        placeholder="e.g., Tea supplies, postage..."
                        className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black font-mono"
                      />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Category
                      </label>
                      <select
                        value={petty.category}
                        onChange={(e) => updatePettyCash(petty.id, { category: e.target.value })}
                        className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black font-mono"
                      >
                        <option value="Miscellaneous">Miscellaneous</option>
                        <option value="Hospitality">Hospitality</option>
                        <option value="Office">Office</option>
                        <option value="Maintenance">Maintenance</option>
                        {categories.map((c) => (
                          <option key={c._id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-28">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Amount
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          £
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={petty.amount}
                          onChange={(e) => updatePettyCash(petty.id, { amount: e.target.value })}
                          placeholder="0.00"
                          className="w-full h-10 pl-7 pr-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black font-mono text-right"
                        />
                      </div>
                    </div>
                    <div className="flex items-end h-[62px]">
                      <button
                        onClick={() => removePettyCash(petty.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
              <button
                onClick={addPettyCash}
                className="w-full py-2 px-4 border-2 border-dashed border-amber-300 rounded-lg text-sm font-medium text-amber-700 hover:border-amber-400 hover:bg-amber-50 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Petty Cash Withdrawal
              </button>
            </div>
          )}
        </div>

        {/* Summary Panel - Compact for mobile */}
        <div className="px-4 py-2 border-t-2 border-black bg-gray-50">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-gray-400 block">Gross</span>
                <span className="font-bold text-sage-700 tabular-nums">{formatCurrency(totals.grossIncome)}</span>
              </div>
              {totals.pettyTotal > 0 && (
                <div>
                  <span className="text-gray-400 block">Petty</span>
                  <span className="font-bold text-amber-600 tabular-nums">-{formatCurrency(totals.pettyTotal)}</span>
                </div>
              )}
              {totals.giftAidEligible > 0 && (
                <div className="hidden sm:block">
                  <span className="text-gray-400 flex items-center gap-1"><Gift className="h-3 w-3" /> Gift Aid</span>
                  <span className="font-medium text-sage-600 tabular-nums">{formatCurrency(totals.giftAidEligible)}</span>
                </div>
              )}
            </div>
            <div className="text-right">
              <span className="text-gray-400 block">Bankable</span>
              <span className="text-base font-bold text-black tabular-nums">{formatCurrency(totals.bankableTotal)}</span>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-200 flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Footer - Compact for mobile */}
        <div className="px-4 py-3 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes (optional)..."
              className="flex-1 h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting || totals.grossIncome === 0}
                className="px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Save</span> Draft
              </button>
              <button
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting || totals.grossIncome === 0}
                className="px-3 py-2 text-xs font-medium text-white bg-black hover:bg-gray-800 rounded-md transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.1)] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Submit
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CashTakingsEntry;
