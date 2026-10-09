import React, { type ReactNode } from "react";
import { sumMoney } from "../../convex/lib/money";
import type { DataReadiness, FundStatement } from "../../lib/reportSummary";
import { ReceiptCard, ReceiptRow } from "../wizard/Receipt";
import { eyebrow } from "../wizard/ui";
import { READY_THRESHOLD, formatCurrencyWhole } from "./format";

export interface ReportReceiptColumnProps {
  fundStatement: FundStatement;
  // Short date the balances are held at, e.g. "30 Sep".
  asAt: string;
  readiness: DataReadiness;
  // Optional third card (Gift Aid, reserves) under the trust signal.
  extraTitle?: string;
  extra?: ReactNode;
}

const percentValue = (percent: number | null) => {
  if (percent === null) return <span className="text-grey-mid">—</span>;
  const weak = percent < READY_THRESHOLD;
  return <span className={weak ? "text-amber" : undefined}>{percent}%</span>;
};

// Where the money sits and how far the figures can be trusted, beside the verdict.
export const ReportReceiptColumn: React.FC<ReportReceiptColumnProps> = ({
  fundStatement,
  asAt,
  readiness,
  extraTitle,
  extra,
}) => {
  const freeToSpend = sumMoney(
    fundStatement.rows.filter((row) => row.type === "Unrestricted"),
    (row) => row.closing
  );
  const committed = sumMoney(
    fundStatement.rows.filter((row) => row.type !== "Unrestricted"),
    (row) => row.closing
  );

  return (
    <div className="space-y-3">
      <ReceiptCard>
        <p className={eyebrow}>Held across funds</p>
        <p className="text-xs text-grey-mid">at {asAt}</p>
        <div className="mt-2">
          <ReceiptRow label="Free to spend" value={formatCurrencyWhole(freeToSpend)} />
          <ReceiptRow label="Restricted & designated" value={formatCurrencyWhole(committed)} />
          <ReceiptRow label="Total" value={formatCurrencyWhole(fundStatement.total.closing)} />
        </div>
      </ReceiptCard>

      <ReceiptCard>
        <p className={eyebrow}>Can I trust these?</p>
        <div className="mt-2">
          <ReceiptRow label="Categorised" value={percentValue(readiness.categorisedPercent)} />
          <ReceiptRow label="Reconciled" value={percentValue(readiness.reconciledPercent)} />
        </div>
      </ReceiptCard>

      {extra && (
        <ReceiptCard>
          {extraTitle && <p className={eyebrow}>{extraTitle}</p>}
          <div className="mt-2">{extra}</div>
        </ReceiptCard>
      )}
    </div>
  );
};
