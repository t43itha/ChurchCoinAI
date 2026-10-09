import { Check, LayoutList, Plus } from "lucide-react";
import { gbp } from "../cashEntry/format";
import { fieldLabel, nextIcon, nextItem, screenTitle } from "../wizard/ui";

interface TransferDoneStepProps {
  fromName: string;
  toName: string;
  amountPence: number;
  onMoreMoney: () => void;
  onDone: () => void;
}

export default function TransferDoneStep({ fromName, toName, amountPence, onMoreMoney, onDone }: TransferDoneStepProps) {
  return (
    <div className="pt-4 text-center">
      <div className="mx-auto mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-sage text-white ring-[10px] ring-sage-light">
        <Check size={36} aria-hidden="true" />
      </div>
      <h2 className={`${screenTitle} text-center`}>{`${gbp(amountPence / 100)} moved from ${fromName} to ${toName}.`}</h2>

      <div className="mt-6 text-left">
        <span className={fieldLabel}>What's next</span>
        <button type="button" onClick={onMoreMoney} className={`${nextItem} mb-2`}>
          <span className={`${nextIcon} bg-grey-light text-ink`}>
            <Plus size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <b className="block text-[14.5px] text-ink">Move more money</b>
            <span className="text-xs text-grey-mid">Start another transfer</span>
          </span>
        </button>
        <button type="button" onClick={onDone} className={nextItem}>
          <span className={`${nextIcon} bg-grey-light text-ink`}>
            <LayoutList size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <b className="block text-[14.5px] text-ink">Done</b>
            <span className="text-xs text-grey-mid">Back to the transactions</span>
          </span>
        </button>
      </div>
    </div>
  );
}
