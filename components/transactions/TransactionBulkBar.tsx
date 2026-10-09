import { createPortal } from "react-dom";
import { Loader2, Sparkles, X } from "lucide-react";
import type { Fund } from "../../types";
import { chipDark } from "../wizard/ui";

interface TransactionBulkBarProps {
  count: number;
  busy: boolean;
  categoryNames: string[];
  funds: Fund[];
  onAutoCategorise: () => void;
  onCategory: (category: string) => void;
  onFund: (fundId: string) => void;
  onClear: () => void;
}

const selectClass = `${chipDark} cursor-pointer appearance-none bg-ink pr-3 disabled:cursor-not-allowed disabled:opacity-40`;

// Floating bar for the rows ticked in the list. Mounted only while something is selected.
export default function TransactionBulkBar({
  count,
  busy,
  categoryNames,
  funds,
  onAutoCategorise,
  onCategory,
  onFund,
  onClear,
}: TransactionBulkBarProps) {
  return createPortal(
    <div
      role="region"
      aria-label="Selected transactions"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 flex-wrap items-center gap-2.5 rounded-2xl bg-ink p-3 text-white shadow-soft-lg"
    >
      <p className="mr-auto whitespace-nowrap pl-1 font-mono text-sm font-semibold">{count} selected</p>
      <button type="button" onClick={onAutoCategorise} disabled={busy} className={`${chipDark} gap-2 bg-ink disabled:opacity-60`}>
        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Sparkles size={15} strokeWidth={1.9} className="text-amber" aria-hidden="true" />}
        Auto-categorise
      </button>
      <label className="sr-only" htmlFor="bulk-category">Set category</label>
      <select
        id="bulk-category"
        value=""
        disabled={categoryNames.length === 0}
        title={categoryNames.length === 0 ? "Select income or expenditure on its own to change category" : undefined}
        onChange={(e) => e.target.value && onCategory(e.target.value)}
        className={selectClass}
      >
        <option value="">Set category</option>
        {categoryNames.map((c) => (
          <option key={c} value={c} className="text-ink">
            {c}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="bulk-fund">Set fund</label>
      <select id="bulk-fund" value="" onChange={(e) => e.target.value && onFund(e.target.value)} className={selectClass}>
        <option value="">Set fund</option>
        {funds.map((f) => (
          <option key={f._id} value={f._id} className="text-ink">
            {f.name}
          </option>
        ))}
      </select>
      <button type="button" onClick={onClear} aria-label="Clear selection" className="flex h-11 w-11 items-center justify-center rounded-xl text-white/70 hover:text-white">
        <X size={18} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>,
    document.body
  );
}
