import React from "react";
import { sumMoney } from "../../convex/lib/money";
import type { GivingByDonor } from "../../lib/reportSummary";
import { formatCurrency } from "./format";

export interface GiversTableProps {
  giving: GivingByDonor;
  giftAidEnabled?: boolean;
}

export const GiversTable: React.FC<GiversTableProps> = ({ giving, giftAidEnabled }) => {
  const showGiftAid = giftAidEnabled !== false;
  const total = sumMoney(giving.givers, (giver) => giver.total);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#efeee9] bg-[#fcfbf9] font-mono text-[10.5px] uppercase tracking-[0.07em] text-grey-mid">
            <th scope="col" className="px-3 py-2 text-left font-semibold">Giver</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Gifts</th>
            {showGiftAid && <th scope="col" className="px-3 py-2 text-left font-semibold">Gift Aid</th>}
            <th scope="col" className="px-3 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {giving.givers.map((giver) => (
            <tr key={giver.donorId ?? giver.donor} className="border-b border-[#efeee9]">
              <td className="px-3 py-2.5 text-ink">{giver.donor}</td>
              <td className="px-3 py-2.5 text-right font-mono text-grey-dark">{giver.gifts}</td>
              {showGiftAid && (
                <td className="px-3 py-2.5">
                  {giver.giftAidEligible ? (
                    <span className="rounded bg-sage-light px-1.5 py-px text-[10.5px] font-semibold text-sage">Yes</span>
                  ) : (
                    <span className="text-grey-mid">–</span>
                  )}
                </td>
              )}
              <td className="px-3 py-2.5 text-right font-mono text-ink">{formatCurrency(giver.total)}</td>
            </tr>
          ))}
          <tr className="border-t border-[#e7e5e1] bg-[#fbfaf8] font-bold">
            <td className="px-3 py-2.5 text-ink">Total</td>
            <td className="px-3 py-2.5 text-right font-mono text-ink">{giving.giftCount}</td>
            {showGiftAid && <td className="px-3 py-2.5" />}
            <td className="px-3 py-2.5 text-right font-mono text-ink">{formatCurrency(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
