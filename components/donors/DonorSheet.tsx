import { useState } from "react";
import type { Donor } from "../../types";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { Segmented, btnLg, btnPrimary, fieldLabel, screenTitle, tickBox, tickRow, txtArea, txtInput } from "../wizard/ui";

export interface DonorSheetProps {
  mode: "add" | "edit";
  // Starting values. The add sheet opens with the defaults the caller sets.
  initial: Partial<Donor>;
  giftAidEnabled: boolean;
  onSubmit: (values: Partial<Donor>) => void;
  onClose: () => void;
}

const FORM_ID = "donor-form";
const COMMUNICATION = ["Email", "Post", "Phone"] as const;
const DONOR_TYPES = ["Individual", "Organization"] as const;

// Add and edit share one form. Name is the only required field, as before.
export default function DonorSheet({ mode, initial, giftAidEnabled, onSubmit, onClose }: DonorSheetProps) {
  const [values, setValues] = useState<Partial<Donor>>(initial);
  const patch = (changes: Partial<Donor>) => setValues((current) => ({ ...current, ...changes }));
  const adding = mode === "add";

  return (
    <WizardFrame
      ariaLabel={adding ? "New donor profile" : "Edit donor profile"}
      title={adding ? "New donor" : "Edit donor"}
      onClose={onClose}
      footer={
        <StepFooter>
          <button type="submit" form={FORM_ID} className={`${btnPrimary} ${btnLg}`}>
            {adding ? "Create profile" : "Save changes"}
          </button>
        </StepFooter>
      }
    >
      <h2 className={screenTitle}>{adding ? "Who are you adding?" : values.name || "Donor details"}</h2>

      <form
        id={FORM_ID}
        className="mt-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (values.name) onSubmit(values);
        }}
      >
        <label className="block">
          <span className={fieldLabel}>Full name</span>
          <input
            type="text"
            className={txtInput}
            value={values.name || ""}
            onChange={(event) => patch({ name: event.target.value })}
            placeholder="e.g. John Doe"
            required
          />
        </label>

        <span className={fieldLabel}>Donor type</span>
        <Segmented
          label="Donor type"
          options={DONOR_TYPES}
          value={values.type || "Individual"}
          onChange={(type) => patch({ type })}
        />

        <label className="block">
          <span className={fieldLabel}>Email</span>
          <input
            type="email"
            className={txtInput}
            value={values.email || ""}
            onChange={(event) => patch({ email: event.target.value })}
          />
        </label>

        <label className="block">
          <span className={fieldLabel}>Phone</span>
          <input
            type="tel"
            className={txtInput}
            value={values.phone || ""}
            onChange={(event) => patch({ phone: event.target.value })}
          />
        </label>

        <label className="block">
          <span className={fieldLabel}>Address</span>
          <textarea
            className={txtArea}
            value={values.address || ""}
            onChange={(event) => patch({ address: event.target.value })}
            placeholder="Street, City..."
          />
        </label>

        <label className="block">
          <span className={fieldLabel}>Postcode</span>
          <input
            type="text"
            className={`${txtInput} font-mono`}
            value={values.postcode || ""}
            onChange={(event) => patch({ postcode: event.target.value })}
          />
        </label>

        <span className={fieldLabel}>Prefers to hear by</span>
        <Segmented
          label="Prefers to hear by"
          options={COMMUNICATION}
          value={values.communicationPreference || "Email"}
          onChange={(communicationPreference) => patch({ communicationPreference })}
        />

        {giftAidEnabled && (
          <label className={`${tickRow} mt-5 ${values.isGiftAidActive ? "border-sage" : "border-ledger"}`}>
            <input
              type="checkbox"
              className="sr-only"
              checked={values.isGiftAidActive || false}
              onChange={(event) => patch({ isGiftAidActive: event.target.checked })}
            />
            <span
              aria-hidden="true"
              className={`${tickBox} ${values.isGiftAidActive ? "border-sage bg-sage text-white" : "border-[#d6d3cd]"}`}
            >
              {values.isGiftAidActive ? "✓" : ""}
            </span>
            Gift Aid declaration on file
          </label>
        )}

        <label className="block">
          <span className={fieldLabel}>Private notes</span>
          <textarea
            className={txtArea}
            value={values.notes || ""}
            onChange={(event) => patch({ notes: event.target.value })}
          />
        </label>
      </form>
    </WizardFrame>
  );
}
