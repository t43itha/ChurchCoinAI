import { sumMoney } from "../../convex/lib/money";
import type { InPersonGivingLedger } from "../../lib/inPersonGiving";
import { MoneyRow } from "./Receipt";
import { gbp, shortDate } from "./format";
import { card, darkCard, eyebrow, screenHelp, screenTitle } from "../wizard/ui";

// Read-only view of a collection the walkthrough can't edit. It renders the
// saved entries as they are, so nothing the draft can't represent is hidden.
export default function SavedCollectionSummary({
  ledger,
  reason,
}: {
  ledger: InPersonGivingLedger;
  reason: string;
}) {
  const total = sumMoney(
    [...ledger.rows.map((row) => row.total), ...ledger.namedDonations.map((donation) => donation.amount)],
    (amount) => amount
  );

  return (
    <div>
      <h2 className={screenTitle}>Saved collection</h2>
      <p className={screenHelp}>This collection is shown for reference and can't be changed here.</p>
      <div className="mb-3.5 rounded-2xl bg-amber-light p-3 text-sm text-amber">{reason}</div>

      <div className={`${darkCard} mb-3.5`}>
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/55">
          Week total · w/e {shortDate(ledger.weekEndingDate)}
        </div>
        <div className="mt-1 font-mono text-[30px] font-bold tracking-tight">{gbp(total)}</div>
        <div className="mt-2.5 border-t border-white/15">
          {ledger.fundTotals.map((fund) => (
            <div
              key={fund.fundId}
              className="flex items-baseline justify-between gap-2.5 border-b border-white/10 py-1.5 text-[13.5px] last:border-b-0"
            >
              <span className="min-w-0 truncate text-white/85">{fund.fundName}</span>
              <b className="whitespace-nowrap font-mono text-sm">{gbp(fund.total)}</b>
            </div>
          ))}
        </div>
      </div>

      {ledger.rows.length > 0 && (
        <div className={`${card} mb-3.5`}>
          <div className={`${eyebrow} mb-1`}>Service giving</div>
          {ledger.rows.map((row) => (
            <div key={row.id} className="border-b border-dashed border-ledger py-1.5 last:border-b-0">
              <div className="text-xs text-grey-mid">
                {row.serviceNote} · {shortDate(row.serviceDate)} · {row.fundName} · {row.category}
              </div>
              {row.cash > 0 && <MoneyRow label="Cash" value={row.cash} sub />}
              {row.cheque > 0 && <MoneyRow label="Cheque" value={row.cheque} sub />}
              {row.pdq > 0 && <MoneyRow label="Card" value={row.pdq} sub />}
              {row.total - row.cash - row.cheque - row.pdq > 0.005 && (
                <MoneyRow label="Other (bank or online)" value={row.total - row.cash - row.cheque - row.pdq} sub />
              )}
            </div>
          ))}
        </div>
      )}

      {ledger.namedDonations.length > 0 && (
        <div className={card}>
          <div className={`${eyebrow} mb-1`}>Named gifts</div>
          {ledger.namedDonations.map((donation) => (
            <MoneyRow
              key={donation.id}
              label={`${donation.donorName} · ${donation.paymentMethod ?? "Unknown method"} · ${shortDate(donation.serviceDate)}`}
              value={donation.amount}
            />
          ))}
        </div>
      )}
    </div>
  );
}
