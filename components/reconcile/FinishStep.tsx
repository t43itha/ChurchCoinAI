import { CircleAlert, ListChecks, PenLine } from "lucide-react";
import { gbp } from "../cashEntry/format";
import { fieldLabel, nextIcon, nextItem, screenHelp, screenTitle } from "../wizard/ui";
import { gapPounds } from "./format";
import type { ReconcileStepKind } from "./steps";

interface FinishStepProps {
  differencePence: number;
  // A completed reconciliation is already locked, so the copy says so instead of inviting completion.
  completed?: boolean;
  onGo: (step: ReconcileStepKind) => void;
}

// Positive: the ticked lines add up to more than the statement. Negative: the statement shows more.
export default function FinishStep({ differencePence, completed = false, onGo }: FinishStepProps) {
  if (differencePence === 0) {
    return (
      <div>
        <h2 className={screenTitle}>It balances</h2>
        <p className={screenHelp}>
          {completed
            ? "Completed — these lines are locked. Reopen the reconciliation to change anything."
            : "Your ticked lines and the statement agree. Completing locks these lines."}
        </p>
      </div>
    );
  }

  const over = differencePence > 0;
  return (
    <div>
      <h2 className={screenTitle}>There's a {gbp(gapPounds(differencePence))} gap</h2>
      <p className={screenHelp}>
        {over
          ? "Your ticked lines add up to more than the statement shows. Check nothing ticked is missing from the statement, and that the balances are copied correctly."
          : "The statement shows more than your ticked lines. Something on the statement may not be ticked yet, or may be missing from the ledger."}
      </p>

      <span className={fieldLabel}>Fix the gap</span>
      <button type="button" onClick={() => onGo("balances")} className={`${nextItem} mb-2`}>
        <span className={`${nextIcon} bg-grey-light text-ink`}>
          <PenLine size={17} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <b className="block text-[14.5px] text-ink">Check the balances</b>
          <span className="text-xs text-grey-mid">Make sure the opening and closing figures match the statement.</span>
        </span>
      </button>
      <button type="button" onClick={() => onGo("tick")} className={`${nextItem} mb-2`}>
        <span className={`${nextIcon} bg-grey-light text-ink`}>
          <ListChecks size={17} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <b className="block text-[14.5px] text-ink">Tick more lines</b>
          <span className="text-xs text-grey-mid">Go back and tick anything you have missed.</span>
        </span>
      </button>
      <div className={`${nextItem} cursor-default hover:bg-white`}>
        <span className={`${nextIcon} bg-amber-light text-amber`}>
          <CircleAlert size={17} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <b className="block text-[14.5px] text-ink">A line is missing</b>
          <span className="text-xs text-grey-mid">Add it in Transactions, then come back and tick it.</span>
        </span>
      </div>
    </div>
  );
}
