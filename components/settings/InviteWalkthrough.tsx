import { useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, LayoutList, Mail, UserPlus } from "lucide-react";
import { roleOptions } from "../../lib/roleAccess";
import { DEFAULT_INVITE_ROLE, type UserRole } from "../../lib/permissions";
import { notify } from "../../lib/notifications";
import type { InvitationCreateInput, InvitationSendResult } from "../../types";
import { canOpenInviteStep, inviteRequest, isValidInviteEmail, type InviteStep } from "./inviteRules";
import RailStep from "../wizard/RailStep";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import {
  btnGhost,
  btnLg,
  btnPrimary,
  card,
  eyebrow,
  fieldLabel,
  nextIcon,
  nextItem,
  screenHelp,
  screenTitle,
  txtInput,
} from "../wizard/ui";
import { generateInviteMessage } from "./inviteMessage";

const STEPS: InviteStep[] = ["email", "role", "send"];
const LABELS: Record<InviteStep, string> = { email: "Email", role: "Role", send: "Send" };

interface InviteWalkthroughProps {
  churchName: string;
  senderName: string;
  onInviteUser: (invitation: InvitationCreateInput) => Promise<InvitationSendResult | null>;
  // Closes the walkthrough and returns to the people sheet.
  onClose: () => void;
}

type Sent = InvitationSendResult & { email: string; role: UserRole };

