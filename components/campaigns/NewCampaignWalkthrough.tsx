import { useState, type ReactNode } from "react";
import { Check, Target } from "lucide-react";
import type { FundCreateInput } from "../../types";
import RailStep from "../wizard/RailStep";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnLg, btnPrimary, eyebrow, fieldLabel, nextIcon, nextItem, screenTitle, txtInput, amtBox, amtInput, amtSymbol, txtArea } from "../wizard/ui";
import { buildCampaignFund, campaignNameReady, campaignTargetReady, railState, type NewCampaignForm } from "./logic";

const STEPS = ["Name and target", "End date"] as const;
const DONE = STEPS.length;

export interface NewCampaignWalkthroughProps {
  onAddFund: (fund: FundCreateInput) => Promise<string | null>;
  onClose: () => void;
}

// Walkthrough for starting a campaign. A campaign is a Restricted fund, so creating one
// creates that fund with its target and end date.
export default function NewCampaignWalkthrough({ onAddFund, onClose }: NewCampaignWalkthroughProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<NewCampaignForm>({ name: "", target: "", endDate: "", description: "" });
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<NewCampaignForm>) => setForm((current) => ({ ...current, ...patch }));

  // Only a confirmed create reaches Done; on failure the form keeps its entries for a retry.
  const create = async () => {
    setSaving(true);
    try {
      if (await onAddFund(buildCampaignFund(form))) setStep(DONE);
    } finally {
      setSaving(false);
    }
  };

  // Once the campaign exists, the rail is a record rather than navigation: a second create needs a new walkthrough.
  const finished = step === DONE;

  const rail = (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-ledger bg-white p-4 lg:flex">
      <div className={`${eyebrow} mx-2.5 mb-1`}>New campaign</div>
      {STEPS.map((label, index) => {
        const state = railState(index, step);
        return (
          <RailStep
            key={label}
            marker={String(index + 1)}
            label={label}
            state={state}
            disabled={finished || state === "todo"}
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
        <h2 className={screenTitle}>What is the campaign for?</h2>
        <label htmlFor="campaign-name" className={fieldLabel}>
          Name
        </label>
        <input
          id="campaign-name"
          type="text"
          placeholder="e.g. Roof appeal"
          value={form.name}
          onChange={(event) => update({ name: event.target.value })}
          className={txtInput}
        />

        <label htmlFor="campaign-target" className={fieldLabel}>
          Target (optional)
        </label>
        <div className={amtBox}>
          <span className={amtSymbol} aria-hidden="true">
            £
          </span>
          <input
            id="campaign-target"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.target}
            onChange={(event) => update({ target: event.target.value })}
            className={amtInput}
          />
        </div>
      </>
    );
    footer = (
      <StepFooter>
        <button
          type="button"
          disabled={!campaignNameReady(form) || !campaignTargetReady(form)}
          onClick={() => setStep(1)}
          className={`${btnPrimary} ${btnLg}`}
        >
          Next: end date →
        </button>
      </StepFooter>
    );
  } else if (step === 1) {
    body = (
      <>
        <h2 className={screenTitle}>When does it end?</h2>
        <label htmlFor="campaign-end" className={fieldLabel}>
          End date (optional)
        </label>
        <input
          id="campaign-end"
          type="date"
          value={form.endDate}
          onChange={(event) => update({ endDate: event.target.value })}
          className={txtInput}
        />

        <label htmlFor="campaign-description" className={fieldLabel}>
          Description (optional)
        </label>
        <textarea
          id="campaign-description"
          value={form.description}
          onChange={(event) => update({ description: event.target.value })}
          className={txtArea}
        />
      </>
    );
    footer = (
      <StepFooter label="Campaign" value={form.name.trim()}>
        <button type="button" disabled={saving} onClick={() => void create()} className={`${btnPrimary} ${btnLg}`}>
          Create campaign
        </button>
      </StepFooter>
    );
  } else {
    body = (
      <div className="pt-4 text-center">
        <div className="mx-auto mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-sage text-white ring-[10px] ring-sage-light">
          <Check size={36} aria-hidden="true" />
        </div>
        <h2 className={`${screenTitle} text-center`}>{form.name.trim()} is open</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-grey-mid">
          {form.target.trim() === "" ? "No target set" : `Target £${Number(form.target).toLocaleString("en-GB")}`}
        </p>
        <div className="mt-6 text-left">
          <span className={fieldLabel}>What's next</span>
          <button type="button" onClick={onClose} className={nextItem}>
            <span className={`${nextIcon} bg-grey-light text-ink`}>
              <Target size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] text-ink">Back to the campaign</b>
              <span className="text-xs text-grey-mid">Add pledges from the campaign page.</span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <WizardFrame
      ariaLabel="New campaign"
      title="New campaign"
      onClose={onClose}
      onBack={step > 0 && step < DONE ? () => setStep(step - 1) : undefined}
      progress={{ total: STEPS.length, current: step }}
      rail={rail}
      locked={saving}
      footer={footer}
    >
      {body}
    </WizardFrame>
  );
}
