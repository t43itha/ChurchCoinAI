import { BarChart3 } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactCurrency, formatCurrency } from "./formatters";
import type { DashboardSummaryProps } from "./types";

export default function DashboardTrendPanel({ summary }: DashboardSummaryProps) {
  const chartData = summary.trends.monthlyIncomeExpenditure.map((entry) => ({
    ...entry,
    label: formatMonthLabel(entry.month),
    Income: entry.income,
    Expenditure: entry.expenditure,
    Net: entry.net,
  }));
  const latest = chartData[chartData.length - 1];

  return (
    <section className="swiss-card bg-white overflow-hidden min-w-0" aria-label="Six-month financial trend">
      <div className="px-6 py-[18px] border-b border-[#efeee9] flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 size={18} strokeWidth={1.9} className="text-grey-mid shrink-0" aria-hidden="true" />
            <h3 className="font-bold text-ink text-[12.5px] uppercase tracking-[0.08em] break-words">
              Income and Expenditure Trend
            </h3>
          </div>
          <p className="text-[13.5px] text-grey-mid font-medium mt-1 break-words">
            Six-month unrestricted movement ending {summary.period.label}
          </p>
        </div>
        {latest ? (
          <div className="bg-[#fbfaf8] border border-[#efeee9] rounded-[10px] px-3.5 py-2 w-fit">
            <p className="text-[10px] font-bold text-grey-mid uppercase tracking-[0.08em]">Latest net</p>
            <p className="text-sm font-bold text-ink font-mono tabular-nums">{formatCurrency(latest.Net)}</p>
          </div>
        ) : null}
      </div>

      <div className="h-72 min-w-0 p-3 md:p-5">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#e5e5e5" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#78716c" }}
              dy={10}
              interval={0}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#78716c" }}
              tickFormatter={(value) => formatCompactCurrency(Number(value))}
              width={56}
            />
            <Tooltip
              cursor={{ fill: "#faf9f7" }}
              formatter={(value, name) => [formatCurrency(Number(value)), name]}
              labelFormatter={(label) => `Month: ${label}`}
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e7e5e1",
                boxShadow: "0 16px 40px -24px rgba(28,25,23,.28)",
                fontFamily: "DM Sans, system-ui, sans-serif",
                fontSize: "12px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "11px", fontWeight: 700 }} />
            <Bar dataKey="Income" barSize={24} fill="#1c1917" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Expenditure" barSize={24} fill="#a9743f" radius={[4, 4, 0, 0]} />
            <Line
              type="monotone"
              dataKey="Net"
              stroke="#557555"
              strokeWidth={3}
              dot={{ r: 3, fill: "#557555", strokeWidth: 2, stroke: "#ffffff" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function formatMonthLabel(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);

  if (!match) {
    return month;
  }

  const [, year, monthNumber] = match;
  const date = new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1));

  if (Number.isNaN(date.getTime())) {
    return month;
  }

  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "UTC",
  }).format(date);
}
