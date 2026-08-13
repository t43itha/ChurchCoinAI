import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";

type ImportCategorizationProgressProps = {
  transactionCount: number;
};

const STATUS_MESSAGES = [
  {
    afterSeconds: 0,
    text: "Checking descriptions, amounts and transaction types",
  },
  {
    afterSeconds: 6,
    text: "Comparing entries with your church's categories",
  },
  {
    afterSeconds: 16,
    text: "Preparing suggestions for your review",
  },
  {
    afterSeconds: 30,
    text: "Still working — larger ledgers can take a little longer",
  },
] as const;

const formatElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

const ImportCategorizationProgress: React.FC<
  ImportCategorizationProgressProps
> = ({ transactionCount }) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const statusMessage = useMemo(
    () =>
      [...STATUS_MESSAGES]
        .reverse()
        .find((status) => elapsedSeconds >= status.afterSeconds)?.text ??
      STATUS_MESSAGES[0].text,
    [elapsedSeconds]
  );

  return (
    <section
      className="mb-4 overflow-hidden rounded-xl border border-[#cfddcf] bg-[#f7faf7] shadow-soft-sm"
      aria-busy="true"
      aria-label="Auto-categorisation in progress"
    >
      <div className="flex items-start justify-between gap-4 px-4 pb-3 pt-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#c9d8c9] bg-white text-sage-dark">
            <Sparkles size={17} strokeWidth={1.9} />
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#f7faf7] bg-amber" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-ink">
              Working through {transactionCount.toLocaleString("en-GB")} ledger
              {transactionCount === 1 ? " entry" : " entries"}
            </h4>
            <p
              className="mt-1 text-xs text-grey-mid"
              aria-live="polite"
              aria-atomic="true"
            >
              {statusMessage}
            </p>
          </div>
        </div>
        <span
          className="shrink-0 rounded-md border border-ledger bg-white px-2 py-1 font-mono text-[10px] font-semibold tabular-nums text-grey-mid"
          aria-hidden="true"
        >
          {formatElapsed(elapsedSeconds)}
        </span>
      </div>

      <div className="relative h-1 overflow-hidden bg-[#e2ebe2]" aria-hidden="true">
        <span className="ledger-processing-scan absolute inset-y-0 left-0 w-1/3 bg-sage" />
      </div>

      <div className="grid gap-3 border-t border-[#e3ebe3] bg-white/70 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-grey-mid">
          <CheckCircle2 size={13} className="shrink-0 text-sage" />
          <span>Nothing is imported until you review and confirm.</span>
        </div>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {["Category", "Fund", "Gift Aid"].map((label, index) => (
            <span
              key={label}
              className="ledger-processing-cell rounded border border-ledger bg-paper px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wide text-grey-mid"
              style={{ animationDelay: `${index * 240}ms` }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ImportCategorizationProgress;
