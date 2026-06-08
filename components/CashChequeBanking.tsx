import React, { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { AppUser, CashBankingVarianceType, Fund } from "../types";
import {
  calculateReconciliationSummary,
  normalizeBankTransactionSplits,
  type BankingMedium,
  type BankTransactionSplit,
  type BankTransactionSplitInput,
  type CollectionSplit,
} from "../lib/cashChequeBanking";
import { notify } from "../lib/notifications";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Loader2,
  Lock,
  ReceiptText,
  Search,
} from "lucide-react";

type AwaitingCollection = Doc<"cashCollections"> & {
  expectedCashAmount: number;
  expectedChequeAmount: number;
  expectedTotal: number;
  bankedCashAmount: number;
  bankedChequeAmount: number;
  bankedTotal: number;
  openCashAmount: number;
  openChequeAmount: number;
  openTotal: number;
  cashBankingStatus: "not_started" | "partially_banked" | "banked";
};

type CandidateBankCredit = Doc<"transactions">;

type BankCreditDraftSplit = {
  medium: BankingMedium;
  cashAmount: string;
  chequeAmount: string;
};

interface CashChequeBankingProps {
  funds: Fund[];
  currentUser: AppUser;
}

const varianceOptions: { value: CashBankingVarianceType; label: string }[] = [
  { value: "partial_banking", label: "Partial banking" },
  { value: "petty_cash_retained_or_spent", label: "Petty cash retained/spent" },
  { value: "bank_counting_difference", label: "Bank counting difference" },
  { value: "cheque_timing", label: "Cheque timing" },
  { value: "other", label: "Other" },
];

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const parseMoneyInput = (value: string) => {
  if (value.trim() === "") return undefined;
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? amount : undefined;
};

const defaultSplitForCredit = (credit: CandidateBankCredit): BankCreditDraftSplit => ({
  medium: "cash",
  cashAmount: credit.amount.toFixed(2),
  chequeAmount: "",
});

const statusLabel = (status: AwaitingCollection["cashBankingStatus"]) => {
  if (status === "banked") return "Banked";
  if (status === "partially_banked") return "Partially banked";
  return "Not started";
};

