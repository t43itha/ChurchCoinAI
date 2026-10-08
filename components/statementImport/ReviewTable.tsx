import { AlertTriangle, Link as LinkIcon, X } from "lucide-react";
import type { Fund, TransactionType } from "../../types";
import type { ImportReview } from "./useImportReview";
import type { PendingReviewTransaction } from "./types";

export const reviewSelectClass =
  "block w-full min-w-0 max-w-full rounded-sm border-transparent bg-paper py-2 text-xs font-bold text-grey-dark";
// Table cells are tighter than the card list.
const compactSelectClass = reviewSelectClass.replace("py-2", "py-1");

// Category select for one row. `options` must already be valid for the row's type.
export function CategorySelect({
  label,
  value,
  options,
  onChange,
  className = reviewSelectClass,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      title={value || "Select category"}
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Select...</option>
      {options.map((category) => (
        <option key={category} value={category}>{category}</option>
      ))}
    </select>
  );
}

export function FundSelect({
  label,
  value,
  funds,
  onChange,
  className = reviewSelectClass,
}: {
  label: string;
  value: string;
  funds: Fund[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const name = funds.find((fund) => fund._id === value)?.name;
  return (
    <select
      aria-label={label}
      title={name || "Select fund"}
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Select...</option>
      {funds.map((fund) => (
        <option key={fund._id} value={fund._id}>{fund.name}</option>
      ))}
    </select>
  );
}

// "Other side" suggestion, or the accepted pair, under a row's description.
function PairingNote({ row, pairing }: { row: PendingReviewTransaction; pairing: ImportReview["pairing"] }) {
  const rowId = row.reviewRowId ?? "";
  const active = pairing.activeFor(rowId);
  if (active) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-sage-dark">
        <LinkIcon size={12} className="shrink-0" />
        <span>Paired with {pairing.partnerLabel(active)}</span>
        <button type="button" onClick={() => pairing.undo(rowId, active)} className="font-bold underline hover:text-ink">Undo</button>
      </p>
    );
  }
  const suggestion = pairing.suggestionFor(rowId);
  if (!suggestion || pairing.isDismissed(rowId)) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-grey-dark">
      <span>Other side: {pairing.partnerLabel(suggestion)}</span>
      <button type="button" aria-label="Accept other side" onClick={() => pairing.accept(rowId, suggestion)} className="font-bold text-sage-dark underline hover:text-ink">Accept</button>
      <button type="button" aria-label="Dismiss other side" onClick={() => pairing.dismiss(rowId)} className="font-bold text-grey-mid underline hover:text-ink">Dismiss</button>
    </p>
  );
}

export interface ReviewTableProps {
  rows: PendingReviewTransaction[];
  // Indexes into `rows` of possible duplicates.
  duplicateWarnings: Set<number>;
  funds: Fund[];
  categoryNamesFor: (type?: TransactionType, current?: string) => string[];
  pairing: ImportReview["pairing"];
  onUpdate: (index: number, updates: Partial<PendingReviewTransaction>) => void;
  onRemove: (index: number) => void;
}

// Every row of a review batch, editable: a card list on phones and a table from md up.
export default function ReviewTable({
  rows,
  duplicateWarnings,
  funds,
  categoryNamesFor,
  pairing,
  onUpdate,
  onRemove,
}: ReviewTableProps) {
  return (
    <>
      <div className="ledger-space-y-3 md:hidden">
        {rows.map((transaction, index) => {
          const isDuplicate = duplicateWarnings.has(index);
          return (
            <article
              key={index}
              className={`rounded-lg border p-4 ${isDuplicate ? "border-amber-200 bg-amber-50" : "border-ledger bg-white"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-xs font-mono text-grey-mid">
                  {isDuplicate && (
                    <span title="Potential duplicate">
                      <AlertTriangle size={13} className="shrink-0 text-amber-600" />
                    </span>
                  )}
                  <span>{transaction.date}</span>
                </div>
                <span className="shrink-0 text-sm font-bold font-mono text-ink">
                  £{transaction.amount?.toFixed(2)}
                </span>
              </div>
              <p className="mt-2 break-words text-sm font-medium text-ink">
                {transaction.description || "No description"}
              </p>
              {transaction.requiresReview && <p className="mt-1 text-xs text-amber-700">Check suggested category and fund</p>}
              <PairingNote row={transaction} pairing={pairing} />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-grey-mid">Category</span>
                  <CategorySelect
                    label={`Category for import row ${index + 1}`}
                    value={transaction.category || ""}
                    options={categoryNamesFor(transaction.type, transaction.category)}
                    onChange={(category) => onUpdate(index, { category })}
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-grey-mid">Fund</span>
                  <FundSelect
                    label={`Fund for import row ${index + 1}`}
                    value={transaction.fundId || ""}
                    funds={funds}
                    onChange={(fundId) => onUpdate(index, { fundId })}
                  />
                </label>
              </div>
              {isDuplicate && (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-error hover:text-error-dark"
                >
                  <X size={14} /> Remove duplicate
                </button>
              )}
            </article>
          );
        })}
      </div>
      <table className="hidden w-full table-fixed text-left ledger-table md:table">
        <colgroup>
          <col className="w-[14%]" />
          <col className="w-[28%]" />
          <col className="w-[12%]" />
          <col className="w-[20%]" />
          <col className="w-[20%]" />
          <col className="w-[6%]" />
        </colgroup>
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
          {rows.map((t, i) => (
            <tr key={t.reviewRowId ?? i} className={duplicateWarnings.has(i) ? "bg-amber-50" : ""}>
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
              <td className="py-3 font-medium text-ink text-sm overflow-hidden">
                <div className="truncate" title={t.description}>{t.description}</div>
                {t.requiresReview && <p className="mt-1 text-xs text-amber-700">Check suggested category and fund</p>}
                <PairingNote row={t} pairing={pairing} />
              </td>
              <td className="py-3 font-mono text-xs">£{t.amount?.toFixed(2)}</td>
              <td className="py-3 overflow-hidden">
                <CategorySelect
                  label={`Category for import row ${i + 1}`}
                  value={t.category || ""}
                  options={categoryNamesFor(t.type, t.category)}
                  onChange={(category) => onUpdate(i, { category })}
                  className={compactSelectClass}
                />
              </td>
              <td className="py-3 overflow-hidden">
                <FundSelect
                  label={`Fund for import row ${i + 1}`}
                  value={t.fundId || ""}
                  funds={funds}
                  onChange={(fundId) => onUpdate(i, { fundId })}
                  className={compactSelectClass}
                />
              </td>
              <td className="py-3 text-center">
                {duplicateWarnings.has(i) && (
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
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
    </>
  );
}