// Three steps (who, what they can do, send) then a done screen. The invitation is created by the same
// action the old modal used, and the copyable message is built by the same helper.
export default function InviteWalkthrough({ churchName, senderName, onInviteUser, onClose }: InviteWalkthroughProps) {
  const [step, setStep] = useState<InviteStep | "done">("email");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>(DEFAULT_INVITE_ROLE);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setStep("email");
    setEmail("");
    setRole(DEFAULT_INVITE_ROLE);
    setSent(null);
    setCopied(false);
  };

  // Every way out of the email step goes through canOpenInviteStep, so an invalid address never reaches the send step.
  const goTo = (target: InviteStep) => {
    if (canOpenInviteStep(target, email)) setStep(target);
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const request = inviteRequest(email, role);
    if (!request) {
      notify("Error", email.trim() ? "Please enter a valid email address." : "Please provide an email address.");
      setStep("email");
      return;
    }
    setSending(true);
    try {
      const result = await onInviteUser(request);
      if (result) {
        setSent({ ...result, email: request.email, role });
        setCopied(false);
        setStep("done");
      }
    } finally {
      setSending(false);
    }
  };

  const copyMessage = async () => {
    if (!sent) return;
    const message = generateInviteMessage({
      churchName,
      email: sent.email,
      role: sent.role,
      inviteUrl: sent.inviteUrl,
      origin: window.location.origin,
      senderName,
    });
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const railState = (target: InviteStep): "done" | "now" | "todo" => {
    if (step === "done") return "done";
    if (STEPS.indexOf(target) < STEPS.indexOf(step)) return "done";
    return target === step ? "now" : "todo";
  };

  let body: ReactNode = null;
  let footer: ReactNode = null;

  if (step === "email") {
    const emailInvalid = email.trim() !== "" && !isValidInviteEmail(email);
    body = (
      <>
        <h2 className={screenTitle}>Who are you inviting?</h2>
        <p className={screenHelp}>We'll email an invite link. It works even if they sign up with a different email.</p>
        <label htmlFor="invite-email" className={fieldLabel}>
          Email address
        </label>
        <input
          id="invite-email"
          type="email"
          required
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          aria-invalid={emailInvalid || undefined}
          aria-describedby={emailInvalid ? "invite-email-hint" : undefined}
          className={txtInput}
        />
        {emailInvalid && (
          <p id="invite-email-hint" className="mt-2 text-xs text-[#7a5a30]">
            Check the address. It needs one @ and a domain such as example.com.
          </p>
        )}
      </>
    );
    footer = (
      <StepFooter>
        <button
          type="button"
          disabled={!isValidInviteEmail(email)}
          onClick={() => goTo("role")}
          className={`${btnPrimary} ${btnLg}`}
        >
          Next: choose a role →
        </button>
      </StepFooter>
    );
  } else if (step === "role") {
    body = (
      <>
        <h2 className={screenTitle}>What can they do?</h2>
        <p className={screenHelp}>Pick the role that matches what they need. You can change it later in People.</p>
        <div className="grid gap-2" role="group" aria-label="Role">
          {roleOptions.map(({ role: option, lines }) => {
            const on = option === role;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                onClick={() => setRole(option)}
                className={`${nextItem} ${on ? "border-ink ring-1 ring-ink" : ""}`}
              >
                <span className={`${nextIcon} ${on ? "bg-ink text-white" : "bg-grey-light text-ink"}`}>
                  <UserPlus size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[14.5px] text-ink">{option}</b>
                  <span className="mt-0.5 block text-xs leading-relaxed text-grey-mid">{lines.join(" · ")}</span>
                </span>
              </button>
            );
          })}
        </div>
      </>
    );
    footer = (
      <StepFooter>
        <button type="button" onClick={() => goTo("send")} className={`${btnPrimary} ${btnLg}`}>
          Next: review and send →
        </button>
      </StepFooter>
    );
  } else if (step === "send") {
    body = (
      <form id="invite-send" onSubmit={(event) => void send(event)}>
        <h2 className={screenTitle}>Send the invitation</h2>
        <p className={screenHelp}>The invitation expires in 30 days. You'll also get a message to share yourself.</p>
        <div className={`${card} grid gap-3`}>
          <div>
            <p className="text-xs text-grey-mid">To</p>
            <p className="break-all font-semibold text-ink">{email.trim()}</p>
          </div>
          <div>
            <p className="text-xs text-grey-mid">Role</p>
            <p className="font-semibold text-ink">{role}</p>
          </div>
        </div>
      </form>
    );
    footer = (
      <StepFooter>
        <div className="space-y-1.5">
          <button type="submit" form="invite-send" disabled={sending} className={`${btnPrimary} ${btnLg}`}>
            <Mail size={16} aria-hidden="true" />
            {sending ? "Sending…" : "Send invitation"}
          </button>
          <button type="button" onClick={() => setStep("role")} disabled={sending} className={btnGhost}>
            Back
          </button>
        </div>
      </StepFooter>
    );
  } else if (sent) {
    body = (
      <div className="pt-4 text-center">
        <div
          className={`mx-auto mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-full ring-[10px] ${
            sent.emailSent ? "bg-sage text-white ring-sage-light" : "bg-amber text-white ring-amber-light"
          }`}
        >
          <Check size={36} aria-hidden="true" />
        </div>
        <h2 className={`${screenTitle} text-center`}>{sent.emailSent ? "Invitation emailed" : "Invitation created"}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-grey-mid">
          <span className="break-all font-mono text-ink">{sent.email}</span> is invited as {sent.role}.
        </p>
        {!sent.emailSent && (
          <p className="mx-auto mt-3 max-w-sm rounded-2xl border border-[#ecd8bd] bg-[#fcf7f0] px-3.5 py-3 text-left text-xs leading-relaxed text-[#7a5a30]">
            {sent.emailError ?? "The email couldn't be sent, so copy the message and share it yourself."}
          </p>
        )}

        <div className="mt-6 text-left">
          <span className={fieldLabel}>What's next</span>
          <button type="button" onClick={() => void copyMessage()} className={`${nextItem} mb-2`}>
            <span className={`${nextIcon} bg-grey-light text-ink`}>
              {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] text-ink">{copied ? "Copied to clipboard" : "Copy the invite message"}</b>
              <span className="text-xs text-grey-mid">For WhatsApp, text or any messenger.</span>
            </span>
          </button>
          <button type="button" onClick={reset} className={`${nextItem} mb-2`}>
            <span className={`${nextIcon} bg-grey-light text-ink`}>
              <UserPlus size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] text-ink">Invite someone else</b>
              <span className="text-xs text-grey-mid">Start again with a new email.</span>
            </span>
          </button>
          <button type="button" onClick={onClose} className={nextItem}>
            <span className={`${nextIcon} bg-grey-light text-ink`}>
              <LayoutList size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] text-ink">Back to people</b>
              <span className="text-xs text-grey-mid">See everyone with access and who's waiting.</span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <WizardFrame
      ariaLabel="Invite someone"
      title="Invite someone"
      onClose={onClose}
      onBack={step === "email" || step === "done" ? undefined : () => setStep(STEPS[STEPS.indexOf(step) - 1])}
      rail={
        <nav aria-label="Invite steps" className="hidden border-r border-ledger bg-[#f7f6f2] p-4 lg:block">
          <p className={eyebrow}>Steps</p>
          <div className="grid gap-0.5">
            {STEPS.map((item, index) => (
              <RailStep
                key={item}
                marker={String(index + 1)}
                label={LABELS[item]}
                state={railState(item)}
                disabled={sending || !canOpenInviteStep(item, email)}
                onClick={() => goTo(item)}
              />
            ))}
          </div>
        </nav>
      }
      footer={footer}
    >
      {body}
    </WizardFrame>
  );
}
