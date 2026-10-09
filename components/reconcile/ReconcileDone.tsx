import { useState } from "react";
import { Check, LayoutList, Unlock } from "lucide-react";
import { gbp } from "../cashEntry/format";
import {
  btnMd,
  btnOutline,
  btnPrimary,
  fieldLabel,
  nextIcon,
  nextItem,
  screenTitle,
  txtArea,
  btnLg,
} from "../wizard/ui";
import { periodLabel } from "./format";

interface ReconcileDoneProps {
  month: string;
  fundName: string;
  periodStart: string;
  periodEnd: string;
  lineCount: number;
  closing: number;
  onReopen: (reason: string) => void;
  onClose: () => void;
}

export default function ReconcileDone({
  month,
  fundName,
  periodStart,
  periodEnd,
  lineCount,
  closing,
  onReopen,
  onClose,
}: ReconcileDoneProps) {
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="pt-4 text-center">
      <div className="mx-auto mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-sage text-white ring-[10px] ring-sage-light">
        <Check size={36} aria-hidden="true" />
      </div>
      <h2 className={`${screenTitle} text-center`}>{month} reconciled</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-grey-mid">
        {fundName} · {periodLabel(periodStart, periodEnd)} · {lineCount} line{lineCount === 1 ? "" : "s"} · closing{" "}
        {gbp(closing)}
      </p>

      <div className="mt-6 text-left">
        <span className={fieldLabel}>What's next</span>
        <button type="button" onClick={onClose} className={nextItem}>
          <span className={`${nextIcon} bg-grey-light text-ink`}>
            <LayoutList size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <b className="block text-[14.5px] text-ink">Back to reconciliations</b>
            <span className="text-xs text-grey-mid">See every statement and its status.</span>
          </span>
        </button>
      </div>

      <div className="mt-6 text-left">
        {reopening ? (
          <div className="space-y-2.5">
            <label htmlFor="reconcile-reopen-reason" className={fieldLabel}>
              Why reopen it?
            </label>
            <textarea
              id="reconcile-reopen-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="A line was entered on the wrong date…"
              className={txtArea}
            />
            <p className="text-xs text-grey-mid">Reopening unlocks these lines. The reason is kept on the record.</p>
            <button
              type="button"
              disabled={reason.trim() === ""}
              onClick={() => onReopen(reason.trim())}
              className={`${btnPrimary} ${btnLg}`}
            >
              Reopen
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setReopening(true)} className={`${btnOutline} ${btnMd}`}>
            <Unlock size={15} aria-hidden="true" />
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}
