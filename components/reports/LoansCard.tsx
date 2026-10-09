import React from "react";
import type { LoanReportRow } from "../../types";
import { formatCurrency, formatShortDate } from "./format";

export interface LoansCardProps {
  loans: LoanReportRow[];
  title?: string;
}

export const LoansCard: React.FC<LoansCardProps> = ({ loans, title = "Loans at period end" }) => {
  if (loans.length === 0) return null;
  return (
    <section className="swiss-card-static">
      <div className="border-b border-[#efeee9] px-[18px] py-3.5">
        <h3 className="text-[14.5px] font-bold text-ink">{title}</h3>
      </div>
      <ul className="divide-y divide-[#efeee9]">
        {loans.map((loan) => (
          <li key={loan.lender} className="px-[18px] py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-ink">{loan.lender}</span>
              <span className="font-mono text-sm font-bold text-ink">{formatCurrency(loan.outstanding)}</span>
            </div>
            <p className="mt-0.5 text-[12.5px] text-grey-mid">
              Borrowed {formatCurrency(loan.borrowed)} · repaid {formatCurrency(loan.repaid)}
              {loan.dueDate && <> · due {formatShortDate(loan.dueDate)}</>}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
};
