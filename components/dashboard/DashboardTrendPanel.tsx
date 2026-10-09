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
import { sectionTitle } from "../wizard/ui";

// Money in is sage and money out is stone; the net line is ink so it reads apart from the bars.
const IN_COLOUR = "#6b8e6b";
const OUT_COLOUR = "#a8a29e";

export default function DashboardTrendPanel({ summary }: DashboardSummaryProps) {
  const chartData = summary.trends.monthlyIncomeExpenditure.map((entry) => ({
    ...entry,
    label: formatMonthLabel(entry.month),
    Income: entry.income,
    Expenditure: entry.expenditure,
    Net: entry.net,
  }));

  return (
    <section className="min-w-0 rounded-2xl border border-ledger bg-white p-4 md:p-5" aria-label="Six-month income and expenditure">
      <div className="min-w-0">
        <h2 className={sectionTitle}>Income and expenditure</h2>
        <p className="mt-1 break-words text-[13px] font-medium text-grey-mid">
          Six months of unrestricted movement to {summary.period.label}
        </p>
      </div>

      <div className="mt-3 h-72 min-w-0">
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
            <Legend wrapperStyle={{ fontSize: "12px", fontWeight: 600 }} />
            <Bar dataKey="Income" barSize={22} fill={IN_COLOUR} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Expenditure" barSize={22} fill={OUT_COLOUR} radius={[4, 4, 0, 0]} />
            <Line
              type="monotone"
              dataKey="Net"
              stroke="#1c1917"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#1c1917", strokeWidth: 2, stroke: "#ffffff" }}
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