const CashChequeBanking: React.FC<CashChequeBankingProps> = ({
  funds,
  currentUser,
}) => {
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(
    new Set()
  );
  const [selectedBankCreditIds, setSelectedBankCreditIds] = useState<Set<string>>(
    new Set()
  );
  const [bankCreditSplits, setBankCreditSplits] = useState<
    Record<string, BankCreditDraftSplit>
  >({});
  const [bankSearchTerm, setBankSearchTerm] = useState("");
  const [varianceType, setVarianceType] = useState<CashBankingVarianceType | "">("");
  const [varianceNote, setVarianceNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const awaitingCollections = useQuery(
    api.queries.cashBankingReconciliations.getAwaitingBanking,
    {}
  ) as AwaitingCollection[] | undefined;
  const candidateBankCredits = useQuery(
    api.queries.cashBankingReconciliations.getCandidateBankCredits,
    {}
  ) as CandidateBankCredit[] | undefined;

  const createDraft = useMutation(
    api.mutations.cashBankingReconciliations.createDraft
  );
  const updateDraft = useMutation(
    api.mutations.cashBankingReconciliations.updateDraft
  );
  const completeReconciliation = useMutation(
    api.mutations.cashBankingReconciliations.complete
  );

  const canComplete = ["Admin", "Finance Team"].includes(currentUser.role);
  const collections = awaitingCollections ?? [];
  const bankCredits = candidateBankCredits ?? [];
  const visibleBankCredits = useMemo(() => {
    const normalizedSearch = bankSearchTerm.trim().toLowerCase();
    if (!normalizedSearch) return bankCredits;

    return bankCredits.filter((credit) =>
      [credit.description, credit.category, credit.notes]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [bankCredits, bankSearchTerm]);
  const collectionsLoading = awaitingCollections === undefined;
  const bankCreditsLoading = candidateBankCredits === undefined;

  const selectedCollections = useMemo(
    () =>
      collections.filter((collection) => selectedCollectionIds.has(collection._id)),
    [collections, selectedCollectionIds]
  );

  const selectedBankCredits = useMemo(
    () => bankCredits.filter((credit) => selectedBankCreditIds.has(credit._id)),
    [bankCredits, selectedBankCreditIds]
  );

  const collectionSplits = useMemo<CollectionSplit[]>(
    () =>
      selectedCollections.map((collection) => ({
        cashCollectionId: collection._id,
        cashAmount: collection.openCashAmount,
        chequeAmount: collection.openChequeAmount,
      })),
    [selectedCollections]
  );

  const bankTransactionSplitInputs = useMemo<BankTransactionSplitInput[]>(
    () =>
      selectedBankCredits.map((credit) => {
        const draft = bankCreditSplits[credit._id] ?? defaultSplitForCredit(credit);
        return {
          transactionId: credit._id,
          transactionAmount: credit.amount,
          medium: draft.medium,
          cashAmount:
            draft.medium === "mixed" ? parseMoneyInput(draft.cashAmount) : undefined,
          chequeAmount:
            draft.medium === "mixed"
              ? parseMoneyInput(draft.chequeAmount)
              : undefined,
        };
      }),
    [bankCreditSplits, selectedBankCredits]
  );

  const normalizedBankSplitResult = useMemo<{
    splits: BankTransactionSplit[];
    error: string | null;
  }>(() => {
    try {
      return {
        splits: normalizeBankTransactionSplits(bankTransactionSplitInputs),
        error: null,
      };
    } catch (error) {
      return {
        splits: [],
        error:
          error instanceof Error
            ? error.message
            : "Bank split amounts are invalid.",
      };
    }
  }, [bankTransactionSplitInputs]);

  const summary = useMemo(() => {
    if (normalizedBankSplitResult.error) return null;
    return calculateReconciliationSummary({
      collectionSplits,
      bankTransactionSplits: normalizedBankSplitResult.splits,
    });
  }, [collectionSplits, normalizedBankSplitResult]);

  const selectedExpectedTotal = collectionSplits.reduce(
    (sum, split) => sum + split.cashAmount + split.chequeAmount,
    0
  );
  const selectedBankTotal = selectedBankCredits.reduce(
    (sum, credit) => sum + credit.amount,
    0
  );
  const hasVariance = summary ? summary.varianceAmount !== 0 : false;
  const varianceNoteRequired = hasVariance && varianceNote.trim().length < 3;
  const canSubmit =
    canComplete &&
    selectedCollections.length > 0 &&
    selectedBankCredits.length > 0 &&
    summary !== null &&
    !normalizedBankSplitResult.error &&
    (!hasVariance || (varianceType !== "" && !varianceNoteRequired)) &&
    !isCompleting;

  const toggleCollection = (collectionId: string) => {
    setFormError(null);
    setSelectedCollectionIds((current) => {
      const next = new Set(current);
      if (next.has(collectionId)) {
        next.delete(collectionId);
      } else {
        next.add(collectionId);
      }
      return next;
    });
  };

  const toggleBankCredit = (credit: CandidateBankCredit) => {
    setFormError(null);
    setSelectedBankCreditIds((current) => {
      const next = new Set(current);
      if (next.has(credit._id)) {
        next.delete(credit._id);
      } else {
        next.add(credit._id);
      }
      return next;
    });
    setBankCreditSplits((current) =>
      current[credit._id]
        ? current
        : { ...current, [credit._id]: defaultSplitForCredit(credit) }
    );
  };

  const updateBankCreditMedium = (
    credit: CandidateBankCredit,
    medium: BankingMedium
  ) => {
    setFormError(null);
    setBankCreditSplits((current) => {
      const existing = current[credit._id] ?? defaultSplitForCredit(credit);
      const nextSplit: BankCreditDraftSplit =
        medium === "cash"
          ? {
              medium,
              cashAmount: credit.amount.toFixed(2),
              chequeAmount: "",
            }
          : medium === "cheque"
            ? {
                medium,
                cashAmount: "",
                chequeAmount: credit.amount.toFixed(2),
              }
            : {
                medium,
                cashAmount:
                  existing.medium === "mixed"
                    ? existing.cashAmount
                    : credit.amount.toFixed(2),
                chequeAmount: existing.medium === "mixed" ? existing.chequeAmount : "",
              };

      return { ...current, [credit._id]: nextSplit };
    });
  };

  const updateMixedAmount = (
    creditId: string,
    field: "cashAmount" | "chequeAmount",
    value: string
  ) => {
    setFormError(null);
    setBankCreditSplits((current) => {
      const existing = current[creditId];
      if (!existing) return current;
      return {
        ...current,
        [creditId]: {
          ...existing,
          [field]: value,
        },
      };
    });
  };

  const clearDraftState = () => {
    setSelectedCollectionIds(new Set());
    setSelectedBankCreditIds(new Set());
    setBankCreditSplits({});
    setVarianceType("");
    setVarianceNote("");
    setFormError(null);
  };

  const handleComplete = async () => {
    if (!canComplete) {
      setFormError("Only Admin and Finance Team users can complete banking.");
      return;
    }
    if (!summary || normalizedBankSplitResult.error) {
      setFormError(normalizedBankSplitResult.error || "Review the selected splits.");
      return;
    }
    if (selectedCollections.length === 0 || selectedBankCredits.length === 0) {
      setFormError("Select at least one collection and one bank credit.");
      return;
    }
    if (hasVariance && (varianceType === "" || varianceNoteRequired)) {
      setFormError("Add a variance type and note before completing.");
      return;
    }

    setIsCompleting(true);
    setFormError(null);

    try {
      const draft = await createDraft({});
      await updateDraft({
        reconciliationId: draft.reconciliationId,
        cashCollectionSplits: collectionSplits.map((split) => ({
          cashCollectionId: split.cashCollectionId as Id<"cashCollections">,
          cashAmount: split.cashAmount,
          chequeAmount: split.chequeAmount,
        })),
        bankTransactionSplits: bankTransactionSplitInputs.map((split) => ({
          transactionId: split.transactionId as Id<"transactions">,
          transactionAmount: split.transactionAmount,
          medium: split.medium,
          cashAmount: split.cashAmount,
          chequeAmount: split.chequeAmount,
        })),
        varianceType: varianceType || undefined,
        varianceNote: varianceNote.trim() || undefined,
      });
      await completeReconciliation({ reconciliationId: draft.reconciliationId });
      clearDraftState();
      notify("Banking Complete", "Cash/cheque banking has been reconciled.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to complete cash/cheque banking.";
      setFormError(message);
      notify("Error", message);
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-3 rounded-lg border border-ledger shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink uppercase tracking-wide flex items-center gap-2">
            <Banknote size={16} />
            Cash/cheque Banking
          </h3>
          <p className="text-xs text-grey-mid mt-1">
            Match in-person cash and cheque collections to imported bank credits
            across {funds.length} fund{funds.length === 1 ? "" : "s"}.
          </p>
        </div>
        {!canComplete && (
          <div className="flex items-center gap-2 text-xs text-grey-mid border border-ledger rounded-md px-3 py-2 bg-paper">
            <Lock size={14} />
            Read-only: Admin or Finance Team required to complete banking.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="swiss-card overflow-hidden">
          <div className="p-4 border-b border-ledger bg-paper flex items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-ink">
                Awaiting Banking
              </h4>
              <p className="text-[11px] text-grey-mid mt-1">
                Select collection weeks with open cash or cheque balances.
              </p>
            </div>
            <span className="text-[10px] font-mono text-grey-mid uppercase tracking-wide">
              {selectedCollections.length} selected
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left ledger-table">
              <thead className="bg-white border-b border-ledger">
                <tr>
                  <th className="w-10 px-4 py-3"></th>
                  <th className="px-4 py-3 text-xs">Week</th>
                  <th className="px-4 py-3 text-xs text-right">Open Cash</th>
                  <th className="px-4 py-3 text-xs text-right">Open Cheque</th>
                  <th className="px-4 py-3 text-xs text-right">Open Total</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {collectionsLoading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-grey-mid">
                      <Loader2
                        size={28}
                        className="mx-auto mb-2 animate-spin opacity-40"
                      />
                      <p className="text-sm">Loading collections...</p>
                    </td>
                  </tr>
                ) : collections.length > 0 ? (
                  collections.map((collection) => {
                    const isSelected = selectedCollectionIds.has(collection._id);
                    return (
                      <tr
                        key={collection._id}
                        className={`hover:bg-paper transition-colors ${
                          isSelected ? "bg-amber-light/30" : ""
                        }`}
                      >
                        <td className="px-4 py-3 border-b border-slate-100">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleCollection(collection._id)}
                            className="w-4 h-4 text-ink rounded border-slate-300 focus:ring-0 cursor-pointer"
                            aria-label={`Select collection ${formatDate(
                              collection.weekEndingDate
                            )}`}
                          />
                        </td>
                        <td className="px-4 py-3 border-b border-slate-100">
                          <div className="font-bold text-ink text-sm">
                            {formatDate(collection.weekEndingDate)}
                          </div>
                          <div className="text-[10px] text-grey-mid font-mono uppercase tracking-wide">
                            {statusLabel(collection.cashBankingStatus)}
                          </div>
                        </td>
                        <td className="px-4 py-3 border-b border-slate-100 text-right font-mono text-xs">
                          {formatCurrency(collection.openCashAmount)}
                        </td>
                        <td className="px-4 py-3 border-b border-slate-100 text-right font-mono text-xs">
                          {formatCurrency(collection.openChequeAmount)}
                        </td>
                        <td className="px-4 py-3 border-b border-slate-100 text-right font-mono text-sm font-bold text-sage">
                          {formatCurrency(collection.openTotal)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-grey-mid">
                      <ReceiptText size={30} className="mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No cash or cheque collections await banking.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="swiss-card overflow-hidden">
          <div className="p-4 border-b border-ledger bg-paper space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink">
                  Bank Credits
                </h4>
                <p className="text-[11px] text-grey-mid mt-1">
                  Select one or more imported statement credits.
                </p>
              </div>
              <span className="text-[10px] font-mono text-grey-mid uppercase tracking-wide">
                {selectedBankCredits.length} selected
              </span>
            </div>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid"
              />
              <input
                type="text"
                value={bankSearchTerm}
                onChange={(event) => setBankSearchTerm(event.target.value)}
                placeholder="Search bank credits..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-ledger rounded-md focus:ring-1 focus:ring-slate-900 outline-none"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left ledger-table">
              <thead className="bg-white border-b border-ledger">
                <tr>
                  <th className="w-10 px-4 py-3"></th>
                  <th className="px-4 py-3 text-xs">Credit</th>
                  <th className="px-4 py-3 text-xs text-right">Amount</th>
                  <th className="px-4 py-3 text-xs">Medium</th>
                  <th className="px-4 py-3 text-xs text-right">Split</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {bankCreditsLoading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-grey-mid">
                      <Loader2
                        size={28}
                        className="mx-auto mb-2 animate-spin opacity-40"
                      />
                      <p className="text-sm">Loading bank credits...</p>
                    </td>
                  </tr>
                ) : visibleBankCredits.length > 0 ? (
                  visibleBankCredits.map((credit) => {
                    const isSelected = selectedBankCreditIds.has(credit._id);
                    const draft =
                      bankCreditSplits[credit._id] ?? defaultSplitForCredit(credit);
                    const fund = funds.find((item) => item._id === credit.fundId);

                    return (
                      <tr
                        key={credit._id}
                        className={`hover:bg-paper transition-colors ${
                          isSelected ? "bg-amber-light/30" : ""
                        }`}
                      >
                        <td className="px-4 py-3 border-b border-slate-100">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleBankCredit(credit)}
                            className="w-4 h-4 text-ink rounded border-slate-300 focus:ring-0 cursor-pointer"
                            aria-label={`Select bank credit ${credit.description}`}
                          />
                        </td>
                        <td className="px-4 py-3 border-b border-slate-100 min-w-[220px]">
                          <div className="font-medium text-ink text-sm">
                            {credit.description}
                          </div>
                          <div className="text-[10px] text-grey-mid font-mono uppercase tracking-wide">
                            {formatDate(credit.date)}
                            {fund ? ` / ${fund.name}` : ""}
                          </div>
                        </td>
                        <td className="px-4 py-3 border-b border-slate-100 text-right font-mono text-sm font-bold text-sage">
                          {formatCurrency(credit.amount)}
                        </td>
                        <td className="px-4 py-3 border-b border-slate-100">
                          <select
                            value={draft.medium}
                            onChange={(event) =>
                              updateBankCreditMedium(
                                credit,
                                event.target.value as BankingMedium
                              )
                            }
                            disabled={!isSelected}
                            className="border border-ledger rounded px-2 py-1 text-xs bg-white disabled:bg-grey-light disabled:text-grey-mid"
                          >
                            <option value="cash">Cash</option>
                            <option value="cheque">Cheque</option>
                            <option value="mixed">Mixed</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 border-b border-slate-100 text-right">
                          {draft.medium === "mixed" && isSelected ? (
                            <div className="flex justify-end gap-2">
                              <label className="text-[10px] uppercase tracking-wide text-grey-mid">
                                Cash
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={draft.cashAmount}
                                  onChange={(event) =>
                                    updateMixedAmount(
                                      credit._id,
                                      "cashAmount",
                                      event.target.value
                                    )
                                  }
                                  className="mt-1 w-24 px-2 py-1 border border-ledger rounded text-xs font-mono text-right"
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-wide text-grey-mid">
                                Cheque
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={draft.chequeAmount}
                                  onChange={(event) =>
                                    updateMixedAmount(
                                      credit._id,
                                      "chequeAmount",
                                      event.target.value
                                    )
                                  }
                                  className="mt-1 w-24 px-2 py-1 border border-ledger rounded text-xs font-mono text-right"
                                />
                              </label>
                            </div>
                          ) : (
                            <div className="text-xs font-mono text-grey-mid">
                              {draft.medium === "cash"
                                ? `${formatCurrency(credit.amount)} cash`
                                : `${formatCurrency(credit.amount)} cheque`}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-grey-mid">
                      <Banknote size={30} className="mx-auto mb-2 opacity-20" />
                      <p className="text-sm">
                        {bankCredits.length > 0
                          ? "No bank credits match your search."
                          : "No candidate bank credits found."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="swiss-card p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="border border-ledger rounded-md p-3 bg-paper">
            <div className="text-[10px] uppercase tracking-wide font-bold text-grey-mid">
              Expected
            </div>
            <div className="font-mono text-lg font-bold text-ink mt-1">
              {formatCurrency(summary?.expectedTotal ?? selectedExpectedTotal)}
            </div>
            <div className="text-[11px] text-grey-mid mt-1">
              Cash {formatCurrency(summary?.expectedCashAmount ?? 0)} / Cheque{" "}
              {formatCurrency(summary?.expectedChequeAmount ?? 0)}
            </div>
          </div>
          <div className="border border-ledger rounded-md p-3 bg-paper">
            <div className="text-[10px] uppercase tracking-wide font-bold text-grey-mid">
              Banked
            </div>
            <div className="font-mono text-lg font-bold text-ink mt-1">
              {formatCurrency(summary?.bankedTotal ?? selectedBankTotal)}
            </div>
            <div className="text-[11px] text-grey-mid mt-1">
              Cash {formatCurrency(summary?.bankedCashAmount ?? 0)} / Cheque{" "}
              {formatCurrency(summary?.bankedChequeAmount ?? 0)}
            </div>
          </div>
          <div className="border border-ledger rounded-md p-3 bg-paper">
            <div className="text-[10px] uppercase tracking-wide font-bold text-grey-mid">
              Variance
            </div>
            <div
              className={`font-mono text-lg font-bold mt-1 ${
                summary && summary.varianceAmount !== 0 ? "text-error" : "text-sage"
              }`}
            >
              {formatCurrency(summary?.varianceAmount ?? 0)}
            </div>
            <div className="text-[11px] text-grey-mid mt-1">
              Banked minus expected.
            </div>
          </div>
          <div className="border border-ledger rounded-md p-3 bg-paper">
            <div className="text-[10px] uppercase tracking-wide font-bold text-grey-mid">
              State
            </div>
            <div className="font-bold text-sm text-ink mt-2">
              {normalizedBankSplitResult.error
                ? "Needs split review"
                : hasVariance
                  ? "Variance required"
                  : "Ready when selected"}
            </div>
            <div className="text-[11px] text-grey-mid mt-1">
              {selectedCollections.length} collection
              {selectedCollections.length === 1 ? "" : "s"} /{" "}
              {selectedBankCredits.length} credit
              {selectedBankCredits.length === 1 ? "" : "s"}.
            </div>
          </div>
        </div>

        {(normalizedBankSplitResult.error || formError) && (
          <div className="flex items-start gap-2 border border-error/30 bg-error-light text-error rounded-md p-3 text-xs">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{formError || normalizedBankSplitResult.error}</span>
          </div>
        )}

        {hasVariance && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wide font-bold text-grey-mid">
                Variance Type
              </label>
              <select
                value={varianceType}
                onChange={(event) =>
                  setVarianceType(event.target.value as CashBankingVarianceType | "")
                }
                className="mt-1 w-full border border-ledger rounded-md px-3 py-2 text-xs bg-white focus:ring-1 focus:ring-slate-900 outline-none"
              >
                <option value="">Select variance type</option>
                {varianceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] uppercase tracking-wide font-bold text-grey-mid">
                Variance Note
              </label>
              <input
                type="text"
                value={varianceNote}
                onChange={(event) => setVarianceNote(event.target.value)}
                placeholder="Explain the difference before completing"
                className="mt-1 w-full border border-ledger rounded-md px-3 py-2 text-xs bg-white focus:ring-1 focus:ring-slate-900 outline-none"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-ledger pt-4">
          <button
            type="button"
            onClick={clearDraftState}
            disabled={
              isCompleting ||
              (selectedCollectionIds.size === 0 && selectedBankCreditIds.size === 0)
            }
            className="px-4 py-2 text-xs font-bold uppercase tracking-wide border border-ledger rounded-md text-grey-dark hover:text-ink hover:border-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear Selection
          </button>
          <button
            type="button"
            onClick={handleComplete}
            disabled={!canSubmit}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-ink text-white rounded-md hover:bg-charcoal transition-all shadow-sm font-semibold text-xs uppercase tracking-wide btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isCompleting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            Complete Banking
          </button>
        </div>
      </section>
    </div>
  );
};

export default CashChequeBanking;
