import { gbp } from "../cashEntry/format";
import { ReceiptCard, ReceiptRow } from "../wizard/Receipt";
import { eyebrow } from "../wizard/ui";
import { toPence } from "../../lib/reconciliation";
import { gapPounds } from "./format";

interface ReconcileReceiptProps {
  // Null until the balance is typed or saved.
  opening: number | null;
  closing: number | null;
  // Null until the session exists, so no lines have been ticked yet.
  split: { inPence: number; outPence: number } | null;
  // Null until the session exists.
  differencePence: number | null;
}

const money = (pounds: number | null) => (pounds === null ? "—" : gbp(pounds));

// The bank equation, worked live: opening, plus what is ticked in, less what is ticked out.
export default function ReconcileReceipt({ opening, closing, split, differencePence }: ReconcileReceiptProps) {
  const shouldClose =
    opening !== null && split !== null ? (toPence(opening) + split.inPence - split.outPence) / 100 : null;
  const balanced = differencePence === 0;

  return (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-ledger bg-white p-5 lg:flex">
      <div className={`${eyebrow} mb-2.5`}>Balance check</div>
      <ReceiptCard className="shadow-soft-md">
        <ReceiptRow label="Opening" value={money(opening)} dim={opening === null} />
        <ReceiptRow
          label="+ Ticked in"
          value={split ? money(split.inPence / 100) : "—"}
          dim={split === null}
        />
        <ReceiptRow
          label="− Ticked out"
          value={split ? money(split.outPence / 100) : "—"}
          dim={split === null}
        />
        <div className="my-2 border-t border-dashed border-ledger" />
        <ReceiptRow label="Should close" value={money(shouldClose)} dim={shouldClose === null} />
        <ReceiptRow label="Statement says" value={money(closing)} dim={closing === null} />
        <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-ledger pb-2 pt-3">
          <span className="text-xs text-grey-mid">Gap</span>
          <b
            className={`font-mono text-2xl tracking-tight ${
              differencePence === null ? "text-grey-mid" : balanced ? "text-sage" : "text-amber"
            }`}
          >
            {differencePence === null ? "—" : gbp(gapPounds(differencePence))}
          </b>
        </div>
      </ReceiptCard>
      <p className="mt-5 text-xs text-grey-mid">Saved as you go. Completing locks these lines.</p>
    </aside>
  );
}
