import { formatUkDate } from "../../lib/dateUtils";
import { isVoidedTransaction } from "../../lib/reportableTransactions";
import { FundType, TransactionType, type Fund, type Transaction } from "../../types";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnGhost, btnLg, btnMd, btnOutline, btnPrimary, fieldLabel } from "../wizard/ui";
import CapitalAllocation from "./CapitalAllocation";
import { FundTypeTag } from "./FundCard";
import { PLAIN_TYPE_NAME, formatPounds } from "./fundFacts";

export interface SpendBreakdown {
  label: string;
  rows: { name: string; value: number }[];
}

const RECENT_LIMIT = 8;

interface FundSheetProps {
  fund: Fund;
  funds: Fund[];
  transactions: Transaction[];
  // Shown on unrestricted funds, where the General Fund spending lives.
  spend: SpendBreakdown;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onViewLedger: () => void;
  onClose: () => void;
}

// A fund's own detail: recent transactions, spending for unrestricted funds, and the actions it allows.
export default function FundSheet({
  fund,
  funds,
  transactions,
  spend,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onViewLedger,
  onClose,
}: FundSheetProps) {
  const recent = transactions
    .filter((transaction) => transaction.fundId === fund._id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_LIMIT);
  const maxSpend = Math.max(...spend.rows.map((row) => row.value), 1);
  const isUnrestricted = fund.type === FundType.UNRESTRICTED;

  return (
    <WizardFrame
      ariaLabel={fund.name}
      title={fund.name}
      onClose={onClose}
      footer={
        canEdit || canDelete ? (
          <StepFooter>
            <div className="space-y-1.5">
              {canEdit && (
                <button type="button" onClick={onEdit} className={`${btnPrimary} ${btnLg}`}>
                  Edit fund
                </button>
              )}
              {canDelete && (
                <button type="button" onClick={onDelete} className={btnGhost}>
                  Delete fund
                </button>
              )}
            </div>
          </StepFooter>
        ) : undefined
      }
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <FundTypeTag type={fund.type} />
          <span className="text-xs text-grey-mid">{PLAIN_TYPE_NAME[fund.type]}</span>
        </div>
        <p className="mt-3 font-mono text-[26px] font-bold tracking-tight text-ink">{formatPounds(fund.balance)}</p>
        {fund.description && <p className="mt-2 text-sm leading-relaxed text-grey-dark">{fund.description}</p>}
        <button type="button" onClick={onViewLedger} className={`${btnOutline} ${btnMd} mt-4`}>
          View ledger history
        </button>
      </div>

      <span className={fieldLabel}>Recent transactions</span>
      {recent.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ledger p-4 text-center text-sm text-grey-mid">
          No transactions on this fund yet.
        </p>
      ) : (
        <ul className="divide-y divide-ledger overflow-hidden rounded-2xl border border-ledger bg-white">
          {recent.map((transaction) => {
            const voided = isVoidedTransaction(transaction);
            const signed = transaction.type === TransactionType.INCOME ? transaction.amount : -transaction.amount;
            return (
              <li key={transaction._id} className={`flex items-center gap-3 px-3.5 py-3 text-sm ${voided ? "text-grey-mid line-through" : "text-ink"}`}>
                <span className="w-[68px] shrink-0 font-mono text-xs text-grey-mid">{formatUkDate(transaction.date)}</span>
                <span className="min-w-0 flex-1 truncate">{transaction.description}</span>
                <span className="shrink-0 whitespace-nowrap font-mono font-semibold">{formatPounds(signed)}</span>
              </li>
            );
          })}
        </ul>
      )}

      {isUnrestricted && (
        <>
          <span className={fieldLabel}>General Fund expenditure</span>
          <p className="-mt-1 mb-3 text-xs text-grey-mid">{spend.label}</p>
          {spend.rows.length > 0 ? (
            <div className="flex flex-col gap-3">
              {spend.rows.map((row) => (
                <div key={row.name} className="grid grid-cols-[88px_1fr_64px] items-center gap-3">
                  <span className="truncate text-[12.5px] font-medium text-grey-dark">{row.name}</span>
                  <div className="h-[9px] overflow-hidden rounded-[5px] bg-[#f1efeb]">
                    <div className="h-full rounded-[5px] bg-ink" style={{ width: `${(row.value / maxSpend) * 100}%` }} />
                  </div>
                  <span className="text-right font-mono text-[12.5px] font-bold text-ink">
                    £{Math.round(row.value).toLocaleString("en-GB")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-ledger p-4 text-center text-sm text-grey-mid">
              No expenditure data available.
            </p>
          )}

          <CapitalAllocation funds={funds} />
        </>
      )}
    </WizardFrame>
  );
}
