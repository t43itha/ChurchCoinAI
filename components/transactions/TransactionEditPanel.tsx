import { useState, type FormEvent, type ReactNode } from "react";
import { Link2, RotateCcw, Trash2, Unlink, X } from "lucide-react";
import type { Fund, Pledge, Transaction, TransactionType } from "../../types";
import { linkState } from "../../lib/movementMatching";
import { isVoidedTransaction } from "../../lib/reportableTransactions";
import DonorSearchInput from "../DonorSearchInput";
import StepFooter from "../wizard/StepFooter";
import { Segmented, amtBox, amtInput, amtSymbol, btnMd, btnOutline, btnPrimary, card, eyebrow, linkBtn, screenTitle, txtInput } from "../wizard/ui";
import { formatSignedAmount } from "./transactionView";

export interface TransactionEditPanelProps {
  transaction: Transaction;
  funds: Fund[];
  pledges: Pledge[];
  categoryNamesFor: (type?: TransactionType, current?: string) => string[];
  giftAidEnabled: boolean;
  canEdit: boolean;
  canDeleteTransfer: boolean;
  // When there is another row after this one in the list, "Save · next" moves to it.
  nextTransaction?: Transaction;
  // Throws when the save is refused; the message is shown in the panel.
  onSave: (draft: Transaction, goNext: boolean) => Promise<void>;
  onClose: () => void;
  onVoid: (transaction: Transaction) => void;
  onRestore: (transaction: Transaction) => void;
  onLinkOtherSide: (transaction: Transaction) => void;
  onUnlink: (transaction: Transaction) => void;
  onDeleteTransfer: (transaction: Transaction) => void;
  // "panel" is the xl side column; "sheet" sits inside a WizardFrame that has its own header.
  variant?: "panel" | "sheet";
}

const TYPE_OPTIONS = ["Income", "Expenditure"] as const;

function pledgesForDonor(draft: Transaction, pledges: Pledge[]) {
  // Keep the linked pledge in the list even if the donor name no longer matches.
  const linked = draft.pledgeId ? pledges.find((p) => p._id === draft.pledgeId) : undefined;
  const donor = draft.donorName?.toLowerCase();
  const matches = pledges.filter((p) => {
    if (linked && p._id === linked._id) return false;
    if (donor && p.donorName.toLowerCase().includes(donor)) return true;
    return Boolean(draft.donorId && p.donorId === draft.donorId);
  });
  return linked ? [linked, ...matches] : matches;
}

