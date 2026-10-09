import React, { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { roundMoney, sumMoney } from "../../convex/lib/money";
import { AXIS_TEXT, GRID_LINE, INCOME_SERIES, SPENDING_SERIES } from "./palette";
import { formatCompactCurrency, formatCurrency, formatShortDate, niceAxisTicks } from "./format";

export interface WeeklyChartWeek {
  weekEnding: string;
  receiptsTotal: number;
  paymentsTotal: number;
}

export interface WeeklyChartProps {
  weeks: WeeklyChartWeek[];
  monthEnd: string;
}

interface WeeklyDatum {
  label: string;
  income: number;
  spending: number;
  net: number;
}

const isWeeklyDatum = (value: unknown): value is WeeklyDatum =>
  typeof value === "object" &&
  value !== null &&
  "income" in value &&
  "spending" in value &&
  "net" in value &&
  "label" in value;

const WeeklyTooltip = (props: TooltipContentProps<number | string | Array<number | string>, string>) => {
  const datum = props.payload[0]?.payload;
  if (!props.active || !isWeeklyDatum(datum)) return null;
  return (
    <div className="rounded-lg border border-ledger bg-white px-3 py-2 text-xs shadow-soft-md">
      <p className="mb-1 font-semibold text-ink">Week ending {datum.label}</p>
      <p className="text-grey-dark">Income {formatCurrency(datum.income)}</p>
      <p className="text-grey-dark">Spending {formatCurrency(datum.spending)}</p>
      <p className="font-semibold text-ink">Net {formatCurrency(datum.net)}</p>
    </div>
  );
};

const Legend: React.FC = () => (
  <div className="mb-2 flex flex-wrap gap-4 text-xs text-grey-dark">
    <span className="flex items-center gap-1.5">
      <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: INCOME_SERIES }} />
      Income
    </span>
    <span className="flex items-center gap-1.5">
      <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SPENDING_SERIES }} />
      Spending
    </span>
  </div>
);

export const WeeklyChart: React.FC<WeeklyChartProps> = ({ weeks, monthEnd }) => {
  const [showTable, setShowTable] = useState(false);

  const data: WeeklyDatum[] = weeks.map((week) => ({
    label: formatShortDate(week.weekEnding),
    income: week.receiptsTotal,
    spending: week.paymentsTotal,
    net: roundMoney(week.receiptsTotal - week.paymentsTotal),
  }));
  const axisTicks = niceAxisTicks(data.flatMap((d) => [d.income, d.spending]));

  const incomeTotal = sumMoney(weeks, (week) => week.receiptsTotal);
  const spendingTotal = sumMoney(weeks, (week) => week.paymentsTotal);
  const netTotal = roundMoney(incomeTotal - spendingTotal);
  const caption = `Weeks ending in the month to ${formatShortDate(monthEnd)}`;

  if (weeks.length === 0) {
    return <p className="py-3 text-sm text-grey-mid">No weekly activity in this period.</p>;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Legend />
        <button
          type="button"
          aria-pressed={showTable}
          onClick={() => setShowTable((value) => !value)}
          className="text-xs font-semibold text-grey-dark underline-offset-2 hover:underline"
        >
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label={caption}>
            <thead>
              <tr className="border-b border-[#efeee9] bg-[#fcfbf9] text-xs font-bold text-grey-mid">
                <th scope="col" className="px-3 py-2 text-left font-semibold">Week ending</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Income</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Spending</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Net</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.label} className="border-b border-[#efeee9]">
                  <td className="px-3 py-2 text-ink">{row.label}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{formatCurrency(row.income)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{formatCurrency(row.spending)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{formatCurrency(row.net)}</td>
                </tr>
              ))}
              <tr className="bg-[#fbfaf8] font-bold">
                <td className="px-3 py-2 text-ink">Total</td>
                <td className="px-3 py-2 text-right font-mono text-ink">{formatCurrency(incomeTotal)}</td>
                <td className="px-3 py-2 text-right font-mono text-ink">{formatCurrency(spendingTotal)}</td>
                <td className="px-3 py-2 text-right font-mono text-ink">{formatCurrency(netTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={`${caption}: income and spending by week`}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data} barGap={2} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_LINE} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} />
              <YAxis
                ticks={axisTicks}
                domain={[0, axisTicks[axisTicks.length - 1]]}
                tickFormatter={formatCompactCurrency}
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fontSize: 11, fill: AXIS_TEXT }}
              />
              <Tooltip content={WeeklyTooltip} cursor={{ fill: "#f7f6f4" }} />
              <Bar dataKey="income" name="Income" fill={INCOME_SERIES} radius={[4, 4, 0, 0]} />
              <Bar dataKey="spending" name="Spending" fill={SPENDING_SERIES} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
