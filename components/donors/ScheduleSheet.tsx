import { useState } from "react";
import { formatLocalDateInputValue } from "../../lib/dateUtils";
import type { Fund, Pledge, PledgeCreateInput } from "../../types";
import DateInput from "../cashEntry/DateInput";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import {
  Segmented,
  amtBox,
  amtInput,
  amtSymbol,
  btnLg,
  btnPrimary,
  fieldLabel,
  screenTitle,
  txtInput,
} from "../wizard/ui";

type Frequency = Pledge["frequency"];

const FREQUENCIES: readonly Frequency[] = ["One-off", "Weekly", "Monthly", "Annual"];
const FORM_ID = "schedule-form";

export interface ScheduleDraft {
  donorId: string;
  donorName: string;
  fundId: string;
  // Raw input text, so it is parsed here before anything is sent.
  amount: string;
  frequency: Frequency;
  startDate: string;
  endDate: string;
}

// Fund and a positive amount are required, as before. A zero or blank amount never reaches onSubmit.
export function submitSchedule(draft: ScheduleDraft, onSubmit: (pledge: PledgeCreateInput) => void) {
  const amount = Number(draft.amount);
  if (!draft.fundId || !Number.isFinite(amount) || amount <= 0) return;
  onSubmit({
    donorId: draft.donorId,
    donorName: draft.donorName,
    amount,
    fundId: draft.fundId,
    frequency: draft.frequency,
    startDate: draft.startDate || formatLocalDateInputValue(new Date()),
    endDate: draft.endDate || undefined,
    status: "Active",
  });
}

export interface ScheduleSheetProps {
  donorId: string;
  donorName: string;
  funds: Fund[];
  onSubmit: (pledge: PledgeCreateInput) => void;
  onClose: () => void;
}

// A giving schedule for one donor.
export default function ScheduleSheet({ donorId, donorName, funds, onSubmit, onClose }: ScheduleSheetProps) {
  const [fundId, setFundId] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("Monthly");
  const [startDate, setStartDate] = useState(formatLocalDateInputValue(new Date()));
  const [endDate, setEndDate] = useState("");

  return (
    <WizardFrame
      ariaLabel="New giving schedule"
      title="New schedule"
      onClose={onClose}
      footer={
        <StepFooter>
          <button type="submit" form={FORM_ID} className={`${btnPrimary} ${btnLg}`}>
            Create schedule
          </button>
        </StepFooter>
      }
    >
      <h2 className={screenTitle}>Schedule for {donorName}</h2>

      <form
        id={FORM_ID}
        className="mt-2"
        onSubmit={(event) => {
          event.preventDefault();
          submitSchedule({ donorId, donorName, fundId, amount, frequency, startDate, endDate }, onSubmit);
        }}
      >
        <label className="block">
          <span className={fieldLabel}>Target fund</span>
          <select className={txtInput} value={fundId} onChange={(event) => setFundId(event.target.value)} required>
            <option value="">Select fund…</option>
            {funds.map((fund) => (
              <option key={fund._id} value={fund._id}>
                {fund.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={fieldLabel}>Amount</span>
          <div className={amtBox}>
            <span className={amtSymbol} aria-hidden="true">
              £
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              className={amtInput}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              required
            />
          </div>
        </label>

        <span className={fieldLabel}>Frequency</span>
        <Segmented label="Frequency" options={FREQUENCIES} value={frequency} onChange={setFrequency} />

        <span className={fieldLabel}>Start date</span>
        <DateInput value={startDate} onChange={(event) => setStartDate(event.target.value)} required />

        <span className={fieldLabel}>End date (optional)</span>
        <DateInput value={endDate} onChange={(event) => setEndDate(event.target.value)} />
      </form>
    </WizardFrame>
  );
}
