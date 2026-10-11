import { useState, type FormEvent, type ReactNode } from "react";
import { Link2, RotateCcw, Trash2, Unlink, X, type LucideIcon } from "lucide-react";
import type { Fund, Pledge, Transaction, TransactionType } from "../../types";
import { linkState } from "../../lib/movementMatching";
import { formatUkDate } from "../../lib/dateUtils";
import { isVoidedTransaction } from "../../lib/reportableTransactions";
import DonorSearchInput from "../DonorSearchInput";
import { gbp } from "../cashEntry/format";
import StepFooter from "../wizard/StepFooter";
import { Segmented, amtBox, amtInput, amtSymbol, btnMd, btnOutline, btnPrimary, card, eyebrow, linkBtn, screenTitle, txtInput } from "../wizard/ui";
import { editDraftProblem, formatSignedAmount } from "./transactionView";

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

function pledgeLabel(pledge: Pledge, funds: Fund[]) {
  const fundName = funds.find((f) => f._id === pledge.fundId)?.name || "Unknown fund";
  return `${fundName}: £${pledge.amount} (${pledge.frequency}) - ${pledge.status}`;
}

type EditActionKey = "linkOtherSide" | "unlink" | "deleteTransfer" | "void" | "restore";

export interface EditAction {
  key: EditActionKey;
  label: string;
  danger?: boolean;
  run: () => void;
}

const ACTION_ICONS: Record<EditActionKey, LucideIcon> = {
  linkOtherSide: Link2,
  unlink: Unlink,
  deleteTransfer: Trash2,
  void: X,
  restore: RotateCcw,
};

