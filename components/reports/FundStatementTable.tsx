import React from "react";
import { roundMoney } from "../../convex/lib/money";
import {
  isUnrestrictedFund,
  type FundStatement,
  type FundStatementRow,
  type FundStatementTotals,
} from "../../lib/reportSummary";
import { formatCurrency } from "./format";

export interface FundStatementTableProps {
  statement: FundStatement;
  openingLabel: string;
  closingLabel: string;
  grouped?: boolean;
  showChange?: boolean;
}

const HEADER_CELL = "px-3 py-2.5 text-right text-xs font-bold text-grey-mid";
const BODY_CELL = "px-3 py-2.5 text-right font-mono text-[13px] text-ink";
const GROUP_CELL = "px-3 py-2 text-xs font-bold text-grey-mid";
const STICKY_FUND_CELL = "sticky left-0 z-[1] px-3 py-2.5 text-left text-[13.5px] md:static";

const TYPE_TAG: Record<string, { label: string; className: string }> = {
  Unrestricted: { label: "Unrestricted", className: "bg-sage-light text-sage" },
  Restricted: { label: "Restricted", className: "bg-amber-light text-amber" },
  Designated: { label: "Designated", className: "bg-[#eef1f8] text-[#3e5a94]" },
};

interface ValueCellsProps {
  totals: FundStatementTotals;
  bold: boolean;
  showOther: boolean;
  showChange: boolean;
}

// The numeric cells shared by fund rows and subtotal rows.
const ValueCells: React.FC<ValueCellsProps> = ({ totals, bold, showOther, showChange }) => {
  const change = roundMoney(totals.closing - totals.opening);
  const weight = bold ? "font-bold" : "";
  return (
    <>
      <td className={BODY_CELL}>{formatCurrency(totals.opening)}</td>
      <td className={BODY_CELL}>{formatCurrency(totals.income)}</td>
      <td className={BODY_CELL}>{formatCurrency(totals.expenditure)}</td>
      <td className={BODY_CELL}>{formatCurrency(totals.transfers)}</td>
      {showOther && <td className={BODY_CELL}>{formatCurrency(totals.other)}</td>}
      <td className={`${BODY_CELL} ${weight} ${totals.closing < 0 ? "text-error" : ""}`}>
        {formatCurrency(totals.closing)}
      </td>
      {showChange && (
        <td className={`${BODY_CELL} ${weight} ${change > 0 ? "text-sage" : "text-grey-mid"}`}>
          {formatCurrency(change)}
        </td>
      )}
    </>
  );
};

interface TypeTagProps {
  type: string;
}

const TypeTag: React.FC<TypeTagProps> = ({ type }) => {
  const tag = TYPE_TAG[type];
  const className = tag?.className ?? "bg-grey-light text-grey-mid";
  return (
    <span className={`ml-1.5 inline-block rounded px-1.5 py-px align-[1px] text-[10.5px] font-semibold ${className}`}>
      {tag?.label ?? type}
    </span>
  );
};

export const FundStatementTable: React.FC<FundStatementTableProps> = ({
  statement,
  openingLabel,
  closingLabel,
  grouped = false,
  showChange = false,
}) => {
  const showOther = statement.rows.some((row) => row.other !== 0);
  // Fund + opening + in + out + transfers + closing, plus the optional columns.
  const columnCount = 6 + (showOther ? 1 : 0) + (showChange ? 1 : 0);

  const renderFundRow = (row: FundStatementRow) => (
    <tr key={row.fundId} className="border-b border-[#efeee9]">
      <td className={`${STICKY_FUND_CELL} bg-white text-ink`}>
        {row.fund}
        <TypeTag type={row.type} />
      </td>
      <ValueCells totals={row} bold={false} showOther={showOther} showChange={showChange} />
    </tr>
  );

  const renderSubtotal = (label: string, totals: FundStatementTotals, tint: string) => (
    <tr className={`border-b border-[#efeee9] border-t border-t-[#e7e5e1] font-bold ${tint}`}>
      <td className={`${STICKY_FUND_CELL} ${tint} text-ink`}>{label}</td>
      <ValueCells totals={totals} bold showOther={showOther} showChange={showChange} />
    </tr>
  );

  const renderGroupHeader = (label: string) => (
    <tr className="bg-[#fcfbf9]">
      <td colSpan={columnCount} className={GROUP_CELL}>
        {label}
      </td>
    </tr>
  );

  const unrestrictedRows = statement.rows.filter(isUnrestrictedFund);
  const restrictedRows = statement.rows.filter((row) => !isUnrestrictedFund(row));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#efeee9] bg-[#fcfbf9]">
            <th
              scope="col"
              className="sticky left-0 z-[1] bg-[#fcfbf9] px-3 py-2.5 text-left text-xs font-bold text-grey-mid md:static"
            >
              Fund
            </th>
            <th scope="col" className={HEADER_CELL}>{openingLabel}</th>
            <th scope="col" className={HEADER_CELL}>In</th>
            <th scope="col" className={HEADER_CELL}>Out</th>
            <th scope="col" className={HEADER_CELL}>Transfers</th>
            {showOther && <th scope="col" className={HEADER_CELL}>Other</th>}
            <th scope="col" className={HEADER_CELL}>{closingLabel}</th>
            {showChange && <th scope="col" className={HEADER_CELL}>Change</th>}
          </tr>
        </thead>
        <tbody>
          {grouped ? (
            <>
              {renderGroupHeader("Unrestricted")}
              {unrestrictedRows.map(renderFundRow)}
              {renderSubtotal("Unrestricted total", statement.unrestricted, "bg-[#fbfaf8]")}
              {renderGroupHeader("Restricted")}
              {restrictedRows.map(renderFundRow)}
              {renderSubtotal("Restricted total", statement.restricted, "bg-[#fbfaf8]")}
              {renderSubtotal("All funds", statement.total, "bg-[#f7f6f4]")}
            </>
          ) : (
            <>
              {statement.rows.map(renderFundRow)}
              {renderSubtotal("All funds", statement.total, "bg-[#f7f6f4]")}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};
