import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Mail, Phone, Target } from "lucide-react";
import type { Donor, Pledge } from "../../types";
import { notify } from "../../lib/notifications";
import RailStep from "../wizard/RailStep";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import {
  btnGhost,
  btnLg,
  btnOutline,
  btnPrimary,
  eyebrow,
  fieldLabel,
  nextIcon,
  nextItem,
  screenTitle,
  txtArea,
} from "../wizard/ui";
import { railState, whatsAppUrl } from "./logic";

const STEPS = ["Message", "Send"] as const;
const DONE = STEPS.length;

export interface ThankWalkthroughProps {
  pledge: Pledge;
  campaignName: string;
  donors: Donor[];
  draftMessage: () => Promise<string | null>;
  onClose: () => void;
}

// Walkthrough for thanking someone who completed a pledge: the message, a preview to send
// or copy, then done. The draft is written once when the walkthrough opens and can be redrafted.
export default function ThankWalkthrough({ pledge, campaignName, donors, draftMessage, onClose }: ThankWalkthroughProps) {
  const [step, setStep] = useState(0);
  const [text, setText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const drafted = useRef(false);

  const donor = donors.find((candidate) => candidate._id === pledge.donorId);

  const draft = async () => {
    setDrafting(true);
    try {
      const message = await draftMessage();
      setText(message || "Thank you for your generous support!");
    } catch {
      setText("Error generating message.");
    } finally {
      setDrafting(false);
    }
  };

  // Drafts once per opening, so a re-render of the page never overwrites what was typed.
  useEffect(() => {
    if (drafted.current) return;
    drafted.current = true;
    void draft();
  });

  const sendViaWhatsApp = () => {
    if (donor?.phone) {
      window.open(whatsAppUrl(donor.phone, text), "_blank", "noopener");
    } else {
      notify("Notice", "No phone number found for this donor.");
    }
  };

  const sendViaEmail = () => {
    window.location.href = `mailto:?subject=Thank You&body=${encodeURIComponent(text)}`;
  };

  const copy = () => {
    void navigator.clipboard.writeText(text);
    notify("Copied", "Message copied to clipboard.");
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
        <h2 className={screenTitle}>Thank {pledge.donorName}</h2>
        <p className="mt-1.5 text-[13.5px] text-grey-mid">They have fulfilled their pledge to {campaignName}.</p>
        <label htmlFor="thank-message" className={fieldLabel}>
          {drafting ? "Drafting with AI…" : "Message"}
        </label>
        <textarea
          id="thank-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className={txtArea}
        />
        <button type="button" disabled={drafting} onClick={() => void draft()} className={`${btnGhost} mt-2`}>
          Write another
        </button>
      </>
    );
    footer = (
      <StepFooter>
        <button type="button" disabled={drafting || text.trim() === ""} onClick={() => setStep(1)} className={`${btnPrimary} ${btnLg}`}>
          Next: send →
        </button>
      </StepFooter>
    );
  } else if (step === 1) {
    body = (
      <>
        <h2 className={screenTitle}>Send the thank-you</h2>
        <span className={fieldLabel}>Preview</span>
        <p className="whitespace-pre-line rounded-2xl border border-ledger bg-white p-4 text-[15px] leading-relaxed text-ink">{text}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={sendViaWhatsApp} className={btnOutline}>
            <Phone size={16} aria-hidden="true" />
            WhatsApp
          </button>
          <button type="button" onClick={sendViaEmail} className={btnOutline}>
            <Mail size={16} aria-hidden="true" />
            Email
          </button>
          <button type="button" onClick={copy} className={btnOutline}>
            <Copy size={16} aria-hidden="true" />
            Copy
          </button>
        </div>
      </>
    );
    footer = (
      <StepFooter>
        <button type="button" onClick={() => setStep(DONE)} className={`${btnPrimary} ${btnLg}`}>
          Finish
        </button>
      </StepFooter>
    );
  } else {
    body = (
      <div className="pt-4 text-center">
        <div className="mx-auto mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-sage text-white ring-[10px] ring-sage-light">
          <Check size={36} aria-hidden="true" />
        </div>
        <h2 className={`${screenTitle} text-center`}>Thank-you ready</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-grey-mid">
          {pledge.donorName} · {campaignName}
        </p>
        <div className="mt-6 text-left">
          <span className={fieldLabel}>What's next</span>
          <button type="button" onClick={onClose} className={nextItem}>
            <span className={`${nextIcon} bg-grey-light text-ink`}>
              <Target size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] text-ink">Back to the campaign</b>
              <span className="text-xs text-grey-mid">See the pledges list.</span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <WizardFrame
      ariaLabel="Thank donor"
      title="Thank-you"
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
