import { Trash2 } from "lucide-react";
import { can } from "../../lib/permissions";
import { notify } from "../../lib/notifications";
import { sumMoney } from "../../convex/lib/money";
import { FundType, type AppUser, type Fund } from "../../types";
import { gbp } from "../cashEntry/format";
import WizardFrame from "../wizard/WizardFrame";
import StepFooter from "../wizard/StepFooter";
import { btnLg, btnPrimary, card, screenHelp, screenTitle, tagAmber, tagGrey, tagSage } from "../wizard/ui";

const TYPE_TAG: Record<string, string> = {
  [FundType.UNRESTRICTED]: tagGrey,
  [FundType.RESTRICTED]: tagAmber,
  [FundType.DESIGNATED]: tagSage,
};

interface FundsSheetProps {
  currentUser: AppUser;
  funds: Fund[];
  onNewFund: () => void;
  onEditFund: (fund: Fund) => void;
  onRemoveFund: (fundId: string) => void;
  onClose: () => void;
}

const progressPercent = (fund: Fund) =>
  !fund.targetAmount || fund.targetAmount <= 0 ? 0 : Math.min((fund.balance / fund.targetAmount) * 100, 100);

export default function FundsSheet({ currentUser, funds, onNewFund, onEditFund, onRemoveFund, onClose }: FundsSheetProps) {
  const unrestricted = funds.filter((fund) => fund.type === FundType.UNRESTRICTED);
  const restricted = funds.filter((fund) => fund.type !== FundType.UNRESTRICTED);

  const handleDelete = (fund: Fund) => {
    if (fund.balance !== 0) {
      notify("Error", "Cannot delete a fund with a non-zero balance. Please transfer funds out before deleting.");
      return;
    }
    if (window.confirm(`Are you sure you want to delete '${fund.name}'? This action cannot be undone.`)) {
      onRemoveFund(fund._id);
    }
  };

  return (
    <WizardFrame
      ariaLabel="Funds and campaigns"
      title="Funds and campaigns"
      onClose={onClose}
      footer={
        <StepFooter>
          <button type="button" onClick={onNewFund} className={`${btnPrimary} ${btnLg}`}>
            New fund
          </button>
        </StepFooter>
      }
    >
      <h2 className={screenTitle}>Funds and campaigns</h2>
      <p className={screenHelp}>Add, edit or archive the funds your giving and spending go through.</p>

      <div className={`${card} grid grid-cols-3 gap-2 text-center`}>
        <div>
          <p className="text-xs text-grey-mid">Funds</p>
          <p className="mt-1 font-mono text-[15px] font-bold text-ink">{funds.length}</p>
        </div>
        <div>
          <p className="text-xs text-grey-mid">Unrestricted</p>
          <p className="mt-1 font-mono text-[15px] font-bold text-sage">
            {gbp(sumMoney(unrestricted, (fund) => fund.balance))}
          </p>
        </div>
        <div>
          <p className="text-xs text-grey-mid">Restricted</p>
          <p className="mt-1 font-mono text-[15px] font-bold text-amber">
            {gbp(sumMoney(restricted, (fund) => fund.balance))}
          </p>
        </div>
      </div>

      {funds.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-ledger p-6 text-center text-sm text-grey-mid">
          No funds yet. Add your general fund to start.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {funds.map((fund) => {
            const progress = progressPercent(fund);
            return (
              <li key={fund._id} className="flex items-center gap-2 rounded-2xl border border-ledger bg-white pr-2">
                <button
                  type="button"
                  onClick={() => onEditFund(fund)}
                  className="flex min-h-[64px] min-w-0 flex-1 flex-col justify-center gap-1.5 px-3.5 py-3 text-left"
                >
                  <span className="flex items-center gap-2">
                    <b className="min-w-0 truncate text-[14.5px] text-ink">{fund.name}</b>
                    <span className={TYPE_TAG[fund.type] ?? tagGrey}>{fund.type}</span>
                  </span>
                  <span className="flex items-center justify-between gap-3 text-xs text-grey-mid">
                    <span className="font-mono text-sm font-semibold text-ink">{gbp(fund.balance)}</span>
                    {fund.targetAmount ? (
                      <span className="font-mono">
                        {progress.toFixed(0)}% of {gbp(fund.targetAmount)}
                      </span>
                    ) : (
                      <span>No target set</span>
                    )}
                  </span>
                  {fund.targetAmount ? (
                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[#eceae5]" aria-hidden="true">
                      <span
                        className={`block h-full rounded-full ${progress >= 100 ? "bg-sage" : "bg-amber"}`}
                        style={{ width: `${progress}%` }}
                      />
                    </span>
                  ) : null}
                </button>
                {can(currentUser.role, "funds.delete") && (
                  <button
                    type="button"
                    aria-label={`Delete ${fund.name}`}
                    title="Delete"
                    onClick={() => handleDelete(fund)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-grey-mid hover:text-error"
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-xs text-grey-mid">A fund with money in it can't be deleted. Move the money out first.</p>
    </WizardFrame>
  );
}
