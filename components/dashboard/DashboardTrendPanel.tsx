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
import type { DashboardSummaryProps } from "./types";

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export default function DashboardTrendPanel({ summary }: DashboardSummaryProps) {
  const chartData = summary.trends.monthlyIncomeExpenditure.map((entry) => ({
    ...entry,
    label: formatMonthLabel(entry.month),
    Income: entry.income,
    Expenditure: entry.expenditure,
    Net: entry.net,
  }));

  return (
    <section className="swiss-card bg-white p-5 md:p-6 min-w-0" aria-label="Six-month financial trend">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 size={18} className="text-grey-mid shrink-0" aria-hidden="true" />
            <h3 className="font-bold text-ink text-lg break-words">
              Income and Expenditure Trend
            </h3>
          </div>
          <p className="text-xs text-grey-mid font-medium mt-1 break-words">
            Six-month unrestricted movement ending {summary.period.label}
          </p>
        </div>
      </div>

      <div className="h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#666666" }}
              dy={10}
              interval={0}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#666666" }}
              tickFormatter={(value) => compactCurrency(Number(value))}
              width={56}
            />
            <Tooltip
              cursor={{ fill: "#fafaf9" }}
              formatter={(value, name) => [currencyFormatter.format(Number(value)), name]}
              labelFormatter={(label) => `Month: ${label}`}
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #000000",
                boxShadow: "4px 4px 0px rgba(0,0,0,1)",
                fontFamily: "JetBrains Mono",
                fontSize: "12px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "11px", fontWeight: 700 }} />
            <Bar dataKey="Income" barSize={24} fill="#000000" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Expenditure" barSize={24} fill="#d4a574" radius={[4, 4, 0, 0]} />
            <Line
              type="monotone"
              dataKey="Net"
              stroke="#6b8e6b"
              strokeWidth={3}
              dot={{ r: 3, fill: "#6b8e6b", strokeWidth: 2, stroke: "#ffffff" }}
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

function compactCurrency(value: number) {
  const absolute = Math.abs(value);

  if (absolute >= 1000) {
    return `£${Math.round(value / 1000)}k`;
  }

  return `£${value}`;
}
