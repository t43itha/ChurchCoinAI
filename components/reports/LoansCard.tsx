import React from "react";
import type { LoanReportRow } from "../../types";
import { sectionCard, sectionHead, sectionTitle } from "./classes";
import { formatCurrency, formatShortDate } from "./format";

export interface LoansCardProps {
  loans: LoanReportRow[];
  // Heading shown above the list. Omit for a card with no heading.
  title?: string;
  // Drops the card frame when the list sits inside another section.
  embedded?: boolean;
}

export const LoansCard: React.FC<LoansCardProps> = ({ loans, title = "Loans at period end", embedded = false }) => {
  if (loans.length === 0) return null;
  const list = (
    <ul className="divide-y divide-[#efeee9]">
      {loans.map(({ movementId, ...loan }) => (
        <li key={movementId} className="px-[18px] py-3">
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
  );
  if (embedded) return list;
  return (
    <section className={sectionCard}>
      {title && (
        <div className={sectionHead}>
          <h3 className={sectionTitle}>{title}</h3>
        </div>
      )}
      {list}
    </section>
  );
};
