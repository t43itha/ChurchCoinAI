import React from "react";
import { formatCurrency } from "./format";

export type KpiValueTone = "default" | "positive" | "negative";

export interface KpiSparkline {
  values: number[];
  color: string;
  labels: string[];
  zeroLine?: boolean;
}

export interface KpiCardProps {
  label: string;
  value: string;
  valueTone?: KpiValueTone;
  lines?: React.ReactNode[];
  sparkline?: KpiSparkline;
  children?: React.ReactNode;
}

const VALUE_TONE: Record<KpiValueTone, string> = {
  default: "text-ink",
  positive: "text-sage",
  negative: "text-error",
};

const SPARK_HEIGHT = 34;
const SPARK_WIDTH = 200;
const SPARK_PAD = 3;

const Sparkline: React.FC<KpiSparkline> = ({ values, color, labels, zeroLine = false }) => {
  if (values.length < 2) return null;

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const step = SPARK_WIDTH / (values.length - 1);
  const yFor = (value: number) =>
    SPARK_PAD + (1 - (value - min) / span) * (SPARK_HEIGHT - 2 * SPARK_PAD);
  const points = values.map((value, index) => ({ x: index * step, y: yFor(value) }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const last = points[points.length - 1];
  const lastPct = (last.y / SPARK_HEIGHT) * 100;

  return (
    <div className="relative mt-2.5" role="img" aria-label={`Last 12 months trend, ${values.length} points`}>
      <svg
        width="100%"
        height={SPARK_HEIGHT}
        viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
        preserveAspectRatio="none"
        className="block overflow-visible"
      >
        {zeroLine && (
          <line
            x1={0}
            x2={SPARK_WIDTH}
            y1={yFor(0)}
            y2={yFor(0)}
            stroke="#e7e5e1"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path d={path} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {values.map((value, index) => (
          <rect
            key={index}
            x={index * step - step / 2}
            y={0}
            width={step}
            height={SPARK_HEIGHT}
            fill="transparent"
          >
            <title>{`${labels[index] ?? ""}: ${formatCurrency(value)}`}</title>
          </rect>
        ))}
      </svg>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: "100%", top: `${lastPct}%`, backgroundColor: color }}
      />
    </div>
  );
};

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  valueTone = "default",
  lines,
  sparkline,
  children,
}) => (
  <div className="swiss-card-static p-4 pb-3.5">
    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-grey-mid">{label}</p>
    <p className={`mb-1.5 mt-2 font-mono text-[25px] font-bold leading-tight tracking-[-0.02em] ${VALUE_TONE[valueTone]}`}>
      {value}
    </p>
    {children}
    {lines && lines.length > 0 && (
      <div className="flex flex-col gap-0.5 text-[12.5px] text-grey-mid">
        {lines.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
    )}
    {sparkline && <Sparkline {...sparkline} />}
  </div>
);

export interface ChangeLineProps {
  change: number | null;
  versus: string;
  polarity: "income" | "spending" | "net";
}

const changeTone = (change: number, polarity: ChangeLineProps["polarity"]): string => {
  if (change === 0) return "text-grey-mid";
  if (polarity === "spending") {
    return Math.abs(change) >= 25 ? "font-semibold text-amber" : "text-grey-mid";
  }
  return change > 0 ? "text-sage" : "text-error";
};

// "▲ 10.5% vs Aug (£13,410)". Spending is never red; large moves are amber.
export const ChangeLine: React.FC<ChangeLineProps> = ({ change, versus, polarity }) => {
  if (change === null) {
    return <span className="text-grey-mid">{versus}</span>;
  }
  const arrow = change >= 0 ? "▲" : "▼";
  const pct = `${Math.abs(change).toFixed(1)}%`;
  return (
    <span>
      <span className={changeTone(change, polarity)}>
        {arrow} {pct}
      </span>{" "}
      <span className="text-grey-mid">{versus}</span>
    </span>
  );
};
