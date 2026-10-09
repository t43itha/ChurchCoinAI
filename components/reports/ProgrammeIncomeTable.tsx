import React from "react";
import type { ProgrammeIncome } from "../../lib/programmeIncome";
import { formatCurrency } from "./format";

export interface ProgrammeIncomeTableProps {
  rows: ProgrammeIncome[];
}

export const ProgrammeIncomeTable: React.FC<ProgrammeIncomeTableProps> = ({ rows }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[#efeee9] bg-[#fcfbf9] font-mono text-[10.5px] uppercase tracking-[0.07em] text-grey-mid">
          <th scope="col" className="px-3 py-2 text-left font-semibold">Programme</th>
          <th scope="col" className="px-3 py-2 text-right font-semibold">Entries</th>
          <th scope="col" className="px-3 py-2 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.programmeId} className="border-b border-[#efeee9]">
            <td className="px-3 py-2.5 text-ink">{row.name}</td>
            <td className="px-3 py-2.5 text-right font-mono text-grey-dark">{row.count}</td>
            <td className="px-3 py-2.5 text-right font-mono text-ink">{formatCurrency(row.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
