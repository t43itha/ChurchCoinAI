import { Banknote, ChevronDown, ChevronRight, Edit2 } from "lucide-react";
import { sumMoney } from "../../convex/lib/money";
import { formatUkDate } from "../../lib/dateUtils";
import type { InPersonGivingLedger } from "../../lib/inPersonGiving";
import { gbp, weekRange } from "../cashEntry/format";
import { eyebrow, nextIcon, tagGrey } from "../wizard/ui";

interface InPersonGivingListProps {
  ledgers: InPersonGivingLedger[];
  isLoading: boolean;
  expandedIds: Set<string>;
  onToggle: (collectionId: string) => void;
  canEdit: boolean;
  onEdit: (ledger: InPersonGivingLedger) => void;
  giftAidEnabled: boolean;
}

const cell = "border-t border-ledger px-2.5 py-2 text-xs";
const numberCell = `${cell} text-right font-mono`;

// Cash collections by week. A week opens to its service totals and named donations.
export default function InPersonGivingList({
  ledgers,
  isLoading,
  expandedIds,
  onToggle,
  canEdit,
  onEdit,
  giftAidEnabled,
}: InPersonGivingListProps) {
  if (isLoading) {
    return <p className="py-12 text-center text-sm text-grey-mid">Loading in-person giving…</p>;
  }
  if (ledgers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-ledger py-12 text-center text-sm text-grey-mid">
        <Banknote size={28} className="opacity-40" aria-hidden="true" />
        No in-person giving matches this period.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-ledger overflow-hidden rounded-2xl border border-ledger bg-white">
      {ledgers.map((ledger) => {
        const expanded = expandedIds.has(ledger.collectionId);
        const cashTotal = sumMoney(ledger.rows, (row) => row.cash);
        const pdqTotal = sumMoney(ledger.rows, (row) => row.pdq);
        const chequeTotal = sumMoney(ledger.rows, (row) => row.cheque);
        const serviceTotal = sumMoney(ledger.rows, (row) => row.total);
        const namedTotal = sumMoney(ledger.namedDonations, (donation) => donation.amount);
        const fundLine = ledger.fundTotals.map((f) => `${f.fundName} ${gbp(f.total)}`).join(" · ");

        return (
          <li key={ledger.collectionId}>
            <div className="flex items-center gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => onToggle(ledger.collectionId)}
                aria-expanded={expanded}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className={`${nextIcon} bg-sage-light text-sage`} aria-hidden="true">
                  <Banknote size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[14.5px] text-ink">{weekRange(ledger.weekEndingDate)}</b>
                  <span className="block truncate text-xs text-grey-mid">{fundLine || "Unassigned fund"}</span>
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-sage">{gbp(ledger.total)}</span>
                {expanded ? (
                  <ChevronDown size={18} className="shrink-0 text-grey-mid" aria-hidden="true" />
                ) : (
                  <ChevronRight size={18} className="shrink-0 text-grey-mid" aria-hidden="true" />
                )}
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(ledger)}
                  aria-label="Edit in-person giving"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-grey-mid hover:text-ink"
                >
                  <Edit2 size={16} aria-hidden="true" />
                </button>
              )}
            </div>

            {expanded && (
              <div className="space-y-4 bg-paper px-4 pb-4">
                {ledger.rows.length > 0 && (
                  <div>
                    <p className={`${eyebrow} mb-2`}>Service totals</p>
                    <div className="overflow-x-auto rounded-xl border border-ledger bg-white">
                      <table className="w-full min-w-[520px] text-left">
                        <thead>
                          <tr className={eyebrow}>
                            <th scope="col" className={cell}>Day</th>
                            <th scope="col" className={cell}>Service date</th>
                            <th scope="col" className={cell}>Service / note</th>
                            <th scope="col" className={`${cell} text-right`}>Cash</th>
                            <th scope="col" className={`${cell} text-right`}>PDQ</th>
                            <th scope="col" className={`${cell} text-right`}>Cheque</th>
                            <th scope="col" className={`${cell} text-right`}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.rows.map((row) => (
                            <tr key={row.id}>
                              <td className={`${cell} font-mono text-grey-mid`}>{row.day}</td>
                              <td className={`${cell} font-mono`}>{formatUkDate(row.serviceDate)}</td>
                              <td className={`${cell} font-medium text-ink`}>{row.serviceNote}</td>
                              <td className={numberCell}>{gbp(row.cash)}</td>
                              <td className={numberCell}>{gbp(row.pdq)}</td>
                              <td className={numberCell}>{gbp(row.cheque)}</td>
                              <td className={`${numberCell} font-bold`}>{gbp(row.total)}</td>
                            </tr>
                          ))}
                          <tr className="font-bold">
                            <td colSpan={3} className={cell}>Total</td>
                            <td className={numberCell}>{gbp(cashTotal)}</td>
                            <td className={numberCell}>{gbp(pdqTotal)}</td>
                            <td className={numberCell}>{gbp(chequeTotal)}</td>
                            <td className={numberCell}>{gbp(serviceTotal)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {ledger.namedDonations.length > 0 && (
                  <div>
                    <p className={`${eyebrow} mb-2`}>Named donations</p>
                    <div className="overflow-x-auto rounded-xl border border-ledger bg-white">
                      <table className="w-full min-w-[480px] text-left">
                        <thead>
                          <tr className={eyebrow}>
                            <th scope="col" className={cell}>Donor</th>
                            <th scope="col" className={cell}>Category</th>
                            <th scope="col" className={cell}>Fund</th>
                            <th scope="col" className={cell}>Method</th>
                            {giftAidEnabled && <th scope="col" className={`${cell} text-center`}>Gift Aid</th>}
                            <th scope="col" className={`${cell} text-right`}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.namedDonations.map((donation) => (
                            <tr key={donation.id}>
                              <td className={`${cell} font-medium text-ink`}>{donation.donorName}</td>
                              <td className={cell}>{donation.category}</td>
                              <td className={cell}>{donation.fundName}</td>
                              <td className={cell}>{donation.paymentMethod ?? "-"}</td>
                              {giftAidEnabled && (
                                <td className={`${cell} text-center`}>
                                  <span className={tagGrey}>{donation.isGiftAidEligible ? "Yes" : "No"}</span>
                                </td>
                              )}
                              <td className={`${numberCell} font-bold`}>{gbp(donation.amount)}</td>
                            </tr>
                          ))}
                          <tr className="font-bold">
                            <td colSpan={giftAidEnabled ? 5 : 4} className={cell}>Total</td>
                            <td className={numberCell}>{gbp(namedTotal)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-xl border border-ledger bg-white px-3 py-2.5 text-xs font-bold text-ink">
                  <span>Collection total</span>
                  <span className="font-mono">{gbp(ledger.total)}</span>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
