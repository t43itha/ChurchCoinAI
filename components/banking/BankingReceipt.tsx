import { gbp, shortDate } from "../cashEntry/format";
import { ReceiptCard, ReceiptRow } from "../wizard/Receipt";
import { eyebrow } from "../wizard/ui";
import { differenceText } from "./format";
import type { BankingView, OpenCollection } from "./draft";

interface BankingReceiptProps {
  collections: readonly OpenCollection[];
  bankCount: number;
  view: BankingView;
}

// The deposit worked live: each ticked collection, what was counted, what the bank shows, and the difference.
export default function BankingReceipt({ collections, bankCount, view }: BankingReceiptProps) {
  const { variance } = view;
  const differenceClass =
    variance === null ? "text-grey-mid" : variance === 0 ? "text-sage" : "text-amber";

  return (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-ledger bg-white p-5 lg:flex">
      <div className={`${eyebrow} mb-2.5`}>Counted and banked</div>
      <ReceiptCard className="shadow-soft-md">
        {collections.length === 0 && <ReceiptRow label="Nothing ticked yet" value="—" dim />}
        {collections.map((collection) => {
          const total = view.collectionTotals[collection._id];
          return (
            <ReceiptRow
              key={collection._id}
              label={shortDate(collection.weekEndingDate)}
              value={total === undefined ? "—" : gbp(total)}
              sub
            />
          );
        })}
        <div className="my-2 border-t border-dashed border-ledger" />
        <ReceiptRow label="Counted" value={gbp(view.counted)} />
        <ReceiptRow label="In the bank" value={gbp(view.banked)} dim={bankCount === 0} />
        <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-ledger pb-2 pt-3">
          <span className="text-xs text-grey-mid">Difference</span>
          <b className={`font-mono text-2xl tracking-tight ${differenceClass}`}>{differenceText(variance)}</b>
        </div>
      </ReceiptCard>
      <p className="mt-5 text-xs text-grey-mid">Nothing is saved until you complete banking.</p>
    </aside>
  );
}
