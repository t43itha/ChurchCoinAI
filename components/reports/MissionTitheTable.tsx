import React from "react";
import type { MissionTitheItem } from "../../types";
import { tableHeadCell } from "./classes";
import { formatCurrency, formatShortDate } from "./format";

export interface MissionTitheTableProps {
  weeks: MissionTitheItem[];
  total: number;
  titheToPay: number;
}

// The workings behind the mission tithe: each Sunday's giving, then the 10% due.
export const MissionTitheTable: React.FC<MissionTitheTableProps> = ({ weeks, total, titheToPay }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[#efeee9]">
          <th scope="col" className={`${tableHeadCell} text-left`}>Week ending</th>
          <th scope="col" className={`${tableHeadCell} text-right`}>Giving</th>
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week.weekEnding} className="border-b border-[#efeee9]">
            <td className="px-3 py-2.5 text-ink">{formatShortDate(week.weekEnding)}</td>
            <td className="px-3 py-2.5 text-right font-mono text-ink">{formatCurrency(week.total)}</td>
          </tr>
        ))}
        <tr className="border-b border-[#efeee9] bg-[#fbfaf8] font-bold">
          <td className="px-3 py-2.5 text-ink">Total</td>
          <td className="px-3 py-2.5 text-right font-mono text-ink">{formatCurrency(total)}</td>
        </tr>
        <tr className="bg-[#fbfaf8] font-bold">
          <td className="px-3 py-2.5 text-amber">Mission tithe to pay</td>
          <td className="px-3 py-2.5 text-right font-mono text-amber">{formatCurrency(titheToPay)}</td>
        </tr>
      </tbody>
    </table>
  </div>
);