// Edit one ledger row. Remounted per row (keyed by id) so the draft starts from the saved values.
export default function TransactionEditPanel({
  transaction,
  funds,
  pledges,
  categoryNamesFor,
  giftAidEnabled,
  canEdit,
  canDeleteTransfer,
  nextTransaction,
  onSave,
  onClose,
  onVoid,
  onRestore,
  onLinkOtherSide,
  onUnlink,
  onDeleteTransfer,
  variant = "panel",
}: TransactionEditPanelProps) {
  const [draft, setDraft] = useState<Transaction>(transaction);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const link = linkState(transaction);
  const isLinked = link.status === "linked" || link.status === "journal";
  const isJournal = link.status === "journal";
  const isVoided = isVoidedTransaction(transaction);
  const locked = !canEdit || isLinked;
  const relevantPledges = pledgesForDonor(draft, pledges);
  const categoryOptions = categoryNamesFor(draft.type, draft.category);
  const hasActions =
    (canEdit && (link.status === "waiting" || link.status === "linked" || (!isJournal && !isVoided))) ||
    (canDeleteTransfer && isJournal);

  const save = async (event: FormEvent, goNext: boolean) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave(draft, goNext);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update transaction.");
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, children: ReactNode) => (
    <div className="min-w-0">
      <label className={`${eyebrow} mb-2 mt-5 block`}>{label}</label>
      {children}
    </div>
  );

  return (
    <form
      onSubmit={(event) => save(event, Boolean(nextTransaction))}
      className={variant === "panel" ? `${card} p-4` : "px-0.5"}
      aria-label="Edit transaction"
    >
      {variant === "panel" && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={eyebrow}>{transaction.date}</p>
            <h2 className={`${screenTitle} truncate`}>{transaction.description}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-grey-dark hover:bg-paper"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="mt-3 space-y-2 text-sm">
        {isVoided && (
          <p className="rounded-2xl bg-error-light px-3.5 py-2.5 font-semibold text-error">
            Voided{transaction.voidReason ? `: ${transaction.voidReason}` : ""}. It is left out of totals and reports.
          </p>
        )}
        {isLinked && !isJournal && (
          <p className="rounded-2xl bg-sage-light px-3.5 py-2.5 text-sage">
            Linked to its other side. Unlink to change the amount, direction, fund or category.
          </p>
        )}
        {isJournal && (
          <p className="rounded-2xl bg-grey-light px-3.5 py-2.5 text-grey-dark">
            Transfer between funds. It is edited as a pair, so change it from the transfer.
          </p>
        )}
        {transaction.isReconciled && (
          <p className="rounded-2xl bg-amber-light px-3.5 py-2.5 text-amber">
            Ticked in a bank reconciliation. A completed reconciliation locks it, and a save that is refused says why.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-2xl bg-error-light px-3.5 py-2.5 font-semibold text-error">
            {error}
          </p>
        )}
      </div>

      {field(
        "Amount",
        <div className="flex gap-2.5">
          <div className={`${amtBox} w-full`}>
            <span className={amtSymbol} aria-hidden="true">£</span>
            <input
              aria-label="Amount"
              type="number"
              step="0.01"
              required
              value={draft.amount}
              disabled={locked}
              onChange={(e) => setDraft({ ...draft, amount: parseFloat(e.target.value) })}
              className={amtInput}
            />
          </div>
        </div>
      )}

      {field(
        "Money in or out",
        isLinked ? (
          <p className="text-sm font-semibold text-ink">
            {draft.type === "Income" ? "Money in" : "Money out"} ({formatSignedAmount(draft)})
          </p>
        ) : (
          <Segmented
            label="Money in or out"
            options={TYPE_OPTIONS}
            value={draft.type === "Income" ? "Income" : "Expenditure"}
            onChange={(type) => {
              if (locked) return;
              const categoryStillValid = categoryNamesFor(type).includes(draft.category);
              setDraft({ ...draft, type, category: categoryStillValid ? draft.category : "" });
            }}
          />
        )
      )}

      {field(
        "Description",
        <input
          type="text"
          required
          value={draft.description}
          disabled={!canEdit}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          className={txtInput}
        />
      )}

      <div className="grid gap-x-3 sm:grid-cols-2">
        {field(
          "Date",
          <input
            type="date"
            required
            value={draft.date}
            disabled={!canEdit}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            className={txtInput}
          />
        )}
        {field(
          "Fund",
          <select
            value={draft.fundId}
            disabled={locked}
            onChange={(e) => setDraft({ ...draft, fundId: e.target.value })}
            className={txtInput}
          >
            {funds.map((f) => (
              <option key={f._id} value={f._id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {field(
        "Category",
        <select
          value={draft.category}
          disabled={locked}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          className={txtInput}
        >
          {!draft.category && <option value="">Pick a category</option>}
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}

      {field(
        "Donor (optional)",
        <DonorSearchInput
          value={draft.donorName || ""}
          onChange={(name) => setDraft({ ...draft, donorName: name })}
          onDonorSelect={(donor) =>
            setDraft({
              ...draft,
              donorName: donor.donorName,
              donorId: donor.donorId ?? undefined,
              isGiftAidEligible: donor.isGiftAidActive,
            })
          }
          placeholder="Search or add donor…"
        />
      )}

      {draft.type === "Income" &&
        field(
          "Pledge or schedule",
          <select
            value={draft.pledgeId || ""}
            disabled={!canEdit}
            onChange={(e) => {
              const pid = e.target.value;
              setDraft({
                ...draft,
                pledgeId: pid || undefined,
                // Fill the donor name from the pledge when it is empty.
                donorName: draft.donorName || !pid ? draft.donorName : pledges.find((pl) => pl._id === pid)?.donorName,
              });
            }}
            className={txtInput}
          >
            <option value="">No linked pledge</option>
            {relevantPledges.map((p) => {
              const fundName = funds.find((f) => f._id === p.fundId)?.name || "Unknown fund";
              return (
                <option key={p._id} value={p._id}>
                  {fundName}: £{p.amount} ({p.frequency}) - {p.status}
                </option>
              );
            })}
          </select>
        )}

      {giftAidEnabled && (
        <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold text-grey-dark">
          <input
            type="checkbox"
            checked={draft.isGiftAidEligible || false}
            disabled={!canEdit}
            onChange={(e) => setDraft({ ...draft, isGiftAidEligible: e.target.checked })}
            className="h-[18px] w-[18px] rounded-md accent-ink"
          />
          Gift Aid eligible
        </label>
      )}

      {hasActions && (
        <div className="mt-6 grid gap-2 border-t border-ledger pt-4">
          {canEdit && link.status === "waiting" && (
            <button type="button" onClick={() => onLinkOtherSide(transaction)} className={`${btnOutline} ${btnMd}`}>
              <Link2 size={16} aria-hidden="true" /> Link other side
            </button>
          )}
          {canEdit && link.status === "linked" && (
            <button type="button" onClick={() => onUnlink(transaction)} className={`${btnOutline} ${btnMd}`}>
              <Unlink size={16} aria-hidden="true" /> Unlink
            </button>
          )}
          {canDeleteTransfer && isJournal && (
            <button type="button" onClick={() => onDeleteTransfer(transaction)} className={`${btnOutline} ${btnMd} text-error`}>
              <Trash2 size={16} aria-hidden="true" /> Delete transfer
            </button>
          )}
          {canEdit && !isJournal && !isVoided && (
            <button type="button" onClick={() => onVoid(transaction)} className={`${btnOutline} ${btnMd} text-error`}>
              <X size={16} aria-hidden="true" /> Void transaction
            </button>
          )}
          {canEdit && !isJournal && isVoided && (
            <button type="button" onClick={() => onRestore(transaction)} className={`${btnOutline} ${btnMd}`}>
              <RotateCcw size={16} aria-hidden="true" /> Restore transaction
            </button>
          )}
        </div>
      )}

      {canEdit ? (
        <StepFooter>
          <div className="grid gap-2">
            <button type="submit" disabled={saving} className={`${btnPrimary} h-[54px] text-base`}>
              {nextTransaction ? "Save · next" : "Save changes"}
            </button>
            {nextTransaction && (
              <button
                type="button"
                disabled={saving}
                onClick={(event) => save(event, false)}
                className={`${linkBtn} justify-center`}
              >
                Save and close
              </button>
            )}
          </div>
        </StepFooter>
      ) : (
        <p className="mt-6 text-sm text-grey-mid">You can view this entry. Ask someone with edit access to change it.</p>
      )}
    </form>
  );
}
