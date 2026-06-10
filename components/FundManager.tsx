import React, { useMemo } from 'react';
import { Fund, Transaction, FundType, TransactionType } from '../types';
import { ArrowRight, Wallet, TrendingUp, Activity } from 'lucide-react';
import { filterActiveTransactions } from '../lib/voidedTransactions';

interface FundManagerProps {
  funds: Fund[];
  transactions: Transaction[];
  onViewLedger: (fundId: string) => void;
}

// Refined Ledger tone palette (mid shades used for bars/dots)
const TONE = {
  sage: { fg: '#557555', mid: '#6b8e6b' },
  amber: { fg: '#a9743f', mid: '#c79a5f' },
  error: { fg: '#b53d3d', mid: '#c64545' },
} as const;
type Tone = keyof typeof TONE;

const ALLOCATION_COLORS: Record<string, string> = {
  [FundType.UNRESTRICTED]: '#9bb39b',
  [FundType.RESTRICTED]: '#c79a5f',
  [FundType.DESIGNATED]: '#7d8a99',
  [FundType.ENDOWMENT]: '#a08e7d',
};

const TYPE_TONE: Record<string, Tone> = {
  [FundType.RESTRICTED]: 'amber',
};

const plainMoney = (n: number) =>
  '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const k = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');

const TypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const tone = TONE[TYPE_TONE[type] ?? 'sage'];
  return (
    <span
      className="inline-flex items-center gap-[7px] text-xs font-bold uppercase tracking-[0.04em] whitespace-nowrap"
      style={{ color: tone.fg }}
    >
      <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: tone.mid }} />
      {type}
    </span>
  );
};

