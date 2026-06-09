import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { Fund } from "../types";
import DonorSearchInput from "./DonorSearchInput";
import { InPersonGivingLedger } from "../lib/inPersonGiving";
import { formatLocalDateInputValue, getWeekEndingSunday } from "../lib/dateUtils";
import {
  AlertCircle,
  Banknote,
  Calendar,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";

interface Category {
  _id: string;
  name: string;
}

interface ServiceRowEntry {
  id: string;
  serviceDate: string;
  serviceNote: string;
  fundId: string;
  cash: string;
  pdq: string;
  cheque: string;
}

type NamedDonationPaymentMethod = "Cash" | "Cheque" | "Card";

interface NamedDonationEntry {
  id: string;
  donorName: string;
  donorId?: Id<"donors">;
  category: string;
  fundId: string;
  paymentMethod: NamedDonationPaymentMethod;
  amount: string;
  isGiftAidEligible: boolean;
}

interface CashTakingsEntryProps {
  funds: Fund[];
  categories: Category[];
  initialCollection?: InPersonGivingLedger;
  onClose: () => void;
  onSuccess?: (result: { cashCollectionId: string; transactionCount: number }) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);

const parseMoney = (value: string) => {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

const getDefaultDonationCategory = (categories: Category[]) => {
  const preferredCategory = categories.find((category) =>
    /\b(donation|donations|tithe|tithes|offering|offerings|giving)\b/i.test(
      category.name
    )
  );

  return preferredCategory?.name || categories[0]?.name || "Donation";
};

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
  });

type EntryTab = "serviceTotals" | "namedDonations";

