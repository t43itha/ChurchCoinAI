import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { Fund } from "../types";
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

interface CashTakingsEntryProps {
  funds: Fund[];
  categories: Category[];
  onClose: () => void;
  onSuccess?: (result: { cashCollectionId: string; transactionCount: number }) => void;
}

function getWeekEndingDate(date: Date): string {
  const dayOfWeek = date.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const sunday = new Date(date);
  sunday.setDate(date.getDate() + daysUntilSunday);
  return sunday.toISOString().split("T")[0];
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

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
  });

const CashTakingsEntry: React.FC<CashTakingsEntryProps> = ({
  funds,
  onClose,
  onSuccess,
}) => {
  const today = new Date().toISOString().split("T")[0];
  const unrestrictedFund = funds.find((fund) => fund.type === "Unrestricted");
  const defaultFundId = unrestrictedFund?._id || funds[0]?._id || "";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekEndingDate, setWeekEndingDate] = useState(getWeekEndingDate(new Date()));
  const [notes, setNotes] = useState("");
  const [serviceRows, setServiceRows] = useState<ServiceRowEntry[]>([
    {
      id: generateId(),
      serviceDate: today,
      serviceNote: "Sunday Service",
      fundId: defaultFundId,
      cash: "",
      pdq: "",
      cheque: "",
    },
  ]);

  const submitCollection = useMutation(api.mutations.cashCollections.submitCollection);

  const totals = useMemo(() => {
    const rows = serviceRows.map((row) => ({
      cash: parseMoney(row.cash),
      pdq: parseMoney(row.pdq),
      cheque: parseMoney(row.cheque),
    }));

    const cash = rows.reduce((sum, row) => sum + row.cash, 0);
    const pdq = rows.reduce((sum, row) => sum + row.pdq, 0);
    const cheque = rows.reduce((sum, row) => sum + row.cheque, 0);

    return {
      cash,
      pdq,
      cheque,
      total: cash + pdq + cheque,
    };
  }, [serviceRows]);

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
    setServiceRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...updates } : row))
    );
  };

  const removeServiceRow = (id: string) => {
    setServiceRows((rows) => rows.filter((row) => row.id !== id));
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

      if (validRows.length === 0) {
        throw new Error("Please add at least one service row with a cash, PDQ, or cheque amount.");
      }

      const result = await submitCollection({
        weekEndingDate,
        collectionDate: validRows[0].serviceDate,
        notes: notes || undefined,
        status: asDraft ? "draft" : "submitted",
        serviceRows: validRows,
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-lg border-2 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-black">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sage-100 rounded-lg">
              <Banknote className="h-5 w-5 text-sage-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Record In-Person Giving</h2>
              <p className="text-sm text-gray-500">Enter weekly service totals for cash, PDQ, and cheques.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-md transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
          <div className="max-w-xs">
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
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 text-xs uppercase tracking-wide text-gray-600">
                  <th className="border border-gray-300 px-3 py-2 text-left w-20">Day</th>
                  <th className="border border-gray-300 px-3 py-2 text-left w-40">Service Date</th>
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
                          className="w-full h-9 px-2 border border-gray-300 rounded-md font-mono text-xs focus:outline-none focus:ring-2 focus:ring-black/10"
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

          <button
            type="button"
            onClick={addServiceRow}
            className="w-full mt-4 py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-sage-400 hover:text-sage-700 hover:bg-sage-50 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Service Row
          </button>
        </div>

        {error && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-200 flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

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
                disabled={isSubmitting || totals.total === 0}
                className="px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Save</span> Draft
              </button>
              <button
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting || totals.total === 0}
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
