import { draftTotals, serviceGivingTotal, type CollectionDraft } from "../../lib/cashCollectionDraft";
import { roundMoney } from "../../convex/lib/money";
import Receipt, { MoneyRow } from "./Receipt";
import { useGiftAidEnabled } from "../app/useGiftAidEnabled";
import { gbp, shortDate } from "./format";
import RailStep, { type RailStepState } from "../wizard/RailStep";
import { eyebrow } from "../wizard/ui";
import type { WizardStep } from "./steps";
import type { WizardModel } from "./useCollectionDraft";

const GIFT_AID_RATE = 0.25;

interface RailProps {
  draft: CollectionDraft;
  steps: WizardStep[];
  current: number;
  onGo: (position: number) => void;
}

// Left rail (lg and up): each service's two steps with running totals, and the check.
export function WizardRail({ draft, steps, current, onGo }: RailProps) {
  const stateAt = (position: number): RailStepState =>
    position < current ? "done" : position === current ? "now" : "todo";
  const checkPosition = steps.findIndex((step) => step.kind === "review");

  return (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-ledger bg-white p-4 lg:flex">
      <div className={`${eyebrow} mx-2.5 mb-1`}>Week ending {shortDate(draft.weekEndingDate)}</div>
      {draft.services.map((service, serviceIndex) => {
        const givingAt = steps.findIndex((step) => step.kind === "giving" && step.serviceIndex === serviceIndex);
        const tithesAt = givingAt + 1;
        const givingTotal = serviceGivingTotal(service);
        return (
          <div key={service.id}>
            <div className={`${eyebrow} mx-2.5 mb-1 mt-4`}>
              {service.label} · {shortDate(service.date).split(" ").slice(1).join(" ")}
            </div>
            <RailStep
              marker="A"
              label="Loose giving"
              trailing={givingTotal ? gbp(givingTotal) : undefined}
              state={stateAt(givingAt)}
              onClick={() => onGo(givingAt)}
            />
            <RailStep
              marker="B"
              label="Tithe envelopes"
              trailing={service.tithes.length ? String(service.tithes.length) : undefined}
              state={stateAt(tithesAt)}
              onClick={() => onGo(tithesAt)}
            />
          </div>
        );
      })}
      {checkPosition >= 0 && (
        <div className="mt-4">
          <RailStep marker="✓" label="Check" state={stateAt(checkPosition)} onClick={() => onGo(checkPosition)} />
        </div>
      )}
    </aside>
  );
}

export const AUTOSAVE_FAILED_MESSAGE =
  "Couldn't save to this device. Finish and save this count before closing.";

// Right column (lg and up): the live receipt, with Gift Aid and the week total.
export function WizardReceipt({
  model,
  autosaved,
  autosaveFailed,
}: {
  model: WizardModel;
  autosaved: boolean;
  autosaveFailed: boolean;
}) {
  const giftAidEnabled = useGiftAidEnabled();
  const totals = draftTotals(model.draft, model.ctx);
  return (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-ledger bg-white p-5 lg:flex">
      <div className={`${eyebrow} mb-2.5`}>Live receipt</div>
      <Receipt model={model} className="shadow-soft-md">
        {giftAidEnabled && (
          <div className="mt-1 border-t border-dashed border-ledger pt-1">
            <MoneyRow label="Gift Aid eligible" value={totals.giftAidEligible} muted />
            <MoneyRow label="≈ to claim (25%)" value={roundMoney(totals.giftAidEligible * GIFT_AID_RATE)} muted />
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-ledger pb-2 pt-3">
          <span className="text-xs text-grey-mid">Week so far</span>
          <b className="font-mono text-2xl tracking-tight">{gbp(totals.grand)}</b>
        </div>
      </Receipt>
      {autosaved &&
        (autosaveFailed ? (
          <p className="mt-5 text-xs font-semibold text-amber">{AUTOSAVE_FAILED_MESSAGE}</p>
        ) : (
          <p className="mt-5 text-xs text-grey-mid">Saves to this device as you type.</p>
        ))}
    </aside>
  );
}
