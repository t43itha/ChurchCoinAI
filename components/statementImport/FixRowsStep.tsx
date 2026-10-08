import { useState } from "react";
import { Check } from "lucide-react";
import DateInput from "../cashEntry/DateInput";
import {
  amtBox,
  amtInput,
  amtSymbol,
  btnMd,
  btnOutline,
  btnPrimary,
  screenHelp,
  screenTitle,
  tagAmber,
  tagBase,
  txtInput,
} from "../wizard/ui";
import { FIX_ACTION, describeFixProblem, fixKindFor, type Corrections, type FixKind, type FixableError } from "./fixRows";

export type FixStatus = "fixed" | "left-out";
// "fixed" joins the row to the review, "next" means the line still has a problem
// and its card now shows that, and "rejected" keeps the card as it was.
export type FixOutcome = { status: "fixed" } | { status: "next" } | { status: "rejected"; message: string };

export interface FixSummary {
  added: number;
  alreadyImported: number;
  skipped: number;
  needFix: number;
}

interface FixRowsStepProps {
  // The problem each line has now: its original error, or the next one after corrections.
  errors: FixableError[];
  corrections: ReadonlyMap<number, Corrections>;
  statuses: ReadonlyMap<number, FixStatus>;
  summary: FixSummary;
  onFix: (error: FixableError, value: string) => FixOutcome;
  onLeaveOut: (error: FixableError) => void;
}

const TILE = "rounded-2xl border border-ledger bg-white px-3.5 py-3";

function Tile({ value, label, warn }: { value: number; label: string; warn?: boolean }) {
  return (
    <div className={`${TILE} ${warn ? "border-amber bg-amber-light" : ""}`}>
      <div className={`font-mono text-xl font-bold ${warn ? "text-amber" : "text-ink"}`}>{value}</div>
      <div className="text-xs text-grey-mid">{label}</div>
    </div>
  );
}

// The input a row needs to be fixed. Reasons with none (both columns filled) get no input.
function FixInput({
  kind,
  line,
  value,
  onChange,
}: {
  kind: FixKind;
  line: number;
  value: string;
  onChange: (value: string) => void;
}) {
  if (kind === "date") {
    return (
      <DateInput
        aria-label={`Corrected date for line ${line}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${txtInput} min-w-0 flex-1`}
      />
    );
  }
  if (kind === "amount") {
    return (
      <label className={`${amtBox} min-w-0 flex-1`}>
        <span aria-hidden="true" className={amtSymbol}>£</span>
        <input
          aria-label={`Corrected amount for line ${line}`}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={amtInput}
          placeholder="0.00"
        />
      </label>
    );
  }
  return (
    <input
      aria-label={`Corrected description for line ${line}`}
      autoComplete="off"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${txtInput} min-w-0 flex-1`}
    />
  );
}

// One unreadable row: what is wrong, the value as read, a corrected input, and two
// choices. "Leave out" is always available and is the safe default.
function FixCard({
  error,
  kept,
  status,
  onFix,
  onLeaveOut,
}: {
  error: FixableError;
  // Corrections already made on this line, shown so earlier work is visible.
  kept: Corrections | undefined;
  status: FixStatus | undefined;
  onFix: (value: string) => FixOutcome;
  onLeaveOut: () => void;
}) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const kind = fixKindFor(error.reason);

  if (status) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-ledger bg-white px-3.5 py-3 text-sm text-grey-mid">
        {status === "fixed" && <Check size={16} className="shrink-0 text-sage" aria-hidden="true" />}
        <span>
          Line {error.line} · {status === "fixed" ? "fixed" : "left out by you"}
        </span>
      </div>
    );
  }

  return (
    <article className="rounded-2xl border border-ledger bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-grey-mid">Line {error.line} in your file</span>
        <span className={`${tagBase} bg-error-light text-error`}>{error.reason}</span>
      </div>
      <p className="text-[15px] font-semibold text-ink">{describeFixProblem(error)}</p>
      <p className="mt-1 break-words font-mono text-[12.5px] text-grey-mid">Read as “{error.raw}”</p>
      {kept && Object.keys(kept).length > 0 && (
        <p className="mt-2 text-[12.5px] text-sage">
          Kept from earlier: {Object.entries(kept).map(([heading, text]) => `${heading} ${text}`).join(" · ")}
        </p>
      )}

      {kind && (
        <div className="mt-3 flex items-center gap-2">
          <FixInput kind={kind} line={error.line} value={value} onChange={(next) => { setValue(next); setMessage(null); }} />
        </div>
      )}
      {message && <p role="alert" className="mt-2 text-sm font-semibold text-error">{message}</p>}

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button type="button" onClick={onLeaveOut} className={`${btnOutline} ${btnMd}`}>
          Leave out
        </button>
        {kind ? (
          <button
            type="button"
            disabled={!value.trim()}
            onClick={() => {
              const outcome = onFix(value);
              if (outcome.status === "rejected") {
                setMessage(outcome.message);
              } else {
                // Fixed or moved on to the next problem: this card's input is for something else now.
                setValue("");
                setMessage(null);
              }
            }}
            className={`${btnPrimary} ${btnMd}`}
          >
            {FIX_ACTION[kind]}
          </button>
        ) : (
          <span className={`${tagAmber} justify-self-end self-center`}>Check the file</span>
        )}
      </div>
    </article>
  );
}

// Rows the mapping could not read. Each is fixed or left out, and nothing is lost silently.
export default function FixRowsStep({ errors, corrections, statuses, summary, onFix, onLeaveOut }: FixRowsStepProps) {
  const open = errors.filter((error) => !statuses.has(error.line)).length;

  return (
    <div>
      <h2 className={screenTitle}>
        {open > 0 ? `${open} row${open === 1 ? "" : "s"} need a quick look` : "Every row is sorted"}
      </h2>
      <p className={screenHelp}>Everything else was read cleanly. Fix these or leave them out. Nothing is lost silently.</p>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Tile value={summary.added} label="new" />
        <Tile value={summary.alreadyImported} label="already imported" />
        <Tile value={summary.skipped} label="no amount (skipped)" />
        <Tile value={summary.needFix} label="need a fix" warn={summary.needFix > 0} />
      </div>

      <div className="flex flex-col gap-3">
        {errors.map((error) => (
          <FixCard
            // A new problem on the same line gets a fresh card, so its input starts empty.
            key={`${error.line}:${error.reason}`}
            error={error}
            kept={corrections.get(error.line)}
            status={statuses.get(error.line)}
            onFix={(value) => onFix(error, value)}
            onLeaveOut={() => onLeaveOut(error)}
          />
        ))}
      </div>
    </div>
  );
}
