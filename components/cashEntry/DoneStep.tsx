import { Check, Landmark, PenLine, Plus } from "lucide-react";
import { roundMoney, sumMoney } from "../../convex/lib/money";
import { gbp, shortDate } from "./format";
import { fieldLabel, screenTitle } from "../wizard/ui";
import type { SavedResult, WizardModel } from "./useCollectionDraft";

const GIFT_AID_RATE = 0.25;

interface DoneStepProps {
  model: WizardModel;
  saved: SavedResult;
  // Omitted when the user cannot reach cash banking, so no dead button is shown.
  onBankIt?: () => void;
  // Omitted in edit mode: starting another week there would not create a new collection.
  onRecordAnother?: () => void;
}

const NEXT_ITEM =
  "flex w-full items-center gap-3.5 rounded-2xl border border-ledger bg-white p-3.5 text-left transition-colors hover:bg-grey-light";
const NEXT_ICON = "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl";

export default function DoneStep({ model, saved, onBankIt, onRecordAnother }: DoneStepProps) {
  const { totals, draft } = saved;
  const isDraft = saved.status === "draft";
  const tithes = totals.namedCount + totals.anonymousCount;
  const services = draft.services.length;
  const bankable = roundMoney(totals.byMethod.cash + totals.byMethod.cheque);
  const missing = sumMoney(totals.noDeclaration, (entry) => entry.total);

  return (
    <div className="pt-4 text-center">
      <div className="mx-auto mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-sage text-white ring-[10px] ring-sage-light">
        <Check size={36} aria-hidden="true" />
      </div>
      <h2 className={`${screenTitle} text-center`}>
        {gbp(totals.grand)} {isDraft ? "saved for later" : "recorded"}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-grey-mid">
        across {totals.byFund.length} fund{totals.byFund.length === 1 ? "" : "s"} ·{" "}
        {totals.byFund.map(({ fundId, total }) => `${model.fundName(fundId)} ${gbp(total)}`).join(" · ")}
        <br />
        Week ending {shortDate(draft.weekEndingDate)} · {services} service{services === 1 ? "" : "s"} · {tithes}{" "}
        tithe envelope{tithes === 1 ? "" : "s"}
      </p>

      <div className="mt-6 text-left">
        <span className={fieldLabel}>What's next</span>

        {!isDraft && onBankIt && (
          <button type="button" onClick={onBankIt} className={`${NEXT_ITEM} mb-2`}>
            <span className={`${NEXT_ICON} bg-sage-light text-sage`}>
              <Landmark size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] text-ink">Bank it</b>
              <span className="text-xs text-grey-mid">Pay in {gbp(bankable)} of cash and cheques</span>
            </span>
          </button>
        )}

        {totals.noDeclaration.length > 0 && (
          <div className={`${NEXT_ITEM} mb-2 cursor-default hover:bg-white`}>
            <span className={`${NEXT_ICON} bg-amber-light text-amber`}>
              <PenLine size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] text-ink">
                {totals.noDeclaration.length} tither{totals.noDeclaration.length === 1 ? "" : "s"} without a Gift Aid
                declaration
              </b>
              <span className="text-xs text-grey-mid">
                A declaration would add {gbp(roundMoney(missing * GIFT_AID_RATE))} on this week alone.
              </span>
            </span>
          </div>
        )}

        {onRecordAnother && (
          <button type="button" onClick={onRecordAnother} className={NEXT_ITEM}>
            <span className={`${NEXT_ICON} bg-grey-light text-ink`}>
              <Plus size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] text-ink">Record another week</b>
              <span className="text-xs text-grey-mid">Catch up on a missed week</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
