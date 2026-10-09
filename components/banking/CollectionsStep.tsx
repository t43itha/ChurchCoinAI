import { Check } from "lucide-react";
import { gbp, shortDate } from "../cashEntry/format";
import { linkBtnSm, screenHelp, screenTitle, tickBox, tickRow } from "../wizard/ui";
import AmountBox from "./AmountBox";
import type { AmountDraft, OpenCollection } from "./draft";

interface CollectionsStepProps {
  collections: readonly OpenCollection[];
  loading: boolean;
  isTicked: (collectionId: string) => boolean;
  overrides: Record<string, AmountDraft>;
  errors: Record<string, string>;
  onToggle: (collectionId: string) => void;
  onPartial: (collection: OpenCollection) => void;
  onFullAmount: (collectionId: string) => void;
  onAmount: (collectionId: string, field: keyof AmountDraft, value: string) => void;
}

export default function CollectionsStep({
  collections,
  loading,
  isTicked,
  overrides,
  errors,
  onToggle,
  onPartial,
  onFullAmount,
  onAmount,
}: CollectionsStepProps) {
  return (
    <div>
      <h2 className={screenTitle}>Which collections went to the bank?</h2>
      <p className={screenHelp}>Tick each collection in this deposit. Only part of one can go in if the rest is still to bank.</p>

      {loading ? (
        <p className="py-8 text-center text-sm text-grey-mid">Loading collections…</p>
      ) : collections.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ledger p-6 text-center text-sm text-grey-mid">
          Nothing is waiting to be banked.
        </p>
      ) : (
        <div className="space-y-2.5">
          {collections.map((collection) => {
            const ticked = isTicked(collection._id);
            const amounts = overrides[collection._id];
            const error = errors[collection._id];
            const label = shortDate(collection.weekEndingDate);
            return (
              <div key={collection._id}>
                <button
                  type="button"
                  aria-pressed={ticked}
                  onClick={() => onToggle(collection._id)}
                  className={`${tickRow} ${ticked ? "border-ink" : "border-ledger"}`}
                >
                  <span className={`${tickBox} ${ticked ? "border-ink bg-ink text-white" : "border-[#cfcac2]"}`}>
                    {ticked && <Check size={14} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14.5px] font-semibold">Week ending {label}</b>
                    <span className="block truncate font-mono text-[12px] text-grey-mid">
                      Cash {gbp(collection.openCashAmount)} · Cheques {gbp(collection.openChequeAmount)}
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-mono text-sm font-semibold text-ink">
                    {gbp(collection.openTotal)}
                  </span>
                </button>

                {ticked && (
                  <div className="mt-1.5 space-y-2.5 pl-[34px]">
                    {amounts ? (
                      <>
                        <AmountBox
                          label="Cash"
                          ariaLabel={`Cash to bank for week ending ${label}`}
                          value={amounts.cashAmount}
                          onChange={(value) => onAmount(collection._id, "cashAmount", value)}
                        />
                        <AmountBox
                          label="Cheques"
                          ariaLabel={`Cheques to bank for week ending ${label}`}
                          value={amounts.chequeAmount}
                          onChange={(value) => onAmount(collection._id, "chequeAmount", value)}
                        />
                        <button type="button" onClick={() => onFullAmount(collection._id)} className={linkBtnSm}>
                          Use the full amount
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => onPartial(collection)} className={linkBtnSm}>
                        Only part of it?
                      </button>
                    )}
                    {error && <p className="text-xs font-semibold text-error">{error}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