// The movement and void actions a row offers. The server refuses any of them that a
// completed reconciliation blocks, and its message shows in the panel.
export function editActionsFor(
  transaction: Transaction,
  rights: Pick<TransactionEditPanelProps, "canEdit" | "canDeleteTransfer">,
  handlers: Pick<TransactionEditPanelProps, "onLinkOtherSide" | "onUnlink" | "onDeleteTransfer" | "onVoid" | "onRestore">
): EditAction[] {
  const { status } = linkState(transaction);
  const isJournal = status === "journal";
  const actions: EditAction[] = [];
  if (rights.canEdit && status === "waiting") {
    actions.push({ key: "linkOtherSide", label: "Link other side", run: () => handlers.onLinkOtherSide(transaction) });
  }
  if (rights.canEdit && status === "linked") {
    actions.push({ key: "unlink", label: "Unlink", run: () => handlers.onUnlink(transaction) });
  }
  if (rights.canDeleteTransfer && isJournal) {
    actions.push({ key: "deleteTransfer", label: "Delete transfer", danger: true, run: () => handlers.onDeleteTransfer(transaction) });
  }
  // Voided rows are restored from here; they can't be voided again.
  if (rights.canEdit && !isJournal) {
    if (isVoidedTransaction(transaction)) {
      actions.push({ key: "restore", label: "Restore transaction", run: () => handlers.onRestore(transaction) });
    } else {
      actions.push({ key: "void", label: "Void transaction", danger: true, run: () => handlers.onVoid(transaction) });
    }
  }
  return actions;
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
  // Read-only roles see every field as text. Linked rows keep description, date and donor editable.
  const readOnly = !canEdit;
  const locked = readOnly || isLinked;
  const direction = `${draft.type === "Income" ? "Money in" : "Money out"} (${formatSignedAmount(draft)})`;
  const relevantPledges = pledgesForDonor(draft, pledges);
  const linkedPledge = draft.pledgeId ? pledges.find((p) => p._id === draft.pledgeId) : undefined;
  const categoryOptions = categoryNamesFor(draft.type, draft.category);
  const actions = editActionsFor(
    transaction,
    { canEdit, canDeleteTransfer },
    { onLinkOtherSide, onUnlink, onDeleteTransfer, onVoid, onRestore }
  );

  // Both save buttons submit the form. The "Save and close" button is the one that names itself "close".
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const goNext = Boolean(nextTransaction) && !(submitter instanceof HTMLButtonElement && submitter.value === "close");
    const problem = editDraftProblem(draft);
    setError(problem);
    if (problem) return;
    setSaving(true);
    try {
      await onSave(draft, goNext);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update transaction.");
    } finally {
      setSaving(false);
    }
  };

  // Read-only roles get the value as plain text in place of the input.
  const field = (label: string, children: ReactNode, readOnlyText: string) => (
    <div className="min-w-0">
      {readOnly ? (
        <>
          <p className={`${eyebrow} mb-2 mt-5 block`}>{label}</p>
          <p className="break-words text-sm font-semibold text-ink">{readOnlyText}</p>
        </>
      ) : (
        <>
          <label className={`${eyebrow} mb-2 mt-5 block`}>{label}</label>
          {children}
        </>
      )}
    </div>
  );

  return (
    <form
      onSubmit={save}
      className={variant === "panel" ? `${card} flex max-h-[calc(100vh-3rem)] flex-col p-4` : "px-0.5"}
      aria-label="Edit transaction"
    >
      <div className={variant === "panel" ? "min-h-0 flex-1 overflow-y-auto" : undefined}>
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
          </div>,
          gbp(draft.amount)
        )}

        {field(
          "Money in or out",
          locked ? (
            <p className="text-sm font-semibold text-ink">{direction}</p>
          ) : (
            <Segmented
              label="Money in or out"
              options={TYPE_OPTIONS}
              value={draft.type === "Income" ? "Income" : "Expenditure"}
              onChange={(type) => {
                const categoryStillValid = categoryNamesFor(type).includes(draft.category);
                setDraft({ ...draft, type, category: categoryStillValid ? draft.category : "" });
              }}
            />
          ),
          direction
        )}

        {field(
          "Description",
          <input
            type="text"
            required
            value={draft.description}
            disabled={readOnly}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className={txtInput}
          />,
          draft.description
        )}

        <div className="grid gap-x-3 sm:grid-cols-2">
          {field(
            "Date",
            <input
              type="date"
              required
              value={draft.date}
              disabled={readOnly}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              className={txtInput}
            />,
            formatUkDate(draft.date)
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
            </select>,
            funds.find((f) => f._id === draft.fundId)?.name ?? "Unknown fund"
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
          </select>,
          draft.category || "No category"
        )}

        {field(
          "Donor (optional)",
          <DonorSearchInput
            value={draft.donorName || ""}
            disabled={readOnly}
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
          />,
          draft.donorName || "No donor"
        )}

        {draft.type === "Income" &&
          field(
            "Pledge or schedule",
            <select
              value={draft.pledgeId || ""}
              disabled={readOnly}
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
              {relevantPledges.map((p) => (
                <option key={p._id} value={p._id}>
                  {pledgeLabel(p, funds)}
                </option>
              ))}
            </select>,
            linkedPledge ? pledgeLabel(linkedPledge, funds) : "No linked pledge"
          )}

        {giftAidEnabled &&
          (readOnly ? (
            field("Gift Aid", null, draft.isGiftAidEligible ? "Eligible" : "Not eligible")
          ) : (
            <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold text-grey-dark">
              <input
                type="checkbox"
                checked={draft.isGiftAidEligible || false}
                onChange={(e) => setDraft({ ...draft, isGiftAidEligible: e.target.checked })}
                className="h-[18px] w-[18px] rounded-md accent-ink"
              />
              Gift Aid eligible
            </label>
          ))}

        {actions.length > 0 && (
          <div className="mt-6 grid gap-2 border-t border-ledger pt-4">
            {actions.map((action) => {
              const Icon = ACTION_ICONS[action.key];
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={action.run}
                  className={`${btnOutline} ${btnMd} ${action.danger ? "text-error" : ""}`}
                >
                  <Icon size={16} aria-hidden="true" /> {action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {canEdit ? (
        <StepFooter>
          <div className="grid gap-2">
            <button type="submit" disabled={saving} className={`${btnPrimary} h-[54px] text-base`}>
              {nextTransaction ? "Save · next" : "Save changes"}
            </button>
            {nextTransaction && (
              <button type="submit" value="close" disabled={saving} className={`${linkBtn} justify-center`}>
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
