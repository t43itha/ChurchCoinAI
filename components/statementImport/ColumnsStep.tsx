import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { ColumnMapping } from "../../lib/statementImport";
import { mapStatementRows } from "../../lib/statementImport";
import { ROLE_LABEL, ignoredColumns, isMappingComplete, rolesFor, type ColumnRole, type ParsedStatement } from "./statementFile";
import { signedGbp, fullDate } from "./format";
import { Segmented, linkBtnSm, screenHelp, screenTitle, tagAmber, txtInput } from "../wizard/ui";

const SINGLE = "One amount column";
const SPLIT = "Money in and out columns";

interface ColumnsStepProps {
  statement: ParsedStatement;
  onChange: (mapping: ColumnMapping, split: boolean) => void;
}

// One settled role: "Role ← column" with Change, or an amber picker when the
// detection could not name a column for it.
function RoleRow({
  role,
  headers,
  value,
  onPick,
}: {
  role: ColumnRole;
  headers: string[];
  value: string;
  onPick: (header: string) => void;
}) {
  const [changing, setChanging] = useState(false);
  const missing = !headers.includes(value);
  const picking = missing || changing;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-3.5 py-3 ${
        missing ? "border-amber bg-amber-light" : "border-ledger bg-white"
      }`}
    >
      <span className="w-24 shrink-0 text-sm font-bold text-ink">{ROLE_LABEL[role]}</span>
      <span aria-hidden="true" className="text-grey-mid">←</span>
      {picking ? (
        <select
          aria-label={`${ROLE_LABEL[role]} column`}
          value={missing ? "" : value}
          onChange={(event) => {
            if (event.target.value) {
              onPick(event.target.value);
              setChanging(false);
            }
          }}
          className={`${txtInput} min-w-0 flex-1`}
        >
          <option value="">Choose a column…</option>
          {headers.map((header) => (
            <option key={header} value={header}>{header}</option>
          ))}
        </select>
      ) : (
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-grey-dark">{value}</span>
      )}
      {missing && <span className={tagAmber}>Choose</span>}
      {!picking && (
        <button type="button" onClick={() => setChanging(true)} className={linkBtnSm}>
          Change
        </button>
      )}
    </div>
  );
}

// Row 1 of the file, raw and then as the import will read it.
function LivePreview({ statement }: { statement: ParsedStatement }) {
  const first = statement.records[0];
  const result = mapStatementRows([first], statement.headers, statement.mapping, statement.split);
  const row = result.rows[0];
  const problem = result.errors[0]?.reason ?? (result.skipped.length > 0 ? "no amount" : null);

  return (
    <div className="mt-5 grid gap-3 rounded-2xl border border-ledger bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
      <div className="min-w-0">
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-grey-mid">Row 1 in your file</div>
        <div className="break-words rounded-xl bg-paper px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-grey-dark">
          {first.cells.join(" · ")}
        </div>
      </div>
      <span aria-hidden="true" className="hidden text-center font-bold text-grey-mid md:block">
        <ArrowRight size={18} />
      </span>
      <div className="min-w-0">
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-grey-mid">Becomes</div>
        {row ? (
          <div className="rounded-xl bg-paper px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-semibold text-ink">{row.description}</span>
              <span className={`shrink-0 font-mono text-sm font-bold ${row.type === "Income" ? "text-sage" : "text-ink"}`}>
                {signedGbp(row.type === "Income" ? row.amount : -row.amount)}
              </span>
            </div>
            <div className="mt-0.5 text-[11.5px] text-grey-mid">
              {fullDate(row.date)} · {row.type === "Income" ? "Money in" : "Money out"}
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-amber-light px-3 py-2.5 text-sm text-amber">
            {problem === "no amount"
              ? "This row has no amount, so it would be skipped."
              : `This row would be left out: ${problem?.toLowerCase()}.`}
          </p>
        )}
      </div>
    </div>
  );
}

// Columns found in the header, with the live translation of the first row.
export default function ColumnsStep({ statement, onChange }: ColumnsStepProps) {
  const { headers, mapping, split } = statement;
  const complete = isMappingComplete(mapping, split, headers);
  const ignored = ignoredColumns(mapping, split, headers);

  return (
    <div>
      <h2 className={screenTitle}>{complete ? "We've matched your columns" : "Check your columns"}</h2>
      <p className={screenHelp}>
        {complete
          ? "Check one thing below. The preview shows exactly what row 1 will become."
          : "We couldn't match every column. Choose the ones marked amber, then check the preview."}
      </p>

      <Segmented
        label="Amount layout"
        options={[SINGLE, SPLIT] as const}
        value={split ? SPLIT : SINGLE}
        onChange={(option) => onChange(mapping, option === SPLIT)}
      />

      <div className="mt-4 flex flex-col gap-2.5">
        {rolesFor(split).map((role) => (
          <RoleRow
            key={`${split}:${role}`}
            role={role}
            headers={headers}
            value={mapping[role]}
            onPick={(header) => onChange({ ...mapping, [role]: header }, split)}
          />
        ))}
      </div>

      {ignored.length > 0 && (
        <p className="mt-3 text-xs text-grey-mid">
          Ignored: {ignored.join(", ")}
        </p>
      )}

      {complete && <LivePreview statement={statement} />}
    </div>
  );
}
