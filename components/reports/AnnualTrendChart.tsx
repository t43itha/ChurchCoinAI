import React, { useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { roundMoney, sumMoney } from "../../convex/lib/money";
import type { TrendPoint } from "../../lib/reportSummary";
import { ComparisonToggle } from "./ComparisonToggle";
import { formatCompactCurrency, formatCurrency } from "./format";
import { AXIS_TEXT, GRID_LINE, INCOME_SERIES, PRIOR_YEAR_LINE, SPENDING_SERIES } from "./palette";

export interface AnnualTrendChartProps {
  points: TrendPoint[];
}

type TrendView = "monthly" | "cumulative" | "table";

const VIEW_OPTIONS: { id: TrendView; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "cumulative", label: "Cumulative" },
  { id: "table", label: "Table" },
];

interface ChartDatum {
  label: string;
  income: number | null;
  spending: number | null;
  priorIncome: number | null;
  isPartial: boolean;
}

const TICK_STYLE = { fontSize: 11, fill: AXIS_TEXT };

const LegendSwatch: React.FC<{ colour: string; dashed?: boolean }> = ({ colour, dashed = false }) =>
  dashed ? (
    <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: colour }} />
  ) : (
    <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colour }} />
  );

export const AnnualTrendChart: React.FC<AnnualTrendChartProps> = ({ points }) => {
  const [view, setView] = useState<TrendView>("monthly");
  const hasPrior = points.some((point) => point.priorIncome !== undefined);

  // Buckets after throughDate have no figures yet, so they are left blank (null).
  const monthlyData: ChartDatum[] = points.map((point) => ({
    label: point.label,
    income: point.isFuture ? null : point.income,
    spending: point.isFuture ? null : point.expenditure,
    priorIncome: point.priorIncome ?? null,
    isPartial: point.isPartial,
  }));

  const cumulativeData: ChartDatum[] = points.map((point, index) => {
    const upToNow = points.slice(0, index + 1).filter((item) => !item.isFuture);
    const upToEnd = points.slice(0, index + 1);
    return {
      label: point.label,
      income: point.isFuture ? null : sumMoney(upToNow, (item) => item.income),
      spending: point.isFuture ? null : sumMoney(upToNow, (item) => item.expenditure),
      priorIncome: hasPrior ? sumMoney(upToEnd, (item) => item.priorIncome ?? 0) : null,
      isPartial: false,
    };
  });

  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-grey-dark">
      <span className="flex items-center gap-1.5">
        <LegendSwatch colour={INCOME_SERIES} />
        Income
      </span>
      <span className="flex items-center gap-1.5">
        <LegendSwatch colour={SPENDING_SERIES} />
        Spending
      </span>
      {hasPrior && (
        <span className="flex items-center gap-1.5">
          <LegendSwatch colour={PRIOR_YEAR_LINE} dashed />
          Income last year
        </span>
      )}
    </div>
  );

  const header = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      {view === "table" ? <span /> : legend}
      <ComparisonToggle
        ariaLabel="Trend view"
        options={VIEW_OPTIONS}
        value={view}
        onChange={(id) => setView(id as TrendView)}
      />
    </div>
  );

  if (view === "table") {
    return (
      <div>
        {header}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Month by month figures">
            <thead>
              <tr className="border-b border-[#efeee9] bg-[#fcfbf9] font-mono text-[10.5px] uppercase tracking-[0.07em] text-grey-mid">
                <th scope="col" className="px-3 py-2 text-left font-semibold">Month</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Income</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Spending</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Net</th>
                {hasPrior && <th scope="col" className="px-3 py-2 text-right font-semibold">Last year income</th>}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.startDate} className="border-b border-[#efeee9]">
                  <td className="px-3 py-2 text-ink">
                    {point.label}
                    {point.isFuture && <span className="ml-1.5 text-xs text-grey-mid">not yet</span>}
                    {point.isPartial && <span className="ml-1.5 text-xs text-grey-mid">to date</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink">
                    {point.isFuture ? "—" : formatCurrency(point.income)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink">
                    {point.isFuture ? "—" : formatCurrency(point.expenditure)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink">
                    {point.isFuture ? "—" : formatCurrency(roundMoney(point.income - point.expenditure))}
                  </td>
                  {hasPrior && (
                    <td className="px-3 py-2 text-right font-mono text-grey-mid">
                      {point.priorIncome === undefined ? "—" : formatCurrency(point.priorIncome)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const isMonthly = view === "monthly";
  const data = isMonthly ? monthlyData : cumulativeData;
  const ariaLabel = isMonthly ? "Income and spending by month" : "Cumulative income and spending by month";

  return (
    <div>
      {header}
      <div role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={GRID_LINE} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK_STYLE} />
            <YAxis tickFormatter={formatCompactCurrency} tickLine={false} axisLine={false} width={52} tick={TICK_STYLE} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} cursor={{ fill: "#f7f6f4" }} />
            {isMonthly ? (
              <>
                <Bar dataKey="income" name="Income" fill={INCOME_SERIES} radius={[4, 4, 0, 0]}>
                  {monthlyData.map((datum) => (
                    <Cell key={datum.label} fill={INCOME_SERIES} fillOpacity={datum.isPartial ? 0.4 : 1} />
                  ))}
                </Bar>
                <Bar dataKey="spending" name="Spending" fill={SPENDING_SERIES} radius={[4, 4, 0, 0]}>
                  {monthlyData.map((datum) => (
                    <Cell key={datum.label} fill={SPENDING_SERIES} fillOpacity={datum.isPartial ? 0.4 : 1} />
                  ))}
                </Bar>
              </>
            ) : (
              <>
                <Line type="monotone" dataKey="income" name="Income" stroke={INCOME_SERIES} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="spending" name="Spending" stroke={SPENDING_SERIES} strokeWidth={2} dot={false} />
              </>
            )}
            {hasPrior && (
              <Line
                type="monotone"
                dataKey="priorIncome"
                name="Income last year"
                stroke={PRIOR_YEAR_LINE}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                connectNulls={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
