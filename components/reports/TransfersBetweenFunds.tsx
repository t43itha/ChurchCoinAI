import React from "react";
import type { TransferSummary } from "../../lib/reportableTransactions";
import { sectionCard, sectionHead, sectionTitle, tableHeadCell } from "./classes";
import { formatCurrency } from "./format";

export interface TransfersBetweenFundsProps {
  transfers: TransferSummary;
  // Table only, for use inside another section.
  embedded?: boolean;
}

// SORP "Transfers between funds" line. Hidden when nothing moved between funds.
export const TransfersBetweenFunds: React.FC<TransfersBetweenFundsProps> = ({ transfers, embedded = false }) => {
  if (transfers.funds.length === 0) return null;
  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#efeee9]">
            <th scope="col" className={`${tableHeadCell} text-left`}>Fund</th>
            <th scope="col" className={`${tableHeadCell} text-right`}>In</th>
            <th scope="col" className={`${tableHeadCell} text-right`}>Out</th>
            <th scope="col" className={`${tableHeadCell} text-right`}>Net</th>
          </tr>
        </thead>
        <tbody>
          {transfers.funds.map((fund) => (
            <tr key={fund.fundId} className="border-b border-[#efeee9]">
              <td className="px-3 py-2.5 font-medium text-ink">{fund.fund}</td>
              <td className="px-3 py-2.5 text-right font-mono text-ink">{formatCurrency(fund.in)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-ink">{formatCurrency(fund.out)}</td>
              <td className="px-3 py-2.5 text-right font-mono font-bold text-ink">{formatCurrency(fund.net)}</td>
            </tr>
          ))}
          {transfers.unmatched !== 0 && (
            <tr className="border-b border-[#efeee9] bg-amber-light">
              <td colSpan={3} className="px-3 py-2.5 font-medium text-amber">
                Unmatched: a transfer with only one side recorded
              </td>
              <td className="px-3 py-2.5 text-right font-mono font-bold text-amber">
                {formatCurrency(transfers.unmatched)}
              </td>
            </tr>
          )}
          <tr className="bg-[#fbfaf8] font-bold">
            <td colSpan={3} className="px-3 py-2.5 text-ink">Total</td>
            <td className="px-3 py-2.5 text-right font-mono text-ink">{formatCurrency(transfers.unmatched)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
  if (embedded) return table;
  return (
    <section className={sectionCard}>
      <div className={sectionHead}>
        <h3 className={sectionTitle}>Transfers between funds</h3>
      </div>
      {table}
    </section>
  );
};
