import { useState, type ReactNode } from "react";
import { Check, Plus, Target } from "lucide-react";
import type { Donor, PledgeCreateInput } from "../../types";
import RailStep from "../wizard/RailStep";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import {
  Segmented,
  amtBox,
  amtInput,
  amtSymbol,
  btnLg,
  btnPrimary,
  eyebrow,
  fieldLabel,
  nextIcon,
  nextItem,
  screenTitle,
  tickBox,
  tickRow,
  txtInput,
} from "../wizard/ui";
import { buildPledgeInput, PLEDGE_FREQUENCIES, pledgeAmountReady, pledgeFormReady, railState, type PledgeForm } from "./logic";

const STEPS = ["Donor", "Amount & schedule"] as const;
const DONE = STEPS.length;

export interface PledgeWalkthroughProps {
  campaignName: string;
  fundId: string;
  donors: Donor[];
  today: string;
  onAdd: (pledge: PledgeCreateInput) => void;
  onClose: () => void;
}

// Walkthrough for one pledge: who is giving, how much and on what schedule, then done.
export default function PledgeWalkthrough({ campaignName, fundId, donors, today, onAdd, onClose }: PledgeWalkthroughProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<PledgeForm>({
    donorName: "",
    amount: "",
    frequency: "Monthly",
    startDate: today,
    endDate: "",
  });

  const update = (patch: Partial<PledgeForm>) => setForm((current) => ({ ...current, ...patch }));
  const query = form.donorName.trim().toLowerCase();
  const suggestions = donors.filter((donor) => donor.name.toLowerCase().includes(query)).slice(0, 6);

  const save = () => {
    onAdd(buildPledgeInput(form, { fundId, donors, today }));
    setStep(DONE);
  };

  const restart = () => {
    setForm({ donorName: "", amount: "", frequency: "Monthly", startDate: today, endDate: "" });
    setStep(0);
  };

  const rail = (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-ledger bg-white p-4 lg:flex">
      <div className={`${eyebrow} mx-2.5 mb-1`}>{campaignName}</div>
      {STEPS.map((label, index) => {
        const state = railState(index, step);
        return (
          <RailStep
            key={label}
            marker={String(index + 1)}
            label={label}
            state={state}
            disabled={state === "todo"}
            onClick={() => setStep(index)}
          />
        );
      })}
    </aside>
  );

  let body: ReactNode;
  let footer = null;

  if (step === 0) {
    body = (
      <>
        <h2 className={screenTitle}>Who is giving?</h2>
        <label htmlFor="pledge-donor" className={fieldLabel}>
          Donor name
        </label>
        <input
          id="pledge-donor"
          type="text"
          autoComplete="off"
          placeholder="Search donors or type a name"
          value={form.donorName}
          onChange={(event) => update({ donorName: event.target.value, donorId: undefined })}
          className={txtInput}
        />
        <div className="mt-3 grid gap-2">
          {suggestions.map((donor) => {
            const picked = form.donorId === donor._id;
            return (
              <button
                key={donor._id}
                type="button"
                aria-pressed={picked}
                onClick={() => update({ donorName: donor.name, donorId: donor._id })}
                className={`${tickRow} ${picked ? "border-ink" : "border-ledger"}`}
              >
                <span className={`${tickBox} ${picked ? "border-ink bg-ink text-white" : "border-ledger"}`} aria-hidden="true">
                  {picked && <Check size={14} aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{donor.name}</span>
              </button>
            );
          })}
        </div>
      </>
    );
    footer = (
      <StepFooter>
        <button type="button" disabled={!pledgeFormReady(form)} onClick={() => setStep(1)} className={`${btnPrimary} ${btnLg}`}>
          Next: amount and schedule →
        </button>
      </StepFooter>
    );
  } else if (step === 1) {
    body = (
      <>
        <h2 className={screenTitle}>How much, and how often?</h2>
        <label htmlFor="pledge-amount" className={fieldLabel}>
          Amount
        </label>
        <div className={amtBox}>
          <span className={amtSymbol} aria-hidden="true">
            £
          </span>
          <input
            id="pledge-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.amount}
            onChange={(event) => update({ amount: event.target.value })}
            className={amtInput}
          />
        </div>

        <span className={fieldLabel}>Frequency</span>
        <Segmented options={PLEDGE_FREQUENCIES} value={form.frequency} onChange={(frequency) => update({ frequency })} label="Frequency" />

        <label htmlFor="pledge-start" className={fieldLabel}>
          Start date
        </label>
        <input
          id="pledge-start"
          type="date"
          value={form.startDate}
          onChange={(event) => update({ startDate: event.target.value })}
          className={txtInput}
        />

        <label htmlFor="pledge-end" className={fieldLabel}>
          End date (optional)
        </label>
        <input
          id="pledge-end"
          type="date"
          value={form.endDate}
          onChange={(event) => update({ endDate: event.target.value })}
          className={txtInput}
        />
      </>
    );
    footer = (
      <StepFooter>
        <button type="button" disabled={!pledgeAmountReady(form)} onClick={save} className={`${btnPrimary} ${btnLg}`}>
          <Plus size={16} aria-hidden="true" />
          Add pledge
        </button>
      </StepFooter>
    );
  } else {
    body = (
      <div className="pt-4 text-center">
        <h2 className={`${screenTitle} text-center`}>Pledge added</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-grey-mid">
          {form.donorName.trim()} · {campaignName}
        </p>
        <div className="mt-6 text-left">
          <span className={fieldLabel}>What's next</span>
          <button type="button" onClick={restart} className={`${nextItem} mb-2`}>
            <span className={`${nextIcon} bg-grey-light text-ink`}>
              <Plus size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] text-ink">Add another pledge</b>
              <span className="text-xs text-grey-mid">Stays on this campaign.</span>
            </span>
          </button>
          <button type="button" onClick={onClose} className={nextItem}>
            <span className={`${nextIcon} bg-grey-light text-ink`}>
              <Target size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] text-ink">Back to the campaign</b>
              <span className="text-xs text-grey-mid">See the pledge in the list.</span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <WizardFrame
      ariaLabel="Add pledge"
      title="Add pledge"
      onClose={onClose}
      onBack={step > 0 && step < DONE ? () => setStep(step - 1) : undefined}
      progress={{ total: STEPS.length, current: step }}
      rail={rail}
      footer={footer}
    >
      {body}
    </WizardFrame>
  );
}
