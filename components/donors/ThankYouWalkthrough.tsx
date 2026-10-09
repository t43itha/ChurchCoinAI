import { useState } from "react";
import type { Donor, Fund, Pledge } from "../../types";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnLg, btnMd, btnOutline, btnPrimary, btnSage, fieldLabel, nextItem, screenHelp, screenTitle, txtArea, txtInput } from "../wizard/ui";
import { whatsappNumber } from "./donorDirectory";
import {
  MESSAGE_TEMPLATES,
  TEMPLATE_TYPES,
  defaultThankYouSelection,
  noPledgeNote,
  pledgesForTemplate,
  thankYouMessage,
  type ThankYouSelection,
  type TemplateType,
} from "./thankYou";

export interface ThankYouWalkthroughProps {
  donor: Donor;
  donorPledges: Pledge[];
  funds: Fund[];
  // Pounds given this year, for the End of Year message.
  yearTotal: number;
  churchName: string;
  onClose: () => void;
}

// Pick a message, then check the wording and send or copy it. Each step's wording comes from thankYou.ts.
export default function ThankYouWalkthrough({
  donor,
  donorPledges,
  funds,
  yearTotal,
  churchName,
  onClose,
}: ThankYouWalkthroughProps) {
  const context = { donorName: donor.name, churchName, yearTotal, donorPledges, funds };
  const [selection, setSelection] = useState<ThankYouSelection | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const apply = (next: ThankYouSelection) => {
    setSelection(next);
    setMessage(thankYouMessage(next, context));
    setCopied(false);
  };

  const copyMessage = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const sendOnWhatsApp = () => {
    if (!donor.phone || !message) return;
    window.open(`https://wa.me/${whatsappNumber(donor.phone)}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  };

  const template = selection ? MESSAGE_TEMPLATES[selection.type] : null;
  const pledgeOptions = selection && template?.requiresPledge ? pledgesForTemplate(selection.type, donorPledges) : [];

  if (!selection || !template) {
    return (
      <WizardFrame ariaLabel="Thank-you message" title="Thank-you message" onClose={onClose} progress={{ total: 2, current: 0 }}>
        <h2 className={screenTitle}>Which message?</h2>
        <p className={screenHelp}>Pick one, then check the wording before you send it.</p>
        <div className="grid gap-2">
          {TEMPLATE_TYPES.map((type: TemplateType) => (
            <button key={type} type="button" onClick={() => apply(defaultThankYouSelection(type, donorPledges, funds))} className={nextItem}>
              <span className="min-w-0 flex-1">
                <b className="block text-[14.5px] text-ink">{MESSAGE_TEMPLATES[type].name}</b>
                <span className="block text-xs text-grey-mid">{MESSAGE_TEMPLATES[type].description}</span>
              </span>
            </button>
          ))}
        </div>
      </WizardFrame>
    );
  }

  return (
    <WizardFrame
      ariaLabel="Thank-you message"
      title="Thank-you message"
      onClose={onClose}
      onBack={() => setSelection(null)}
      progress={{ total: 2, current: 1 }}
      footer={
        <StepFooter>
          {donor.phone ? (
            <div className="grid gap-2">
              <button type="button" onClick={sendOnWhatsApp} disabled={!message} className={`${btnSage} ${btnLg}`}>
                Send on WhatsApp
              </button>
              <button type="button" onClick={() => void copyMessage()} disabled={!message} className={`${btnOutline} ${btnMd}`}>
                {copied ? "Copied" : "Copy message"}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => void copyMessage()} disabled={!message} className={`${btnPrimary} ${btnLg}`}>
              {copied ? "Copied" : "Copy message"}
            </button>
          )}
        </StepFooter>
      }
    >
      <h2 className={screenTitle}>{template.name}</h2>
      <p className={screenHelp}>{template.description}</p>

      {template.requiresPledge ? (
        <label className="block">
          <span className={fieldLabel}>Pledge</span>
          <select
            className={txtInput}
            value={selection.pledgeId ?? ""}
            onChange={(event) => apply({ ...selection, pledgeId: event.target.value || null })}
            disabled={pledgeOptions.length === 0}
          >
            {pledgeOptions.length === 0 && <option value="">{noPledgeNote(selection.type)}</option>}
            {pledgeOptions.map((pledge) => (
              <option key={pledge._id} value={pledge._id}>
                {funds.find((fund) => fund._id === pledge.fundId)?.name} - £{pledge.amount} ({pledge.frequency}) - {pledge.status}
              </option>
            ))}
          </select>
        </label>
      ) : (
        funds.length > 0 && (
          <label className="block">
            <span className={fieldLabel}>Fund</span>
            <select
              className={txtInput}
              value={selection.fundId ?? ""}
              onChange={(event) => apply({ ...selection, fundId: event.target.value || null })}
            >
              {funds.map((fund) => (
                <option key={fund._id} value={fund._id}>
                  {fund.name}
                </option>
              ))}
            </select>
          </label>
        )
      )}

      <label className="block">
        <span className={fieldLabel}>Message</span>
        <textarea
          className={`${txtArea} min-h-[220px] leading-relaxed`}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            setCopied(false);
          }}
          placeholder="Select a message to generate the text."
        />
      </label>

      {message && !donor.phone && (
        <p className="mt-2 text-xs text-amber">No phone number on file for this donor.</p>
      )}
    </WizardFrame>
  );
}
