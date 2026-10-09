import type { Transaction } from "../../types";
import { eyebrow } from "../wizard/ui";
import TransactionRow, { type TransactionListProps } from "./TransactionRow";

// Desktop-only dense view of the same rows, for scanning many lines at once.
export default function TransactionCompactTable({ rows, list }: { rows: Transaction[]; list: TransactionListProps }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ledger bg-white">
      <table className="w-full text-left">
        <thead className="bg-paper">
          <tr className={eyebrow}>
            <th scope="col" className="w-10 py-2.5 pl-3.5 pr-1">
              <span className="sr-only">Select</span>
            </th>
            <th scope="col" className="px-2.5 py-2.5 font-bold">Date</th>
            <th scope="col" className="px-2.5 py-2.5 font-bold">Description</th>
            <th scope="col" className="px-2.5 py-2.5 font-bold">Category</th>
            <th scope="col" className="px-2.5 py-2.5 font-bold">Fund</th>
            <th scope="col" className="px-2.5 py-2.5 text-right font-bold">Amount</th>
            <th scope="col" className="w-24 py-2.5 pr-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((transaction) => (
            <TransactionRow key={transaction._id} transaction={transaction} list={list} dense />
          ))}
        </tbody>
      </table>
    </div>
  );
}