const CashTakingsEntry: React.FC<CashTakingsEntryProps> = ({
  funds,
  categories,
  initialCollection,
  onClose,
  onSuccess,
}) => {
  const today = formatLocalDateInputValue(new Date());
  const unrestrictedFund = funds.find((fund) => fund.type === "Unrestricted");
  const defaultFundId = unrestrictedFund?._id || funds[0]?._id || "";
  const defaultNamedDonationCategory = getDefaultDonationCategory(categories);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekEndingDate, setWeekEndingDate] = useState(
    initialCollection?.weekEndingDate ?? getWeekEndingSunday(new Date())
  );
  const [notes, setNotes] = useState("");
  const [activeEntryTab, setActiveEntryTab] = useState<EntryTab>("serviceTotals");
  const [namedDonations, setNamedDonations] = useState<NamedDonationEntry[]>(
    () =>
      initialCollection?.namedDonations.map((donation) => ({
        id: donation.id,
        donorName: donation.donorName,
        donorId: donation.donorId as Id<"donors"> | undefined,
        category: donation.category,
        fundId: donation.fundId,
        paymentMethod:
          donation.paymentMethod === "Cheque" || donation.paymentMethod === "Card"
            ? donation.paymentMethod
            : "Cash",
        amount: donation.amount.toFixed(2),
        isGiftAidEligible: donation.isGiftAidEligible,
      })) ?? []
  );
  const [serviceRows, setServiceRows] = useState<ServiceRowEntry[]>(() => {
    const initialRows =
      initialCollection?.rows.map((row) => ({
        id: row.id,
        serviceDate: row.serviceDate,
        serviceNote: row.serviceNote,
        fundId: row.fundId,
        cash: row.cash > 0 ? row.cash.toFixed(2) : "",
        pdq: row.pdq > 0 ? row.pdq.toFixed(2) : "",
        cheque: row.cheque > 0 ? row.cheque.toFixed(2) : "",
      })) ?? [];

    return initialRows.length > 0
      ? initialRows
      : [
          {
            id: generateId(),
            serviceDate: today,
            serviceNote: "Sunday Service",
            fundId: defaultFundId,
            cash: "",
            pdq: "",
            cheque: "",
          },
        ];
  });

  const submitCollection = useMutation(api.mutations.cashCollections.submitCollection);
  const replaceCollectionEntries = useMutation(api.mutations.cashCollections.replaceCollectionEntries);

  const totals = useMemo(() => {
    const rows = serviceRows.map((row) => ({
      cash: parseMoney(row.cash),
      pdq: parseMoney(row.pdq),
      cheque: parseMoney(row.cheque),
    }));

    const cash = rows.reduce((sum, row) => sum + row.cash, 0);
    const pdq = rows.reduce((sum, row) => sum + row.pdq, 0);
    const cheque = rows.reduce((sum, row) => sum + row.cheque, 0);
    const namedDonationTotal = namedDonations.reduce(
      (sum, row) => sum + parseMoney(row.amount),
      0
    );
    const serviceTotal = cash + pdq + cheque;

    return {
      cash,
      pdq,
      cheque,
      total: serviceTotal,
      namedDonationTotal,
      combinedTotal: serviceTotal + namedDonationTotal,
    };
  }, [serviceRows, namedDonations]);

  const addServiceRow = () => {
    setServiceRows((rows) => [
      ...rows,
      {
        id: generateId(),
        serviceDate: today,
        serviceNote: "",
        fundId: defaultFundId,
        cash: "",
        pdq: "",
        cheque: "",
      },
    ]);
  };

  const updateServiceRow = (id: string, updates: Partial<ServiceRowEntry>) => {
    if (updates.serviceDate && serviceRows[0]?.id === id) {
      setWeekEndingDate(getWeekEndingSunday(updates.serviceDate));
    }

    setServiceRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...updates } : row))
    );
  };

  const removeServiceRow = (id: string) => {
    setServiceRows((rows) => rows.filter((row) => row.id !== id));
  };

  const addNamedDonation = () => {
    setNamedDonations((rows) => [
      ...rows,
      {
        id: generateId(),
        donorName: "",
        category: defaultNamedDonationCategory,
        fundId: defaultFundId,
        paymentMethod: "Cash",
        amount: "",
        isGiftAidEligible: false,
      },
    ]);
  };

  const updateNamedDonation = (
    id: string,
    updates: Partial<NamedDonationEntry>
  ) => {
    setNamedDonations((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...updates } : row))
    );
  };

  const removeNamedDonation = (id: string) => {
    setNamedDonations((rows) => rows.filter((row) => row.id !== id));
  };

  const handleSubmit = async (asDraft: boolean) => {
    setError(null);
    setIsSubmitting(true);

    try {
      const validRows = serviceRows
        .map((row) => ({
          serviceDate: row.serviceDate,
          serviceNote: row.serviceNote.trim() || "Service",
          fundId: row.fundId as Id<"funds">,
          cash: parseMoney(row.cash),
          pdq: parseMoney(row.pdq),
          cheque: parseMoney(row.cheque),
        }))
        .filter((row) => row.fundId && row.serviceDate && row.cash + row.pdq + row.cheque > 0);

      const validNamedDonations = namedDonations
        .map((row) => {
          const donation = {
            donorName: row.donorName.trim(),
            category: row.category.trim(),
            fundId: row.fundId as Id<"funds">,
            paymentMethod: row.paymentMethod,
            amount: parseMoney(row.amount),
            isGiftAidEligible: row.isGiftAidEligible,
          };

          return row.donorId ? { ...donation, donorId: row.donorId } : donation;
        })
        .filter(
          (row) =>
            row.donorName.length >= 2 &&
            row.category &&
            row.fundId &&
            row.amount > 0
        );

      if (validRows.length === 0 && validNamedDonations.length === 0) {
        throw new Error("Please add at least one service row or named donation with an amount.");
      }

      const payload = {
        weekEndingDate,
        collectionDate: validRows[0]?.serviceDate || weekEndingDate,
        notes: notes || undefined,
        status: (asDraft ? "draft" : "submitted") as "draft" | "submitted",
        serviceRows: validRows,
        namedDonations: validNamedDonations,
      };

      const result = initialCollection
        ? await replaceCollectionEntries({
            cashCollectionId: initialCollection.collectionId as Id<"cashCollections">,
            ...payload,
          })
        : await submitCollection(payload);

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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50">
      <div className="relative w-full max-w-5xl max-w-[calc(100vw-1rem)] max-h-[90vh] min-w-0 overflow-hidden bg-white rounded-lg border-2 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b-2 border-black">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 p-2 bg-sage-100 rounded-lg">
              <Banknote className="h-5 w-5 text-sage-700" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold">
                {initialCollection ? "Edit In-Person Giving" : "Record In-Person Giving"}
              </h2>
              <p className="text-sm text-gray-500">
                {initialCollection
                  ? "Correct weekly service totals, named donations, and dates."
                  : "Enter weekly service totals for cash, PDQ, and cheques."}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 p-2 hover:bg-gray-100 rounded-md transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-gray-50/50">
          <div className="w-full max-w-xs min-w-0">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Week Ending (Sunday)
            </label>
            <div className="relative max-w-full">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={weekEndingDate}
                onChange={(e) => setWeekEndingDate(e.target.value)}
                className="block w-full min-w-0 max-w-full h-10 pl-9 pr-2 sm:pr-3 text-[16px] sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black font-mono appearance-none"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="px-4 sm:px-6 pt-4 border-b border-gray-200">
            <div className="flex items-center gap-1">
              {[
                { id: "serviceTotals" as const, label: "Service Totals" },
                { id: "namedDonations" as const, label: "Named Donations" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveEntryTab(tab.id)}
                  className={`px-3 py-2 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors ${
                    activeEntryTab === tab.id
                      ? "border-black text-black"
                      : "border-transparent text-gray-500 hover:text-black"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0 p-4 sm:p-6">
            {activeEntryTab === "serviceTotals" && (
              <>
          <div className="hidden md:block max-w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 text-xs uppercase tracking-wide text-gray-600">
                  <th className="border border-gray-300 px-3 py-2 text-left w-20">Day</th>
                  <th className="border border-gray-300 px-3 py-2 text-left min-w-36 sm:w-40">Service Date</th>
                  <th className="border border-gray-300 px-3 py-2 text-left min-w-44">Service / Note</th>
                  <th className="border border-gray-300 px-3 py-2 text-left min-w-44">Fund</th>
                  <th className="border border-gray-300 px-3 py-2 text-right w-28">Cash</th>
                  <th className="border border-gray-300 px-3 py-2 text-right w-28">PDQ</th>
                  <th className="border border-gray-300 px-3 py-2 text-right w-28">Cheque</th>
                  <th className="border border-gray-300 px-3 py-2 text-right w-28">Total</th>
                  <th className="border border-gray-300 px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {serviceRows.map((row) => {
                  const rowTotal = parseMoney(row.cash) + parseMoney(row.pdq) + parseMoney(row.cheque);

                  return (
                    <tr key={row.id}>
                      <td className="border border-gray-300 px-3 py-2 font-mono text-xs text-gray-500">
                        {dayLabel(row.serviceDate)}
                      </td>
                      <td className="border border-gray-300 px-3 py-2">
                        <input
                          type="date"
                          value={row.serviceDate}
                          onChange={(e) => updateServiceRow(row.id, { serviceDate: e.target.value })}
                          className="block w-full min-w-0 max-w-full h-9 px-2 border border-gray-300 rounded-md font-mono text-[16px] sm:text-xs focus:outline-none focus:ring-2 focus:ring-black/10 appearance-none"
                        />
                      </td>
                      <td className="border border-gray-300 px-3 py-2">
                        <input
                          type="text"
                          value={row.serviceNote}
                          onChange={(e) => updateServiceRow(row.id, { serviceNote: e.target.value })}
                          placeholder="e.g., Sunday Service"
                          className="w-full h-9 px-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                        />
                      </td>
                      <td className="border border-gray-300 px-3 py-2">
                        <select
                          value={row.fundId}
                          onChange={(e) => updateServiceRow(row.id, { fundId: e.target.value })}
                          className="w-full h-9 px-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
                        >
                          <option value="">Select fund...</option>
                          {funds.map((fund) => (
                            <option key={fund._id} value={fund._id}>
                              {fund.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      {(["cash", "pdq", "cheque"] as const).map((field) => (
                        <td key={field} className="border border-gray-300 px-3 py-2">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">£</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row[field]}
                              onChange={(e) => updateServiceRow(row.id, { [field]: e.target.value })}
                              placeholder="0.00"
                              className="w-full h-9 pl-6 pr-2 border border-gray-300 rounded-md text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-black/10"
                            />
                          </div>
                        </td>
                      ))}
                      <td className="border border-gray-300 px-3 py-2 text-right font-mono font-bold">
                        {formatCurrency(rowTotal)}
                      </td>
                      <td className="border border-gray-300 px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeServiceRow(row.id)}
                          disabled={serviceRows.length === 1}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Remove row"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-gray-100 font-bold">
                  <td className="border border-gray-300 px-3 py-2" colSpan={4}>
                    TOTAL
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                    {formatCurrency(totals.cash)}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                    {formatCurrency(totals.pdq)}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                    {formatCurrency(totals.cheque)}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                    {formatCurrency(totals.total)}
                  </td>
                  <td className="border border-gray-300"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {serviceRows.map((row, index) => {
              const rowTotal =
                parseMoney(row.cash) +
                parseMoney(row.pdq) +
                parseMoney(row.cheque);

              return (
                <div key={row.id} className="border border-gray-300 rounded-md p-3 space-y-3 bg-white">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                        Service Row {index + 1}
                      </div>
                      <div className="text-xs font-mono text-gray-500">
                        {dayLabel(row.serviceDate)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeServiceRow(row.id)}
                      disabled={serviceRows.length === 1}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Service Date</label>
                      <input
                        type="date"
                        value={row.serviceDate}
                        onChange={(e) => updateServiceRow(row.id, { serviceDate: e.target.value })}
                        className="block w-full min-w-0 h-10 px-3 border border-gray-300 rounded-md font-mono text-[16px] focus:outline-none focus:ring-2 focus:ring-black/10 appearance-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Service / Note</label>
                      <input
                        type="text"
                        value={row.serviceNote}
                        onChange={(e) => updateServiceRow(row.id, { serviceNote: e.target.value })}
                        placeholder="e.g., Sunday Service"
                        className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Fund</label>
                      <select
                        value={row.fundId}
                        onChange={(e) => updateServiceRow(row.id, { fundId: e.target.value })}
                        className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
                      >
                        <option value="">Select fund...</option>
                        {funds.map((fund) => (
                          <option key={fund._id} value={fund._id}>
                            {fund.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(["cash", "pdq", "cheque"] as const).map((field) => (
                        <div key={field}>
                          <label className="block text-xs font-medium capitalize text-gray-600 mb-1">
                            {field}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row[field]}
                            onChange={(e) => updateServiceRow(row.id, { [field]: e.target.value })}
                            placeholder="0.00"
                            className="w-full h-10 px-2 border border-gray-300 rounded-md text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-black/10"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-gray-200 pt-3 text-sm">
                    <span className="font-bold text-gray-600">Total</span>
                    <span className="font-mono font-bold">{formatCurrency(rowTotal)}</span>
                  </div>
                </div>
              );
            })}

            <div className="border border-gray-300 bg-gray-100 rounded-md p-3 space-y-2 font-bold">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span>Cash</span>
                <span className="text-right font-mono">{formatCurrency(totals.cash)}</span>
                <span>PDQ</span>
                <span className="text-right font-mono">{formatCurrency(totals.pdq)}</span>
                <span>Cheque</span>
                <span className="text-right font-mono">{formatCurrency(totals.cheque)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-300 pt-2">
                <span>Total</span>
                <span className="font-mono">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={addServiceRow}
            className="w-full mt-4 py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-sage-400 hover:text-sage-700 hover:bg-sage-50 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Service Row
          </button>
              </>
            )}

            {activeEntryTab === "namedDonations" && (
              <div className="space-y-4">
                {namedDonations.length === 0 ? (
                  <div className="border border-dashed border-gray-300 rounded-md p-6 text-center">
                    <button
                      type="button"
                      onClick={addNamedDonation}
                      className="mx-auto py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-sage-400 hover:text-sage-700 hover:bg-sage-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Donation
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="hidden lg:block max-w-full overflow-visible">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-gray-100 text-xs uppercase tracking-wide text-gray-600">
                            <th className="border border-gray-300 px-3 py-2 text-left min-w-56">Donor</th>
                            <th className="border border-gray-300 px-3 py-2 text-left min-w-44">Category</th>
                            <th className="border border-gray-300 px-3 py-2 text-left min-w-44">Fund</th>
                            <th className="border border-gray-300 px-3 py-2 text-left w-32">Method</th>
                            <th className="border border-gray-300 px-3 py-2 text-right w-32">Amount</th>
                            <th className="border border-gray-300 px-3 py-2 text-center w-24">Gift Aid</th>
                            <th className="border border-gray-300 px-3 py-2 w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {namedDonations.map((row) => (
                            <tr key={row.id}>
                              <td className="border border-gray-300 px-3 py-2 align-top">
                                <DonorSearchInput
                                  value={row.donorName}
                                  onChange={(donorName) =>
                                    updateNamedDonation(row.id, { donorName, donorId: undefined })
                                  }
                                  onDonorSelect={(donor) =>
                                    updateNamedDonation(row.id, {
                                      donorId: donor.donorId ?? undefined,
                                      donorName: donor.donorName,
                                      isGiftAidEligible: donor.isGiftAidActive,
                                    })
                                  }
                                  placeholder="Search or add donor..."
                                />
                              </td>
                              <td className="border border-gray-300 px-3 py-2 align-top">
                                <select
                                  value={row.category}
                                  onChange={(e) => updateNamedDonation(row.id, { category: e.target.value })}
                                  className="w-full h-10 px-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
                                >
                                  {categories.length === 0 && <option value="Donation">Donation</option>}
                                  {categories.map((category) => (
                                    <option key={category._id} value={category.name}>
                                      {category.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="border border-gray-300 px-3 py-2 align-top">
                                <select
                                  value={row.fundId}
                                  onChange={(e) => updateNamedDonation(row.id, { fundId: e.target.value })}
                                  className="w-full h-10 px-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
                                >
                                  <option value="">Select fund...</option>
                                  {funds.map((fund) => (
                                    <option key={fund._id} value={fund._id}>
                                      {fund.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="border border-gray-300 px-3 py-2 align-top">
                                <select
                                  value={row.paymentMethod}
                                  onChange={(e) =>
                                    updateNamedDonation(row.id, {
                                      paymentMethod: e.target.value as NamedDonationPaymentMethod,
                                    })
                                  }
                                  className="w-full h-10 px-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
                                >
                                  <option value="Cash">Cash</option>
                                  <option value="Cheque">Cheque</option>
                                  <option value="Card">Card</option>
                                </select>
                              </td>
                              <td className="border border-gray-300 px-3 py-2 align-top">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={row.amount}
                                  onChange={(e) => updateNamedDonation(row.id, { amount: e.target.value })}
                                  placeholder="0.00"
                                  className="w-full h-10 px-2 border border-gray-300 rounded-md text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-black/10"
                                />
                              </td>
                              <td className="border border-gray-300 px-3 py-2 text-center align-top">
                                <input
                                  type="checkbox"
                                  checked={row.isGiftAidEligible}
                                  onChange={(e) =>
                                    updateNamedDonation(row.id, {
                                      isGiftAidEligible: e.target.checked,
                                    })
                                  }
                                  className="mt-3 h-4 w-4 rounded border-gray-300"
                                />
                              </td>
                              <td className="border border-gray-300 px-2 py-2 text-center align-top">
                                <button
                                  type="button"
                                  onClick={() => removeNamedDonation(row.id)}
                                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                  title="Remove donation"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-gray-100 font-bold">
                            <td className="border border-gray-300 px-3 py-2" colSpan={4}>
                              TOTAL
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                              {formatCurrency(totals.namedDonationTotal)}
                            </td>
                            <td className="border border-gray-300" colSpan={2}></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="lg:hidden space-y-3">
                      {namedDonations.map((row, index) => (
                        <div key={row.id} className="border border-gray-300 rounded-md p-3 space-y-3 bg-white">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                              Donation {index + 1}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeNamedDonation(row.id)}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                              title="Remove donation"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Donor</label>
                              <DonorSearchInput
                                value={row.donorName}
                                onChange={(donorName) =>
                                  updateNamedDonation(row.id, { donorName, donorId: undefined })
                                }
                                onDonorSelect={(donor) =>
                                  updateNamedDonation(row.id, {
                                    donorId: donor.donorId ?? undefined,
                                    donorName: donor.donorName,
                                    isGiftAidEligible: donor.isGiftAidActive,
                                  })
                                }
                                placeholder="Search or add donor..."
                              />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                                <select
                                  value={row.category}
                                  onChange={(e) => updateNamedDonation(row.id, { category: e.target.value })}
                                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
                                >
                                  {categories.length === 0 && <option value="Donation">Donation</option>}
                                  {categories.map((category) => (
                                    <option key={category._id} value={category.name}>
                                      {category.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Fund</label>
                                <select
                                  value={row.fundId}
                                  onChange={(e) => updateNamedDonation(row.id, { fundId: e.target.value })}
                                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
                                >
                                  <option value="">Select fund...</option>
                                  {funds.map((fund) => (
                                    <option key={fund._id} value={fund._id}>
                                      {fund.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Method</label>
                                <select
                                  value={row.paymentMethod}
                                  onChange={(e) =>
                                    updateNamedDonation(row.id, {
                                      paymentMethod: e.target.value as NamedDonationPaymentMethod,
                                    })
                                  }
                                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
                                >
                                  <option value="Cash">Cash</option>
                                  <option value="Cheque">Cheque</option>
                                  <option value="Card">Card</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={row.amount}
                                  onChange={(e) => updateNamedDonation(row.id, { amount: e.target.value })}
                                  placeholder="0.00"
                                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-black/10"
                                />
                              </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                              <input
                                type="checkbox"
                                checked={row.isGiftAidEligible}
                                onChange={(e) =>
                                  updateNamedDonation(row.id, {
                                    isGiftAidEligible: e.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-gray-300"
                              />
                              Gift Aid Eligible
                            </label>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between border border-gray-300 bg-gray-100 rounded-md p-3 font-bold">
                        <span>Total</span>
                        <span className="font-mono">{formatCurrency(totals.namedDonationTotal)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={addNamedDonation}
                      className="w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-sage-400 hover:text-sage-700 hover:bg-sage-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Donation
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-200 flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="px-4 py-3 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="grid grid-cols-3 gap-3 text-[11px] sm:text-xs">
              <div>
                <div className="text-gray-500">Services</div>
                <div className="font-mono font-bold">{formatCurrency(totals.total)}</div>
              </div>
              <div>
                <div className="text-gray-500">Named</div>
                <div className="font-mono font-bold">{formatCurrency(totals.namedDonationTotal)}</div>
              </div>
              <div>
                <div className="text-gray-500">Total</div>
                <div className="font-mono font-bold">{formatCurrency(totals.combinedTotal)}</div>
              </div>
            </div>
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
                disabled={isSubmitting || totals.combinedTotal === 0}
                className="px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Save</span> Draft
              </button>
              <button
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting || totals.combinedTotal === 0}
                className="px-3 py-2 text-xs font-medium text-white bg-black hover:bg-gray-800 rounded-md transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.1)] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {initialCollection ? "Save Changes" : "Submit"}
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
