import { Loader2 } from "lucide-react";
import { roundMoney } from "../../convex/lib/money";
import { NOTE_VALUES, draftTotals } from "../../lib/cashCollectionDraft";
import { FundType } from "../../types";
import Receipt, { ReceiptRow } from "./Receipt";
import { gbp, shortDate } from "./format";
import {
  btnGhost,
  btnLg,
  btnSage,
  darkCard,
  eyebrow,
  fieldLabel,
  screenHelp,
  screenTitle,
  txtInput,
} from "./ui";
import type { WizardModel, SaveStatus } from "./useCollectionDraft";

const GIFT_AID_RATE = 0.25;
// Floats can leave a sub-penny remainder when the bag counts cover the cash total.
const PENNY = 0.005;

interface ReviewStepProps {
  model: WizardModel;
  // Omitted when the collection is read-only, so no Edit links are shown.
  onEdit?: (serviceIndex: number) => void;
  readOnlyReason?: string | null;
}

export default function ReviewStep({ model, onEdit, readOnlyReason }: ReviewStepProps) {
  const { draft, ctx, dispatch } = model;
  const totals = draftTotals(draft, ctx);
  const envelopesCash = roundMoney(totals.byMethod.cash - totals.slip.counted);
  const claimable = roundMoney(totals.giftAidEligible * GIFT_AID_RATE);
  const weekEnding = shortDate(draft.weekEndingDate);

  return (
    <div>
      <h2 className={screenTitle}>Does this match your count?</h2>
      {readOnlyReason ? (
        <>
          <p className={screenHelp}>This saved collection is shown for reference and can't be changed here.</p>
          <div className="mb-3.5 rounded-2xl bg-amber-light p-3 text-sm text-amber">{readOnlyReason}</div>
        </>
      ) : (
        <p className={screenHelp}>Tap Edit to change anything. Nothing reaches the ledger until you confirm.</p>
      )}

      <div className={`${darkCard} mb-3.5`}>
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/55">
          Week total · w/e {weekEnding}
        </div>
        <div className="mt-1 font-mono text-[30px] font-bold tracking-tight">{gbp(totals.grand)}</div>
        <div className="mt-2.5 border-t border-white/15">
          {totals.byFund.map(({ fundId, total }) => {
            const fund = model.fundById(fundId);
            return (
              <div key={fundId} className="flex items-baseline justify-between gap-2.5 border-b border-white/10 py-1.5 text-[13.5px] last:border-b-0">
                <span className="min-w-0 truncate text-white/85">
                  {model.fundName(fundId)}
                  {fund && fund.type !== FundType.UNRESTRICTED && (
                    <em className="ml-1.5 text-[10.5px] font-bold uppercase not-italic tracking-wide text-white/50">
                      {fund.type}
                    </em>
                  )}
                </span>
                <b className="whitespace-nowrap font-mono text-sm">{gbp(total)}</b>
              </div>
            );
          })}
        </div>
      </div>

      <Receipt model={model} onEdit={onEdit} />

      <div className="mt-4 rounded-2xl border border-ledger bg-white px-4 py-3">
        {totals.byProgramme.length > 0 && (
          <>
            <div className={`${eyebrow} mb-1 mt-1.5`}>Programmes · within Offering</div>
            {totals.byProgramme.map(({ programmeId, total }) => (
              <ReceiptRow key={programmeId} label={model.programmeName(programmeId)} value={total} />
            ))}
            <div className="my-2 border-t border-dashed border-ledger" />
          </>
        )}

        <div className={`${eyebrow} mb-1 mt-1.5`}>To bank</div>
        <ReceiptRow label="Cash" value={totals.byMethod.cash} />
        {totals.slip.counted > 0 && (
          <>
            {NOTE_VALUES.filter((value) => (totals.slip.notes[value] ?? 0) > 0).map((value) => {
              const quantity = totals.slip.notes[value] ?? 0;
              return <ReceiptRow key={value} label={`£${value} notes × ${quantity}`} value={quantity * value} sub />;
            })}
            <ReceiptRow label="Coins (bagged)" value={totals.slip.coins} sub />
            {envelopesCash > PENNY && (
              <ReceiptRow label="Envelopes & typed totals" value={envelopesCash} sub muted />
            )}
          </>
        )}
        <ReceiptRow label="Cheques" value={totals.byMethod.cheque} />
        <ReceiptRow label="Card machine (settles itself)" value={totals.byMethod.card} />

        <div className="my-2 border-t border-dashed border-ledger" />
        <div className={`${eyebrow} mb-1 mt-1.5`}>Gift Aid</div>
        <ReceiptRow label="Eligible tithes" value={totals.giftAidEligible} />
        <ReceiptRow label="≈ to claim (25%)" value={claimable} />
      </div>

      <span className={fieldLabel}>Counted by (optional)</span>
      <div className="grid grid-cols-2 gap-2.5">
        <input
          aria-label="First counter"
          className={txtInput}
          placeholder="First counter"
          autoComplete="off"
          value={draft.counters[0]}
          onChange={(event) => dispatch({ type: "setCounter", index: 0, value: event.target.value })}
        />
        <input
          aria-label="Second counter"
          className={txtInput}
          placeholder="Second counter"
          autoComplete="off"
          value={draft.counters[1]}
          onChange={(event) => dispatch({ type: "setCounter", index: 1, value: event.target.value })}
        />
      </div>
    </div>
  );
}

export function ReviewFooter({
  model,
  saving,
  error,
  onSave,
}: {
  model: WizardModel;
  saving: boolean;
  error: string | null;
  onSave: (status: SaveStatus) => void;
}) {
  const grand = draftTotals(model.draft, model.ctx).grand;
  const blocked = saving || grand < PENNY;
  return (
    <div className="space-y-2">
      {error && <p className="rounded-xl bg-error-light px-3 py-2.5 text-sm text-error">{error}</p>}
      <button type="button" disabled={blocked} onClick={() => onSave("submitted")} className={`${btnSage} ${btnLg}`}>
        {saving ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : `✓ Confirm & save ${gbp(grand)}`}
      </button>
      <button type="button" disabled={blocked} onClick={() => onSave("draft")} className={btnGhost}>
        Save for later
      </button>
    </div>
  );
}
