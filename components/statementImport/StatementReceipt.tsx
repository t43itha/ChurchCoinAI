import type { ReactNode } from "react";
import { ReceiptCard, ReceiptRow } from "../wizard/Receipt";
import { eyebrow } from "../wizard/ui";
import { gbp } from "../cashEntry/format";
import { accountedFor, type StatementSummary } from "./statementFile";

const count = (value: number | null) => (value === null ? "—" : String(value));

// The running count of the statement. Every row read ends up in one line, so the
// last line reads "N / N" when nothing has been lost.
export default function StatementReceipt({
  fileName,
  summary,
  children,
}: {
  fileName: string;
  summary: StatementSummary;
  children?: ReactNode;
}) {
  const mapped = summary.added !== null;
  const money = (value: number) => (mapped && value ? gbp(value) : "—");
  return (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-ledger bg-white p-5 lg:flex">
      <div className={`${eyebrow} mb-2.5`}>This statement</div>
      <ReceiptCard className="shadow-soft-md">
        <div className="truncate text-sm font-bold text-ink">{fileName || "No file yet"}</div>
        <div className="mb-2 text-xs text-grey-mid">{fileName ? "Nothing is saved until you confirm" : "Nothing added yet"}</div>
        <ReceiptRow label="Rows read" value={count(summary.rowsRead)} dim={summary.rowsRead === null} />
        <ReceiptRow label="New" value={count(summary.added)} dim={!mapped} />
        <ReceiptRow label="Already imported" value={count(mapped ? summary.alreadyImported : null)} dim={!mapped || summary.alreadyImported === 0} />
        <ReceiptRow label="Skipped, no amount" value={count(mapped ? summary.skipped : null)} dim={!mapped || summary.skipped === 0} />
        <ReceiptRow label="Need a fix" value={count(mapped ? summary.needFix : null)} dim={!mapped || summary.needFix === 0} />
        <ReceiptRow label="Left out by you" value={count(mapped ? summary.leftOut : null)} dim={!mapped || summary.leftOut === 0} />
        <div className="my-2 border-t border-dashed border-ledger" />
        <ReceiptRow label="Money in" value={money(summary.moneyIn)} />
        <ReceiptRow label="Money out" value={money(summary.moneyOut)} />
        {children}
        {mapped && summary.rowsRead !== null && (
          <div className="mt-1 flex justify-between gap-2.5 border-t border-dashed border-ledger pb-2 pt-3">
            <span className="text-xs text-grey-mid">Accounted for</span>
            <b className="font-mono text-sm">{accountedFor(summary)} / {summary.rowsRead}</b>
          </div>
        )}
      </ReceiptCard>
    </aside>
  );
}
