import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Link as LinkIcon, Link2, Trash2, Unlink } from "lucide-react";
import type { Fund, Pledge, Transaction } from "../../types";
import { formatUkDate } from "../../lib/dateUtils";
import { linkState } from "../../lib/movementMatching";
import { isVoidedTransaction } from "../../lib/reportableTransactions";
import { nextIcon, tagAmber, tagBase, tagGrey, tagSage } from "../wizard/ui";
import { formatSignedAmount } from "./transactionView";

export interface TransactionListProps {
  funds: Fund[];
  pledges: Pledge[];
  selectedIds: Set<string>;
  activeId?: string;
  canEdit: boolean;
  canDeleteTransfer: boolean;
  onOpen: (transaction: Transaction) => void;
  onToggleSelect: (id: string) => void;
  onLinkOtherSide: (transaction: Transaction) => void;
  onUnlink: (transaction: Transaction) => void;
  onDeleteTransfer: (transaction: Transaction) => void;
}

// One ledger line. The description opens the edit panel; the checkbox and the
// movement actions sit beside it so they never open the panel by accident.
export default function TransactionRow({
  transaction: t,
  list,
  dense = false,
}: {
  transaction: Transaction;
  list: TransactionListProps;
  dense?: boolean;
}) {
  const fund = list.funds.find((f) => f._id === t.fundId);
  const linkedPledge = list.pledges.find((p) => p._id === t.pledgeId);
  const linkedPledgeFund = linkedPledge ? list.funds.find((f) => f._id === linkedPledge.fundId) : undefined;
  const link = linkState(t);
  const isJournal = link.status === "journal";
  const isVoided = isVoidedTransaction(t);
  const isSelected = list.selectedIds.has(t._id);
  const isActive = list.activeId === t._id;
  const isIncome = t.type === "Income";
  const Icon = isJournal ? ArrowLeftRight : isIncome ? ArrowDownLeft : ArrowUpRight;
  const donorAndPledge = [t.donorName && `Ref ${t.donorName}`, linkedPledgeFund && `Linked to ${linkedPledgeFund.name}`]
    .filter(Boolean)
    .join(" · ");
  const categoryPill = t.category ? <span className={tagGrey}>{t.category}</span> : <span className={tagAmber}>Pick a category</span>;

  const checkbox = list.canEdit ? (
    <input
      type="checkbox"
      checked={isSelected}
      onChange={() => list.onToggleSelect(t._id)}
      aria-label={`Select ${t.description}`}
      className={`h-[18px] w-[18px] shrink-0 cursor-pointer rounded-md accent-amber md:transition-opacity ${
        isSelected ? "opacity-100" : "md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
      }`}
    />
  ) : null;

  const tags = (
    <>
      {t.pledgeId && <LinkIcon size={13} strokeWidth={2} className="shrink-0 text-sage" aria-hidden="true" />}
      {isVoided && (
        <span className={`${tagBase} bg-error-light text-error`} title={t.voidReason ? `Void reason: ${t.voidReason}` : undefined}>
          Voided
        </span>
      )}
      {link.status === "linked" && (
        <span className={tagSage} title="Linked to its other side">
          Linked
        </span>
      )}
      {isJournal && (
        <span className={tagGrey} title="Transfer between funds made in ChurchCoin">
          Journal
        </span>
      )}
      {t.isReconciled && (
        <span className={tagGrey} title="Ticked in a completed bank reconciliation">
          Reconciled
        </span>
      )}
    </>
  );

  const actions = list.canEdit && (
    <div className="flex shrink-0 items-center gap-0.5 opacity-100 md:opacity-0 md:transition-opacity md:group-focus-within:opacity-100 md:group-hover:opacity-100">
      {link.status === "waiting" && (
        <button
          type="button"
          onClick={() => list.onLinkOtherSide(t)}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-grey-mid hover:text-sage"
          title="Link other side"
          aria-label="Link other side"
        >
          <Link2 size={16} strokeWidth={1.9} aria-hidden="true" />
        </button>
      )}
      {link.status === "linked" && (
        <button
          type="button"
          onClick={() => list.onUnlink(t)}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-grey-mid hover:text-sage"
          title="Unlink from its other side"
          aria-label="Unlink"
        >
          <Unlink size={16} strokeWidth={1.9} aria-hidden="true" />
        </button>
      )}
      {link.status === "journal" && list.canDeleteTransfer && (
        <button
          type="button"
          onClick={() => list.onDeleteTransfer(t)}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-grey-mid hover:text-error"
          title="Delete transfer"
          aria-label="Delete transfer"
        >
          <Trash2 size={16} strokeWidth={1.9} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const rowTone = isActive
    ? "bg-white ring-1 ring-ink"
    : isSelected
      ? "bg-amber-light/50"
      : "hover:bg-grey-light/60";

  if (dense) {
    return (
      <tr className={`group border-t border-ledger transition-colors ${rowTone} ${isVoided ? "opacity-60" : ""}`}>
        <td className="w-10 pl-3.5 pr-1 py-2.5">{checkbox}</td>
        <td className="whitespace-nowrap px-2.5 py-2.5 font-mono text-[12.5px] text-grey-mid">{formatUkDate(t.date)}</td>
        <td className="w-full max-w-0 px-2.5 py-2.5">
          <button type="button" disabled={!list.canEdit} onClick={() => list.onOpen(t)} className="flex min-w-0 max-w-full items-center gap-2 text-left disabled:cursor-default">
            <span className="min-w-0 truncate text-sm font-semibold text-ink">{t.description}</span>
            {tags}
          </button>
          {donorAndPledge && <p className="truncate text-xs text-grey-mid">{donorAndPledge}</p>}
        </td>
        <td className="whitespace-nowrap px-2.5 py-2.5 text-[12.5px]">{categoryPill}</td>
        <td className="whitespace-nowrap px-2.5 py-2.5 text-[13px] text-grey-dark">{fund?.name}</td>
        <td
          className={`whitespace-nowrap px-2.5 py-2.5 text-right font-mono text-sm font-bold tabular-nums ${isIncome ? "text-sage" : "text-ink"}`}
        >
          {formatSignedAmount(t)}
        </td>
        <td className="w-24 pr-2 py-1 text-right">{actions}</td>
      </tr>
    );
  }

  return (
    <div className={`group flex min-h-[64px] items-center gap-3 px-3.5 py-2.5 transition-colors ${rowTone} ${isVoided ? "opacity-60" : ""}`}>
      {checkbox}
      <button
        type="button"
        onClick={() => list.onOpen(t)}
        disabled={!list.canEdit}
        aria-current={isActive ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
      >
        <span className={`${nextIcon} bg-grey-light text-grey-dark`} aria-hidden="true">
          <Icon size={16} strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <b className="truncate text-[14.5px] font-semibold text-ink">{t.description}</b>
            {tags}
          </span>
          <span className="mt-0.5 block truncate text-xs text-grey-mid">
            {[fund?.name, t.paymentMethod, donorAndPledge].filter(Boolean).join(" · ")}
          </span>
          <span className="mt-1.5 flex sm:hidden">{categoryPill}</span>
        </span>
        <span className="hidden shrink-0 sm:inline-flex">{categoryPill}</span>
        <span
          className={`w-[112px] shrink-0 whitespace-nowrap text-right font-mono text-[15px] font-bold tabular-nums ${isIncome ? "text-sage" : "text-ink"}`}
        >
          {formatSignedAmount(t)}
        </span>
      </button>
      {actions}
    </div>
  );
}
