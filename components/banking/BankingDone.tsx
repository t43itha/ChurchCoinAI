import { Banknote, Check, ListChecks } from "lucide-react";
import { gbp } from "../cashEntry/format";
import { fieldLabel, nextIcon, nextItem, screenTitle } from "../wizard/ui";
import { countLabel, differenceText } from "./format";

export interface BankedSummary {
  bankedTotal: number;
  variance: number;
  collectionCount: number;
  creditCount: number;
}

interface BankingDoneProps {
  summary: BankedSummary;
  waitingCount: number;
  waitingTotal: number;
  onAnother: () => void;
  onBack: () => void;
}

export default function BankingDone({ summary, waitingCount, waitingTotal, onAnother, onBack }: BankingDoneProps) {
  return (
    <div className="pt-4 text-center">
      <div className="mx-auto mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-sage text-white ring-[10px] ring-sage-light">
        <Check size={36} aria-hidden="true" />
      </div>
      <h2 className={`${screenTitle} text-center`}>{gbp(summary.bankedTotal)} banked</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-grey-mid">
        {countLabel(summary.collectionCount, "collection")} · {countLabel(summary.creditCount, "bank credit")} · difference{" "}
        {differenceText(summary.variance)}
      </p>

      <div className="mt-6 text-left">
        <span className={fieldLabel}>What's next</span>
        {waitingCount > 0 && (
          <button type="button" onClick={onAnother} className={`${nextItem} mb-2`}>
            <span className={`${nextIcon} bg-grey-light text-ink`}>
              <Banknote size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] text-ink">Bank another deposit</b>
              <span className="text-xs text-grey-mid">
                {gbp(waitingTotal)} still waiting in {countLabel(waitingCount, "collection")}
              </span>
            </span>
          </button>
        )}
        <button type="button" onClick={onBack} className={nextItem}>
          <span className={`${nextIcon} bg-grey-light text-ink`}>
            <ListChecks size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <b className="block text-[14.5px] text-ink">Back to banking</b>
            <span className="text-xs text-grey-mid">See the history of bankings.</span>
          </span>
        </button>
      </div>
    </div>
  );
}
