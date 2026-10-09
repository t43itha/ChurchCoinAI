import { useState } from "react";
import { Save } from "lucide-react";
import type { Pledge } from "../../types";
import WizardFrame from "../wizard/WizardFrame";
import StepFooter from "../wizard/StepFooter";
import { Segmented, amtBox, amtInput, amtSymbol, btnLg, btnPrimary, fieldLabel, txtInput } from "../wizard/ui";
import { PLEDGE_FREQUENCIES, pledgeAmountReady, pledgeFormReady, type PledgeForm } from "./logic";

const STATUSES = ["Active", "Completed", "Cancelled"] as const;

export interface PledgeSheetProps {
  campaignName: string;
  pledge: Pledge;
  onSave: (pledge: Pledge) => void;
  onClose: () => void;
}

// Single-step form for correcting a pledge. Saving keeps the fund and donor link as they were.
export default function PledgeSheet({ campaignName, pledge, onSave, onClose }: PledgeSheetProps) {
  const [form, setForm] = useState<PledgeForm>({
    donorName: pledge.donorName,
    donorId: pledge.donorId,
    amount: String(pledge.amount),
    frequency: pledge.frequency,
    startDate: pledge.startDate,
    endDate: pledge.endDate ?? "",
  });
  const [status, setStatus] = useState<Pledge["status"]>(pledge.status);

  const update = (patch: Partial<PledgeForm>) => setForm((current) => ({ ...current, ...patch }));

  const save = () =>
    onSave({
      ...pledge,
      donorName: form.donorName.trim(),
      amount: Number(form.amount),
      frequency: form.frequency,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      status,
    });

  return (
    <WizardFrame
      ariaLabel="Edit pledge"
      title={campaignName}
      onClose={onClose}
      footer={
        <StepFooter>
          <button type="button" disabled={!pledgeFormReady(form) || !pledgeAmountReady(form)} onClick={save} className={`${btnPrimary} ${btnLg}`}>
            <Save size={16} aria-hidden="true" />
            Save changes
          </button>
        </StepFooter>
      }
    >
      <h2 className="text-[23px] font-bold leading-tight tracking-tight text-ink">Edit pledge</h2>

      <label htmlFor="edit-pledge-donor" className={fieldLabel}>
        Donor name
      </label>
      <input
        id="edit-pledge-donor"
        type="text"
        value={form.donorName}
        onChange={(event) => update({ donorName: event.target.value })}
        className={txtInput}
      />

      <label htmlFor="edit-pledge-amount" className={fieldLabel}>
        Amount
      </label>
      <div className={amtBox}>
        <span className={amtSymbol} aria-hidden="true">
          £
        </span>
        <input
          id="edit-pledge-amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={form.amount}
          onChange={(event) => update({ amount: event.target.value })}
          className={amtInput}
        />
      </div>

      <span className={fieldLabel}>Frequency</span>
      <Segmented options={PLEDGE_FREQUENCIES} value={form.frequency} onChange={(frequency) => update({ frequency })} label="Frequency" />

      <label htmlFor="edit-pledge-start" className={fieldLabel}>
        Start date
      </label>
      <input
        id="edit-pledge-start"
        type="date"
        value={form.startDate}
        onChange={(event) => update({ startDate: event.target.value })}
        className={txtInput}
      />

      <label htmlFor="edit-pledge-end" className={fieldLabel}>
        End date (optional)
      </label>
      <input
        id="edit-pledge-end"
        type="date"
        value={form.endDate}
        onChange={(event) => update({ endDate: event.target.value })}
        className={txtInput}
      />

      <span className={fieldLabel}>Status</span>
      <Segmented options={STATUSES} value={status} onChange={setStatus} label="Status" />
    </WizardFrame>
  );
}