const FundManager: React.FC<FundManagerProps> = ({ funds, transactions, onViewLedger }) => {
  const activeTransactions = useMemo(() => filterActiveTransactions(transactions), [transactions]);
  const now = new Date();

  const inCurrentMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };

  // Per-fund net movement and expenditure for the current month
  const { moveByFund, monthExpByFund } = useMemo(() => {
    const move: Record<string, number> = {};
    const exp: Record<string, number> = {};
    activeTransactions.forEach((t) => {
      if (!inCurrentMonth(t.date)) return;
      const signed = t.type === TransactionType.INCOME ? t.amount : -t.amount;
      move[t.fundId] = (move[t.fundId] || 0) + signed;
      if (t.type === TransactionType.EXPENDITURE) exp[t.fundId] = (exp[t.fundId] || 0) + t.amount;
    });
    return { moveByFund: move, monthExpByFund: exp };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTransactions]);

  const sumBy = (type?: string) =>
    funds.filter((f) => !type || f.type === type).reduce((acc, f) => acc + f.balance, 0);
  const total = sumBy();
  const unrestricted = sumBy(FundType.UNRESTRICTED);

  // A fund is "at risk" when its balance no longer covers a month of its own spending
  const atRisk = (f: Fund) => {
    const exp = monthExpByFund[f._id] || 0;
    return exp > 0 && f.balance < exp;
  };
  const unrestrictedLow = funds.filter((f) => f.type === FundType.UNRESTRICTED).some(atRisk);

  // General (unrestricted) fund expenditure breakdown — top categories this month,
  // falling back to all-time when the month has no spending yet
  const generalFundIds = useMemo(
    () => new Set(funds.filter((f) => f.type === FundType.UNRESTRICTED).map((f) => f._id)),
    [funds]
  );
  const { expenditureData, expenditureLabel } = useMemo(() => {
    const topCategories = (txs: Transaction[]) => {
      const totals: Record<string, number> = {};
      txs.forEach((t) => {
        totals[t.category] = (totals[t.category] || 0) + t.amount;
      });
      return Object.entries(totals)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
    };
    const generalExp = activeTransactions.filter(
      (t) => generalFundIds.has(t.fundId) && t.type === TransactionType.EXPENDITURE
    );
    const monthExp = generalExp.filter((t) => inCurrentMonth(t.date));
    const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return monthExp.length > 0
      ? { expenditureData: topCategories(monthExp), expenditureLabel: `Top categories · ${monthLabel}` }
      : { expenditureData: topCategories(generalExp), expenditureLabel: 'Top categories · All time' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTransactions, generalFundIds]);
  const maxExpenditure = Math.max(...expenditureData.map((e) => e.value), 1);

  const allocation = Object.keys(ALLOCATION_COLORS)
    .map((type) => ({ type, value: sumBy(type), color: ALLOCATION_COLORS[type] }))
    .filter((s) => s.value > 0);

  const stats = [
    { label: 'Total funds', value: k(total), sub: `Across ${funds.length} funds`, tone: undefined as Tone | undefined },
    {
      label: 'Unrestricted',
      value: k(unrestricted),
      sub: unrestrictedLow ? 'General use — running low' : 'General use',
      tone: unrestrictedLow ? ('error' as Tone) : undefined,
    },
    { label: 'Restricted', value: k(sumBy(FundType.RESTRICTED)), sub: 'Purpose-bound giving', tone: undefined },
    { label: 'Designated', value: k(sumBy(FundType.DESIGNATED)), sub: 'Board-allocated', tone: undefined },
  ];

  return (
    <div className="space-y-[22px] animate-enter max-w-7xl mx-auto pb-12">
      <header className="swiss-card-static p-6 md:p-[26px] flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-[32px] leading-tight font-bold text-ink tracking-tight">Funds & Balances</h2>
          <p className="text-grey-mid mt-2 text-[15px] font-medium">
            Restricted, designated, and unrestricted balances with month movement
          </p>
        </div>
        <span className="font-mono text-[10.5px] uppercase bg-amber-light text-amber px-3 py-1.5 rounded-full font-semibold tracking-[0.12em] self-start">
          {funds.length} funds
        </span>
      </header>

      {/* Summary strip — one panel with internal dividers */}
      <div className="swiss-card-static grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`relative px-6 py-5 ${i < stats.length - 1 ? 'lg:border-r border-[#efeee9]' : ''}`}
          >
            {s.tone && (
              <span
                className="absolute left-0 top-[18px] bottom-[18px] w-[3px] rounded-r"
                style={{ background: TONE[s.tone].mid }}
              />
            )}
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-grey-mid whitespace-nowrap">
              {s.label}
            </div>
            <div
              className="font-mono text-[26px] font-bold tracking-tight mt-2 mb-1 whitespace-nowrap"
              style={{ color: s.tone ? TONE[s.tone].fg : '#1c1917' }}
            >
              {s.value}
            </div>
            <div className="text-[12.5px] text-grey-mid whitespace-nowrap">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-[22px] items-start">
        {/* Fund cards */}
        <div className="flex flex-col gap-4">
          {funds.map((fund) => {
            const move = moveByFund[fund._id] || 0;
            const barTone: Tone = atRisk(fund) ? 'error' : 'sage';
            const pct = fund.targetAmount ? Math.min((fund.balance / fund.targetAmount) * 100, 100) : null;
            return (
              <div key={fund._id} className="swiss-card relative px-6 pt-[22px] pb-5 group">
                <span
                  className="absolute left-0 top-[22px] bottom-[22px] w-[3px] rounded-r"
                  style={{ background: TONE[barTone].mid }}
                />
                <div className="flex items-start justify-between gap-4 pl-2">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center w-10 h-10 rounded-[10px] shrink-0 ${
                        fund.type === FundType.RESTRICTED
                          ? 'bg-amber-light text-[#c79a5f]'
                          : 'bg-[#f3f1ed] text-grey-mid'
                      }`}
                    >
                      <Wallet size={19} strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[17px] font-bold text-ink tracking-tight whitespace-nowrap">{fund.name}</h3>
                      <div className="mt-0.5">
                        <TypeBadge type={fund.type} />
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[22px] font-bold text-ink tracking-tighter">
                      {plainMoney(fund.balance)}
                    </div>
                    <div
                      className="font-mono text-[12.5px] font-bold mt-[3px]"
                      style={{ color: move < 0 ? TONE.error.fg : move > 0 ? TONE.sage.fg : '#78716c' }}
                    >
                      {move === 0
                        ? 'No change'
                        : `${move > 0 ? '+' : '−'}£${Math.abs(Math.round(move)).toLocaleString('en-GB')} this mo.`}
                    </div>
                  </div>
                </div>

                {fund.description && (
                  <p className="text-[13.5px] text-grey-dark leading-relaxed mt-4 pl-2 max-w-[460px]">
                    {fund.description}
                  </p>
                )}

                {pct !== null && fund.targetAmount && (
                  <div className="ml-2 mt-4 bg-[#fbfaf8] border border-[#efeee9] rounded-[10px] px-3.5 py-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-grey-mid whitespace-nowrap">
                        <TrendingUp size={13} strokeWidth={2} /> Target progress
                      </span>
                      <span className="font-mono text-[12.5px] font-bold text-grey-mid">
                        {k(fund.balance)} / {k(fund.targetAmount)}
                      </span>
                    </div>
                    <div className="h-[7px] rounded-full bg-[#eceae5] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#c79a5f]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => onViewLedger(fund._id)}
                    className="inline-flex items-center gap-[7px] text-xs font-bold uppercase tracking-[0.05em] text-grey-mid group-hover:text-amber whitespace-nowrap transition-colors"
                  >
                    Ledger history <ArrowRight size={13} strokeWidth={2} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Charts column */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-[30px]">
          {/* Expenditure breakdown */}
          <div className="swiss-card-static px-6 py-[22px]">
            <div className="flex items-center gap-[11px] mb-5">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-sage-light text-[#6b8e6b]">
                <Activity size={16} strokeWidth={1.9} />
              </span>
              <div>
                <h3 className="text-[13.5px] font-bold text-ink">General Fund expenditure</h3>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-grey-mid mt-0.5">
                  {expenditureLabel}
                </p>
              </div>
            </div>
            {expenditureData.length > 0 ? (
              <div className="flex flex-col gap-[13px]">
                {expenditureData.map((e) => (
                  <div key={e.name} className="grid grid-cols-[88px_1fr_64px] items-center gap-3">
                    <span className="text-[12.5px] text-grey-dark font-medium truncate">{e.name}</span>
                    <div className="h-[9px] rounded-[5px] bg-[#f1efeb] overflow-hidden">
                      <div
                        className="h-full rounded-[5px] bg-ink"
                        style={{ width: `${(e.value / maxExpenditure) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-[12.5px] font-bold text-ink text-right">
                      £{Math.round(e.value).toLocaleString('en-GB')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-grey-mid text-xs">No expenditure data available.</div>
            )}
          </div>

          {/* Capital allocation donut */}
          <div className="swiss-card-static px-6 py-[22px]">
            <h3 className="text-[13.5px] font-bold text-ink mb-1">Capital allocation</h3>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-grey-mid mb-[18px]">
              By restriction type
            </p>
            <div className="flex items-center gap-6">
              <Donut segments={allocation} total={total} />
              <div className="flex flex-col gap-3 flex-1">
                {allocation.map((s) => (
                  <div key={s.type} className="flex items-center gap-2.5">
                    <span className="w-[11px] h-[11px] rounded-[3px] shrink-0" style={{ background: s.color }} />
                    <span className="text-[12.5px] text-grey-dark flex-1">{s.type}</span>
                    <span className="font-mono text-[12.5px] font-bold text-ink">
                      {total > 0 ? Math.round((s.value / total) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-[18px] bg-[#fcf7f0] border border-[#ecd8bd] rounded-[10px] px-3.5 py-[11px] text-xs text-[#7a5a30] leading-relaxed">
              <strong className="font-bold">Note:</strong> Restricted funds must be reported separately in year-end
              accounts.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// SVG donut chart with mono total in the centre
const Donut: React.FC<{ segments: { type: string; value: number; color: string }[]; total: number }> = ({
  segments,
  total,
}) => {
  const size = 132;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {segments.map((s) => {
          const dash = total > 0 ? (s.value / total) * circ : 0;
          const el = (
            <circle
              key={s.type}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return el;
        })}
      </g>
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 700, fill: '#1c1917' }}
      >
        £{Math.round(total / 1000)}k
      </text>
      <text
        x={cx}
        y={cy + 13}
        textAnchor="middle"
        style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', fill: '#78716c' }}
      >
        TOTAL
      </text>
    </svg>
  );
};

export default FundManager;
