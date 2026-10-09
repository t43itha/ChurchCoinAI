import { longDate } from "../cashEntry/format";
import { formatSignedNet, type DayGroup } from "./transactionView";
import TransactionRow, { type TransactionListProps } from "./TransactionRow";

// The default list: one card per day, with the day's net on its header.
export default function TransactionDayList({ groups, list }: { groups: DayGroup[]; list: TransactionListProps }) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.date} aria-label={longDate(group.date)}>
          <header className="flex items-baseline justify-between gap-3 px-1 pb-2">
            <h3 className="text-sm font-bold text-ink">{longDate(group.date)}</h3>
            <p className="text-xs text-grey-mid">
              Net <b className="font-mono text-[13px] font-semibold text-grey-dark">{formatSignedNet(group.net)}</b>
            </p>
          </header>
          <div className="divide-y divide-ledger overflow-hidden rounded-2xl border border-ledger bg-white">
            {group.rows.map((transaction) => (
              <TransactionRow key={transaction._id} transaction={transaction} list={list} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
