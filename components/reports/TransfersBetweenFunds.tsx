import React from "react";
import { ArrowLeftRight } from "lucide-react";
import type { TransferSummary } from "../../lib/reportableTransactions";
import { formatCurrency } from "./format";

export interface TransfersBetweenFundsProps {
  transfers: TransferSummary;
}

// SORP "Transfers between funds" line. Hidden when nothing moved between funds.
export const TransfersBetweenFunds: React.FC<TransfersBetweenFundsProps> = ({ transfers }) => {
  if (transfers.funds.length === 0) return null;
  const headerCell = 'px-5 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-grey-mid';
  return (
    <div className="swiss-card">
      <div className="px-5 py-4 flex items-center gap-2">
        <ArrowLeftRight size={18} className="text-grey-mid" />
        <h3 className="text-[14.5px] font-bold text-ink">Transfers between funds</h3>
      </div>
      <div className="border-t border-[#efeee9] overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#fcfbf9] border-b border-[#efeee9]">
              <th className={`${headerCell} text-left`}>Fund</th>
              <th className={`${headerCell} text-right`}>In</th>
              <th className={`${headerCell} text-right`}>Out</th>
              <th className={`${headerCell} text-right`}>Net</th>
            </tr>
          </thead>
          <tbody>
            {transfers.funds.map((fund, idx) => (
              <tr key={fund.fundId} className={`border-b border-[#efeee9] ${idx % 2 === 0 ? '' : 'bg-[#fcfbf9]'}`}>
                <td className="px-5 py-3 text-sm font-medium text-ink">{fund.fund}</td>
                <td className="px-5 py-3 text-right font-mono text-sm text-ink">{formatCurrency(fund.in)}</td>
                <td className="px-5 py-3 text-right font-mono text-sm text-ink">{formatCurrency(fund.out)}</td>
                <td className="px-5 py-3 text-right font-mono text-sm font-bold text-ink">{formatCurrency(fund.net)}</td>
              </tr>
            ))}
            {transfers.unmatched !== 0 && (
              <tr className="border-b border-[#efeee9] bg-amber-light">
                <td colSpan={3} className="px-5 py-3 text-sm font-medium text-amber">
                  Unmatched: a transfer with only one side recorded
                </td>
                <td className="px-5 py-3 text-right font-mono text-sm font-bold text-amber">
                  {formatCurrency(transfers.unmatched)}
                </td>
              </tr>
            )}
            <tr className="bg-[#fbfaf8] font-bold border-t border-[#efeee9]">
              <td colSpan={3} className="px-5 py-3 text-sm text-ink">Total</td>
              <td className="px-5 py-3 text-right font-mono text-sm text-ink">{formatCurrency(transfers.unmatched)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
