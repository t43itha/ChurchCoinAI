import React, { useMemo, useState } from 'react';
import { formatLocalDateInputValue } from '../lib/dateUtils';
import { notify } from '../lib/notifications';
import { can } from '../lib/permissions';
import { filterFundBalanceRows, filterIncomeAndExpenditure } from '../lib/reportableTransactions';
import { sumMoney } from '../convex/lib/money';
import {
  AppUser,
  Category,
  Fund,
  FundCreateInput,
  FundType,
  Transaction,
  TransactionType,
} from '../types';
import { formatCurrency } from './dashboard/formatters';
import FundCard from './funds/FundCard';
import FundFormSheet from './funds/FundFormSheet';
import FundSheet, { type SpendBreakdown } from './funds/FundSheet';
import {
  PLAIN_TYPE_NAME,
  TYPE_COLOUR,
  averageMonthlySpend,
  balanceSplit,
  monthMovementByFund,
  monthSpendByFund,
  monthsCovered,
} from './funds/fundFacts';
import HeroCard from './hub/HeroCard';
import HubHeader from './hub/HubHeader';
import HubLayout from './hub/HubLayout';
import JournalTransferModal from './transactions/JournalTransferModal';
import { btnMd, btnOutline, btnPrimary } from './wizard/ui';

interface FundManagerProps {
  funds: Fund[];
  transactions: Transaction[];
  categories: Category[];
  currentUser: AppUser;
  onViewLedger: (fundId: string) => void;
  onAddFund: (fund: FundCreateInput) => void;
  onUpdateFund: (fund: Fund) => void;
  onRemoveFund: (fundId: string) => void;
}

const TOP_CATEGORY_LIMIT = 5;

const topCategories = (rows: Transaction[]) =>
  [...new Set(rows.map((row) => row.category))]
    .map((name) => ({ name, value: sumMoney(rows.filter((row) => row.category === name), (row) => row.amount) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_CATEGORY_LIMIT);

const FundManager: React.FC<FundManagerProps> = ({
  funds,
  transactions,
  categories,
  currentUser,
  onViewLedger,
  onAddFund,
  onUpdateFund,
  onRemoveFund,
}) => {
  // Fund ids, not objects, so the open sheets always show the latest balances.
  const [openFundId, setOpenFundId] = useState<string | null>(null);
  // null: closed. An empty object creates a fund; a fundId edits one.
  const [formFund, setFormFund] = useState<{ fundId?: string } | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);

  const canMoveMoney = can(currentUser.role, 'ledger.write');
  const canWriteFunds = can(currentUser.role, 'funds.write');
  const canDeleteFunds = can(currentUser.role, 'funds.delete');

  const today = formatLocalDateInputValue(new Date());
  const month = today.slice(0, 7);
  const dateLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(new Date());

  const fundRows = useMemo(() => filterFundBalanceRows(transactions), [transactions]);
  const expenditureRows = useMemo(
    () => filterIncomeAndExpenditure(transactions).filter((row) => row.type === TransactionType.EXPENDITURE),
    [transactions]
  );
  const movementByFund = useMemo(() => monthMovementByFund(fundRows, month), [fundRows, month]);
  const spendByFund = useMemo(() => monthSpendByFund(expenditureRows, month), [expenditureRows, month]);

  // General Fund spending: top categories this month, falling back to all-time when the month has none yet.
  const spend: SpendBreakdown = useMemo(() => {
    const generalFundIds = new Set(funds.filter((fund) => fund.type === FundType.UNRESTRICTED).map((fund) => fund._id));
    const generalExpenditure = expenditureRows.filter((row) => generalFundIds.has(row.fundId));
    const monthExpenditure = generalExpenditure.filter((row) => row.date.slice(0, 7) === month);
    const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return monthExpenditure.length > 0
      ? { label: `Top categories · ${monthLabel}`, rows: topCategories(monthExpenditure) }
      : { label: 'Top categories · All time', rows: topCategories(generalExpenditure) };
  }, [funds, expenditureRows, month]);

  const total = sumMoney(funds, (fund) => fund.balance);
  const split = balanceSplit(funds).map((segment) => ({
    label: PLAIN_TYPE_NAME[segment.type],
    value: formatCurrency(segment.amount),
    amount: segment.amount,
    colour: TYPE_COLOUR[segment.type],
  }));

  const openFund = funds.find((fund) => fund._id === openFundId);
  const editingFund = formFund?.fundId ? funds.find((fund) => fund._id === formFund.fundId) : undefined;

  const handleDelete = (fund: Fund) => {
    if (fund.balance !== 0) {
      notify('Error', 'Cannot delete a fund with a non-zero balance. Please transfer funds out before deleting.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete '${fund.name}'? This action cannot be undone.`)) return;
    onRemoveFund(fund._id);
    setOpenFundId(null);
  };

  return (
    <div className="animate-enter pb-12">
      <HubLayout>
        <HubHeader
          title="Funds"
          status={`${funds.length} ${funds.length === 1 ? 'fund' : 'funds'} · balances at ${dateLabel}`}
          actions={
            <>
              {canMoveMoney && (
                <button type="button" onClick={() => setShowTransfer(true)} className={`${btnOutline} ${btnMd} !w-auto px-5`}>
                  Move money
                </button>
              )}
              {canWriteFunds && (
                <button type="button" onClick={() => setFormFund({})} className={`${btnPrimary} ${btnMd} !w-auto px-5`}>
                  + New fund
                </button>
              )}
            </>
          }
        />

        <HeroCard
          label={`Held across ${funds.length} ${funds.length === 1 ? 'fund' : 'funds'}`}
          value={formatCurrency(total)}
          segments={split}
        />

        {funds.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ledger p-10 text-center text-sm text-grey-mid">
            No funds yet.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {funds.map((fund) => {
              const averageSpend =
                fund.type === FundType.UNRESTRICTED
                  ? averageMonthlySpend(expenditureRows.filter((row) => row.fundId === fund._id), today)
                  : null;
              const monthSpend = spendByFund[fund._id] ?? 0;
              return (
                <FundCard
                  key={fund._id}
                  fund={fund}
                  movement={movementByFund[fund._id] ?? 0}
                  monthsCovered={monthsCovered(fund.balance, averageSpend)}
                  belowMonthlySpend={monthSpend > 0 && fund.balance < monthSpend}
                  canMoveMoney={canMoveMoney}
                  onOpen={() => setOpenFundId(fund._id)}
                  onMoveMoney={() => setShowTransfer(true)}
                />
              );
            })}
          </div>
        )}
      </HubLayout>

      {openFund && (
        <FundSheet
          fund={openFund}
          funds={funds}
          transactions={transactions}
          spend={spend}
          canEdit={canWriteFunds}
          canDelete={canDeleteFunds}
          onEdit={() => {
            setOpenFundId(null);
            setFormFund({ fundId: openFund._id });
          }}
          onDelete={() => handleDelete(openFund)}
          onViewLedger={() => onViewLedger(openFund._id)}
          onClose={() => setOpenFundId(null)}
        />
      )}

      {formFund && (!formFund.fundId || editingFund) && (
        <FundFormSheet
          fund={editingFund}
          categories={categories}
          onCreate={onAddFund}
          onUpdate={onUpdateFund}
          onClose={() => setFormFund(null)}
        />
      )}

      {showTransfer && <JournalTransferModal funds={funds} onClose={() => setShowTransfer(false)} />}
    </div>
  );
};

export default FundManager;
