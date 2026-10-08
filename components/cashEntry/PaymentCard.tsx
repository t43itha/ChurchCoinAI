import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { countTotal, type AmountField, type PaymentLine } from "../../lib/cashCollectionDraft";
import { coinsValueOf, gbp, noteCountOf } from "./format";
import { amtBox, amtInput, amtSymbol, card, linkBtn, linkBtnSm } from "./ui";

interface PaymentCardProps {
  title: string;
  tag: ReactNode;
  line: PaymentLine;
  removable?: boolean;
  // Rendered under the heading, e.g. the picker for a fund that no longer exists.
  notice?: ReactNode;
  onAmount: (field: AmountField, value: string) => void;
  onCount: () => void;
  onRemove?: () => void;
}

function AmountRow({
  label,
  ariaLabel,
  value,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-[70px_minmax(0,1fr)] items-center gap-2">
      <span className="text-xs font-semibold text-grey-mid">{label}</span>
      <label className={amtBox}>
        <span className={amtSymbol}>£</span>
        <input
          aria-label={ariaLabel}
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={amtInput}
        />
      </label>
    </div>
  );
}

// One giving card: a cash amount, with cheque and card revealed on demand.
export default function PaymentCard({
  title,
  tag,
  line,
  removable,
  notice,
  onAmount,
  onCount,
  onRemove,
}: PaymentCardProps) {
  const [chequeChosen, setChequeChosen] = useState(false);
  const [cardChosen, setCardChosen] = useState(false);
  // An amount already on the line always shows its input, whatever the local state.
  const showCheque = chequeChosen || line.cheque !== "";
  const showCard = cardChosen || line.card !== "";
  const counted = line.count !== null && countTotal(line.count) > 0;

  return (
    <div className={card}>
      <div className="mb-1 flex items-center gap-2">
        <b className="min-w-0 flex-1 truncate text-[15px] text-ink">{title}</b>
        {tag}
        {removable && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${title}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center -mr-2 rounded-[9px] text-grey-mid hover:bg-error-light hover:text-error"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {notice}

      <AmountRow label="Cash" ariaLabel={`${title} cash`} value={line.cash} onChange={(value) => onAmount("cash", value)} />

      {counted && line.count && (
        <div className="ml-[78px] mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-sage">
          <span className="truncate">
            ✓ {noteCountOf(line.count)} notes + {gbp(coinsValueOf(line.count))} coins
          </span>
          <button type="button" onClick={onCount} className={`${linkBtnSm} ml-auto`}>
            Edit
          </button>
        </div>
      )}

      {showCheque && (
        <AmountRow label="Cheques" ariaLabel={`${title} cheques`} value={line.cheque} onChange={(value) => onAmount("cheque", value)} />
      )}
      {showCard && (
        <AmountRow label="Card" ariaLabel={`${title} card`} value={line.card} onChange={(value) => onAmount("card", value)} />
      )}

      <div className="-mt-1 flex flex-wrap gap-x-4">
        {!counted && (
          <button type="button" onClick={onCount} className={linkBtn}>
            Count it
          </button>
        )}
        {!showCheque && (
          <button type="button" onClick={() => setChequeChosen(true)} className={linkBtn}>
            + Cheque
          </button>
        )}
        {!showCard && (
          <button type="button" onClick={() => setCardChosen(true)} className={linkBtn}>
            + Card
          </button>
        )}
      </div>
    </div>
  );
}
