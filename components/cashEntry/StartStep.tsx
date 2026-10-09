import { useState } from "react";
import { Check } from "lucide-react";
import DateInput from "./DateInput";
import {
  SERVICE_PRESETS,
  customServiceDateRange,
  isPresetServiceId,
  presetDate,
  type StoredDraft,
} from "../../lib/cashCollectionDraft";
import { getWeekEndingSunday } from "../../lib/dateUtils";
import { longDate, shortDate, weekRange } from "./format";
import {
  btnSage,
  btnDashed,
  chip,
  linkBtn,
  screenHelp,
  screenTitle,
  btnMd,
  btnOutline,
  darkCard,
  tickBox,
  tickRow,
  txtInput,
} from "../wizard/ui";
import type { WizardModel } from "./useCollectionDraft";

interface StartStepProps {
  model: WizardModel;
  existingCount: number;
  resumable: StoredDraft | null;
  onResume: () => void;
  onDiscardStored: () => void;
}

const savedAtLabel = (savedAt: string) =>
  new Date(savedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function StartStep({ model, existingCount, resumable, onResume, onDiscardStored }: StartStepProps) {
  const { draft, dispatch, toggleService } = model;
  const [changingWeek, setChangingWeek] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customDate, setCustomDate] = useState(draft.weekEndingDate);

  const selectedIds = new Set(draft.services.map((service) => service.id));
  const usualPresets = SERVICE_PRESETS.filter((preset) => preset.usual || selectedIds.has(preset.id));
  const extraPresets = SERVICE_PRESETS.filter((preset) => !preset.usual && !selectedIds.has(preset.id));
  // Custom services are ticked too: unticking one removes it.
  const rows = [
    ...usualPresets.map((preset) => ({
      id: preset.id,
      label: preset.label,
      date: presetDate(draft.weekEndingDate, preset),
    })),
    ...draft.services
      .filter((service) => !isPresetServiceId(service.id))
      .map((service) => ({ id: service.id, label: service.label, date: service.date })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const { min, max } = customServiceDateRange(draft.weekEndingDate);
  const customDateValid = customDate >= min && customDate <= max;

  const addCustom = () => {
    dispatch({ type: "addCustomService", id: crypto.randomUUID(), label: customLabel, date: customDate });
    setCustomLabel("");
    setCustomDate(draft.weekEndingDate);
    setCustomOpen(false);
  };

  return (
    <div className="space-y-2.5">
      {resumable && (
        <div className="rounded-2xl border border-[#d5e2d5] bg-sage-light p-3.5">
          <p className="text-sm text-grey-dark">
            You have an unfinished count from {savedAtLabel(resumable.savedAt)}.
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <button type="button" onClick={onResume} className={`${btnSage} ${btnMd}`}>
              Resume
            </button>
            <button type="button" onClick={onDiscardStored} className={`${btnOutline} ${btnMd}`}>
              Discard
            </button>
          </div>
        </div>
      )}

      <div className={darkCard}>
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/55">Week ending</div>
        <div className="mb-0.5 mt-1 text-[21px] font-bold tracking-tight">{longDate(draft.weekEndingDate)}</div>
        <div className="text-[12.5px] text-white/65">
          {weekRange(draft.weekEndingDate)} ·{" "}
          <button
            type="button"
            onClick={() => setChangingWeek((open) => !open)}
            className="inline-flex min-h-11 items-center underline underline-offset-2"
          >
            change week
          </button>
        </div>
        {changingWeek && (
          <DateInput
            aria-label="Week ending date"
            value={draft.weekEndingDate}
            onChange={(event) => {
              if (event.target.value) {
                dispatch({ type: "setWeek", weekEndingDate: getWeekEndingSunday(event.target.value) });
              }
            }}
            className="mt-2.5 h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-base text-white [color-scheme:dark]"
          />
        )}
      </div>

      {existingCount > 0 && (
        <div className="rounded-2xl bg-amber-light p-3 text-sm text-amber">
          Giving for this week is already recorded. Saving adds another collection.
        </div>
      )}

      <h2 className={`${screenTitle} mt-4`}>Which services had a collection?</h2>
      <p className={screenHelp}>Your usual services are ticked. Busy week? Add the extra days.</p>

      {rows.map((row) => {
        const on = selectedIds.has(row.id);
        return (
          <button
            key={row.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggleService(row.id)}
            className={`${tickRow} ${on ? "border-ink" : "border-ledger"}`}
          >
            <span className={`${tickBox} ${on ? "border-ink bg-ink text-white" : "border-[#cfcac2]"}`}>
              {on && <Check size={14} aria-hidden="true" />}
            </span>
            <b className="min-w-0 flex-1 truncate text-[14.5px]">{row.label}</b>
            <span className="whitespace-nowrap text-[12.5px] text-grey-mid">{shortDate(row.date)}</span>
          </button>
        );
      })}

      {moreOpen ? (
        <div className="rounded-2xl border-[1.5px] border-dashed border-[#d6d3cd] bg-white p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.06em] text-grey-mid">
            <span>Add a service</span>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                setCustomOpen(false);
              }}
              className={linkBtn}
            >
              Done
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {extraPresets.map((preset) => (
              <button key={preset.id} type="button" onClick={() => toggleService(preset.id)} className={chip}>
                + {preset.label}
              </button>
            ))}
          </div>

          {customOpen ? (
            <div className="mt-3 space-y-2.5 border-t border-dashed border-ledger pt-3">
              <input
                aria-label="Service name"
                className={txtInput}
                placeholder="Wedding, special service…"
                autoComplete="off"
                value={customLabel}
                onChange={(event) => setCustomLabel(event.target.value)}
              />
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
                <DateInput
                  aria-label="Service date"
                  min={min}
                  max={max}
                  value={customDate}
                  onChange={(event) => setCustomDate(event.target.value)}
                  className={`${txtInput} min-w-0`}
                />
                <button
                  type="button"
                  disabled={customLabel.trim() === "" || !customDateValid}
                  onClick={addCustom}
                  className={`${btnSage} ${btnMd} px-4`}
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setCustomDate(draft.weekEndingDate);
                setCustomOpen(true);
              }}
              className={`${btnDashed} mt-3`}
            >
              + Something else (wedding, special service…)
            </button>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setMoreOpen(true)} className={btnDashed}>
          + Another service this week
        </button>
      )}
    </div>
  );
}
