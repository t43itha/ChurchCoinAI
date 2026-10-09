import { sumMoney } from "../../convex/lib/money";
import type { Fund } from "../../types";
import { balanceSplit, TYPE_COLOUR } from "./fundFacts";

// Share of the total held by each restriction type, shown as a donut.
export default function CapitalAllocation({ funds }: { funds: Fund[] }) {
  const total = sumMoney(funds, (fund) => fund.balance);
  const segments = balanceSplit(funds).map((segment) => ({ ...segment, colour: TYPE_COLOUR[segment.type] }));

  return (
    <section aria-labelledby="capital-allocation-title" className="rounded-2xl border border-ledger bg-white p-4">
      <h3 id="capital-allocation-title" className="text-[15px] font-bold text-ink">
        Capital allocation
      </h3>
      <p className="mb-4 mt-0.5 text-xs text-grey-mid">By restriction type</p>
      <div className="flex items-center gap-6">
        <Donut segments={segments} total={total} />
        <ul className="flex flex-1 flex-col gap-3">
          {segments.map((segment) => (
            <li key={segment.type} className="flex items-center gap-2.5">
              <span className="h-[11px] w-[11px] shrink-0 rounded-[3px]" style={{ background: segment.colour }} aria-hidden="true" />
              <span className="flex-1 text-[12.5px] text-grey-dark">{segment.type}</span>
              <span className="font-mono text-[12.5px] font-bold text-ink">
                {total > 0 ? Math.round((segment.amount / total) * 100) : 0}%
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 rounded-[10px] border border-[#ecd8bd] bg-[#fcf7f0] px-3.5 py-2.5 text-xs leading-relaxed text-[#7a5a30]">
        <strong className="font-bold">Note:</strong> Restricted funds must be reported separately in year-end accounts.
      </p>
    </section>
  );
}

// SVG donut chart with the total in the centre.
function Donut({ segments, total }: { segments: { type: string; amount: number; colour: string }[]; total: number }) {
  const size = 132;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden="true">
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {segments.map((segment) => {
          const dash = total > 0 ? (segment.amount / total) * circ : 0;
          const el = (
            <circle
              key={segment.type}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={segment.colour}
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
        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 700, fill: "#1c1917" }}
      >
        £{Math.round(total / 1000)}k
      </text>
      <text
        x={cx}
        y={cy + 13}
        textAnchor="middle"
        style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9.5, fontWeight: 700, letterSpacing: ".08em", fill: "#78716c" }}
      >
        TOTAL
      </text>
    </svg>
  );
}
