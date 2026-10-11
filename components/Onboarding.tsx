import { useState, type FC, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { AlertTriangle, Building2, Check, Link as LinkIcon, Loader2, Mail, User } from "lucide-react";
import {
  clearStoredInviteToken,
  extractInviteToken,
  getStoredInviteToken,
  storeInviteToken,
} from "../lib/inviteToken";
import type { PlanTier } from "../lib/onboardingIntent";
import RailStep from "./wizard/RailStep";
import { ReceiptCard, ReceiptRow } from "./wizard/Receipt";
import StepFooter from "./wizard/StepFooter";
import WizardFrame from "./wizard/WizardFrame";
import {
  btnGhost,
  btnLg,
  btnOutline,
  btnPrimary,
  card,
  eyebrow,
  fieldLabel,
  screenHelp,
  screenTitle,
  txtInput,
} from "./wizard/ui";

interface OnboardingProps {
  clerkUser: {
    firstName?: string | null;
    lastName?: string | null;
    emailAddresses?: { emailAddress: string }[];
    fullName?: string | null;
  } | null;
  onComplete: (result?: "invitation" | "organization") => void;
  selectedPlan?: PlanTier;
}

type View = "invites" | "enter-link" | "create-org";
type CreateStep = "church" | "funds" | "bank" | "team" | "done";

const CREATE_STEPS: CreateStep[] = ["church", "funds", "bank", "team", "done"];
const CREATE_LABELS: Record<CreateStep, string> = {
  church: "Church",
  funds: "Funds",
  bank: "Bank",
  team: "Team",
  done: "Done",
};

const Onboarding: FC<OnboardingProps> = ({ clerkUser, onComplete, selectedPlan }) => {
  const [inviteToken, setInviteToken] = useState<string | null>(getStoredInviteToken());
  const [view, setView] = useState<View>("invites");
  const [createStep, setCreateStep] = useState<CreateStep>("church");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState("");

  const defaultName =
    clerkUser?.fullName ||
    `${clerkUser?.firstName || ""} ${clerkUser?.lastName || ""}`.trim() ||
    "";
  const signedInEmail = clerkUser?.emailAddresses?.[0]?.emailAddress || "";

  const [userName, setUserName] = useState(defaultName);
  const [orgName, setOrgName] = useState("");
  const [orgCharityNum, setOrgCharityNum] = useState("");

  const createOrganization = useMutation(api.mutations.organizations.create);
  const acceptInvitation = useMutation(api.mutations.users.acceptInvitation);

  // Invitation lookups: by link token, and by the signed-in email
  const tokenInvite = useQuery(
    api.queries.invitations.getByToken,
    inviteToken ? { token: inviteToken } : "skip"
  );
  const emailInvites = useQuery(
    api.queries.invitations.pendingForCurrentUser,
    {}
  );

  const isLoadingInvites =
    (inviteToken !== null && tokenInvite === undefined) ||
    emailInvites === undefined;

  const handleAccept = async (params: {
    token?: string;
    invitationId?: string;
  }) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await acceptInvitation({
        token: params.token,
        invitationId: params.invitationId as Id<"invitations"> | undefined,
      });
      clearStoredInviteToken();
      onComplete("invitation");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to accept invitation"
      );
      setIsSubmitting(false);
    }
  };

  const handleUseLink = () => {
    const token = extractInviteToken(linkInput);
    if (!token) {
      setError(
        "That doesn't look like a valid invite link. Paste the full link from your invitation email or message."
      );
      return;
    }
    setError(null);
    storeInviteToken(token);
    setInviteToken(token);
    setLinkInput("");
    setView("invites");
  };

  // Only the organisation is created here. The General Fund and standard categories come with it;
  // bank and team are set up from Settings afterwards.
  const handleCreateOrg = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await createOrganization({
        name: orgName,
        charityNumber: orgCharityNum || undefined,
        reportingPeriod: "tax_year",
        userName: userName,
        selectedPlan,
      });
      clearStoredInviteToken();
      onComplete("organization");
    } catch (err) {
      console.error("Onboarding error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create organization"
      );
      setIsSubmitting(false);
    }
  };

  const dismissTokenInvite = () => {
    clearStoredInviteToken();
    setInviteToken(null);
  };

  const backToStart = () => {
    setError(null);
    setView("invites");
  };

  if (isLoadingInvites) {
    return (
      <Page>
        <div className="flex items-center justify-center gap-3 p-8 text-grey-mid">
          <Loader2 size={20} className="animate-spin" aria-hidden="true" />
          <span className="text-sm">Checking for invitations…</span>
        </div>
      </Page>
    );
  }

  const errorBox = error ? (
    <p role="alert" className="rounded-2xl bg-error-light px-3.5 py-2.5 text-sm text-error">
      {error}
    </p>
  ) : null;

  // Join-by-invite stays one sheet, whichever invitation path brought the person here.
  const joinSheet = (
    title: string,
    body: ReactNode,
    footer: ReactNode,
    onClose: () => void = backToStart
  ) => (
    <Page>
      <WizardFrame ariaLabel={title} title={title} onClose={onClose} footer={footer}>
        {body}
      </WizardFrame>
    </Page>
  );

  // ----- Invite link points at a valid invitation: explicit acceptance -----
  if (view === "invites" && inviteToken && tokenInvite && tokenInvite.status === "valid") {
    return joinSheet(
      "Join your church",
      <>
        <h2 className={screenTitle}>You're invited</h2>
        <p className={screenHelp}>Check the invitation before you join.</p>
        <div className={`${card} grid gap-1.5`}>
          <p className="text-[15px] font-bold text-ink">{tokenInvite.organizationName}</p>
          <p className="text-sm text-grey-mid">
            Joining as <span className="font-semibold text-grey-dark">{tokenInvite.role}</span>
          </p>
          {signedInEmail && (
            <p className="text-sm text-grey-mid">
              Signed in as <span className="break-all font-mono text-xs">{signedInEmail}</span>
            </p>
          )}
        </div>
        <div className="mt-4">{errorBox}</div>
      </>,
      <StepFooter>
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => handleAccept({ token: inviteToken })}
            disabled={isSubmitting}
            className={`${btnPrimary} ${btnLg}`}
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
            {isSubmitting ? "Joining…" : "Accept and join"}
          </button>
          <button type="button" onClick={dismissTokenInvite} disabled={isSubmitting} className={btnGhost}>
            This isn't for me
          </button>
        </div>
      </StepFooter>
    );
  }

  // ----- Invite link present but expired or already used -----
  if (view === "invites" && inviteToken && (!tokenInvite || tokenInvite.status !== "valid")) {
    const message = !tokenInvite
      ? "This invite link is invalid or has been revoked."
      : tokenInvite.status === "accepted"
        ? "This invitation has already been used."
        : "This invitation has expired.";
    return joinSheet(
      "Invitation unavailable",
      <>
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-light text-amber">
          <AlertTriangle size={22} aria-hidden="true" />
        </span>
        <h2 className={screenTitle}>Invitation unavailable</h2>
        <p className={screenHelp}>
          {message} Ask your church administrator to send you a new invitation.
        </p>
      </>,
      <StepFooter>
        <button type="button" onClick={dismissTokenInvite} className={`${btnPrimary} ${btnLg}`}>
          Continue
        </button>
      </StepFooter>,
      dismissTokenInvite
    );
  }

  // ----- Invitations matched to the signed-in email -----
  if (view === "invites" && emailInvites && emailInvites.length > 0) {
    return joinSheet(
      "Join your church",
      <>
        <h2 className={screenTitle}>You're invited</h2>
        <p className={screenHelp}>
          {emailInvites.length === 1
            ? "An invitation is waiting for your email address."
            : "Several invitations are waiting for your email address. Choose one to join."}
        </p>
        {errorBox}
        <ul className="mt-4 grid gap-2">
          {emailInvites.map((invite) => (
            <li key={invite.invitationId} className={`${card} flex items-center justify-between gap-3`}>
              <span className="min-w-0">
                <b className="block truncate text-[14.5px] text-ink">{invite.organizationName}</b>
                <span className="text-xs text-grey-mid">as {invite.role}</span>
              </span>
              <button
                type="button"
                onClick={() => handleAccept({ invitationId: invite.invitationId })}
                disabled={isSubmitting}
                className={`${btnPrimary} !w-auto h-11 shrink-0 px-5 text-sm`}
              >
                {isSubmitting ? "Joining…" : "Join"}
              </button>
            </li>
          ))}
        </ul>
      </>,
      <StepFooter>
        <button
          type="button"
          onClick={() => setView("create-org")}
          disabled={isSubmitting}
          className={btnGhost}
        >
          None of these? Create a new organisation instead
        </button>
      </StepFooter>
    );
  }

  // ----- Paste an invite link manually -----
  if (view === "enter-link") {
    return joinSheet(
      "Join your church",
      <>
        <h2 className={screenTitle}>Join your church</h2>
        <p className={screenHelp}>Paste the invite link your administrator shared with you.</p>
        {errorBox}
        <label htmlFor="invite-link" className={fieldLabel}>
          Invite link
        </label>
        <div className="relative">
          <LinkIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-grey-mid" aria-hidden="true" />
          <input
            id="invite-link"
            type="text"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            className={`${txtInput} pl-10 font-mono text-xs`}
            placeholder="https://app.churchcoin.ai/?invite=…"
            autoFocus
          />
        </div>
      </>,
      <StepFooter>
        <div className="space-y-1.5">
          <button type="button" onClick={handleUseLink} disabled={!linkInput.trim()} className={`${btnPrimary} ${btnLg}`}>
            Find invitation
          </button>
          <button type="button" onClick={backToStart} className={btnGhost}>
            Back
          </button>
        </div>
      </StepFooter>
    );
  }

  // ----- Create a new organisation: church → funds → bank → team → done -----
  if (view === "create-org") {
    const stepIndex = CREATE_STEPS.indexOf(createStep);
    const ready = orgName.trim() !== "" && userName.trim() !== "";
    const next = (step: CreateStep) => {
      setError(null);
      setCreateStep(step);
    };

    let body: ReactNode;
    let footer: ReactNode;

    if (createStep === "church") {
      body = (
        <>
          <h2 className={screenTitle}>Set up your church</h2>
          <p className={screenHelp}>
            You'll be the administrator
            {signedInEmail && (
              <>
                {" "}for <span className="break-all font-mono text-xs">{signedInEmail}</span>
              </>
            )}
            .
          </p>
          <label htmlFor="org-name" className={fieldLabel}>
            Church name
          </label>
          <div className="relative">
            <Building2 size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-grey-mid" aria-hidden="true" />
            <input
              id="org-name"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className={`${txtInput} pl-10`}
              placeholder="St Mary's Church"
              autoFocus
            />
          </div>
          <label htmlFor="org-charity" className={fieldLabel}>
            Charity number <span className="font-normal normal-case tracking-normal">(optional)</span>
          </label>
          <input
            id="org-charity"
            type="text"
            value={orgCharityNum}
            onChange={(e) => setOrgCharityNum(e.target.value)}
            className={`${txtInput} font-mono`}
            placeholder="12345678"
          />
          <label htmlFor="org-user" className={fieldLabel}>
            Your full name
          </label>
          <div className="relative">
            <User size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-grey-mid" aria-hidden="true" />
            <input
              id="org-user"
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className={`${txtInput} pl-10`}
              placeholder="Sarah Jones"
            />
          </div>
        </>
      );
      footer = (
        <StepFooter>
          <button type="button" disabled={!ready} onClick={() => next("funds")} className={`${btnPrimary} ${btnLg}`}>
            Next: funds →
          </button>
        </StepFooter>
      );
    } else if (createStep === "funds") {
      body = (
        <>
          <h2 className={screenTitle}>Your funds</h2>
          <p className={screenHelp}>
            A General Fund is created for you. Restricted and designated funds, and campaigns, can be added later from
            Settings.
          </p>
          <div className={`${card} flex items-center justify-between gap-3`}>
            <span>
              <b className="block text-[14.5px] text-ink">General Fund</b>
              <span className="text-xs text-grey-mid">Unrestricted · for everyday giving</span>
            </span>
            <span className="text-xs font-bold text-sage">Created</span>
          </div>
        </>
      );
      footer = (
        <StepFooter>
          <button type="button" onClick={() => next("bank")} className={`${btnPrimary} ${btnLg}`}>
            Next: bank →
          </button>
        </StepFooter>
      );
    } else if (createStep === "bank") {
      body = (
        <>
          <h2 className={screenTitle}>Connect your bank</h2>
          <p className={screenHelp}>
            Syncing a bank account saves typing. You can connect it in Settings once you're in, so there's nothing to do
            here.
          </p>
        </>
      );
      footer = (
        <StepFooter>
          <button type="button" onClick={() => next("team")} className={`${btnPrimary} ${btnLg}`}>
            Next: team →
          </button>
        </StepFooter>
      );
    } else if (createStep === "team") {
      body = (
        <>
          <h2 className={screenTitle}>Invite your team</h2>
          <p className={screenHelp}>
            Add people from Settings, under People and invitations. Each invitation has a link and a role.
          </p>
        </>
      );
      footer = (
        <StepFooter>
          <button type="button" onClick={() => next("done")} className={`${btnPrimary} ${btnLg}`}>
            Next: review →
          </button>
        </StepFooter>
      );
    } else {
      body = (
        <>
          <h2 className={screenTitle}>Ready to open your ledger</h2>
          <p className={screenHelp}>Here's what will be set up. Nothing is saved until you create the ledger.</p>
          <ReceiptCard>
            <ReceiptRow label="Church" value={orgName.trim()} />
            <ReceiptRow label="Charity number" value={orgCharityNum.trim() || "None"} muted={!orgCharityNum.trim()} />
            <ReceiptRow label="Administrator" value={userName.trim()} />
            <ReceiptRow label="General Fund" value="Created" sub />
            <ReceiptRow label="Standard UK charity categories" value="Created" sub />
            <ReceiptRow label="Bank" value="Later, in Settings" dim />
            <ReceiptRow label="Team" value="Later, in Settings" dim />
          </ReceiptCard>
          <div className="mt-4">{errorBox}</div>
        </>
      );
      footer = (
        <StepFooter>
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => void handleCreateOrg()}
              disabled={!ready || isSubmitting}
              className={`${btnPrimary} ${btnLg}`}
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              {isSubmitting ? "Creating your ledger…" : "Create ledger"}
            </button>
          </div>
        </StepFooter>
      );
    }

    return (
      <Page>
        <WizardFrame
          ariaLabel="Set up your church"
          title="Set up your church"
          onClose={backToStart}
          onBack={stepIndex > 0 && !isSubmitting ? () => next(CREATE_STEPS[stepIndex - 1]) : undefined}
          progress={{ total: CREATE_STEPS.length, current: stepIndex }}
          rail={
            <nav aria-label="Setup steps" className="hidden border-r border-ledger bg-[#f7f6f2] p-4 lg:block">
              <p className={eyebrow}>Setup</p>
              <div className="mt-2 grid gap-0.5">
                {CREATE_STEPS.map((step, index) => (
                  <RailStep
                    key={step}
                    marker={String(index + 1)}
                    label={CREATE_LABELS[step]}
                    state={index < stepIndex ? "done" : index === stepIndex ? "now" : "todo"}
                    disabled={isSubmitting || index > stepIndex}
                    onClick={() => next(step)}
                  />
                ))}
              </div>
            </nav>
          }
          footer={footer}
        >
          {body}
        </WizardFrame>
      </Page>
    );
  }

  // ----- No invitation found: guard against accidental duplicate orgs -----
  return joinSheet(
    "Welcome to ChurchCoin",
    <>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-light text-sage">
        <Check size={22} aria-hidden="true" />
      </span>
      <h2 className={screenTitle}>Welcome to ChurchCoin</h2>
      <p className={screenHelp}>How would you like to get started?</p>
      <div className="flex gap-2.5 rounded-2xl border border-amber/40 bg-amber-light/30 p-3.5">
        <Mail size={16} className="mt-0.5 shrink-0 text-amber" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-grey-dark">
          <span className="font-bold">Expecting to join a church?</span> We couldn't find an invitation
          {signedInEmail && (
            <>
              {" "}for <span className="break-all font-mono">{signedInEmail}</span>
            </>
          )}
          . Use the invite link you were sent, or ask your administrator to invite this email address.
        </p>
      </div>
      <div className="mt-4">{errorBox}</div>
    </>,
    <StepFooter>
      <div className="space-y-2">
        <button type="button" onClick={() => setView("enter-link")} className={`${btnOutline} ${btnLg}`}>
          <LinkIcon size={16} aria-hidden="true" />
          I have an invite link
        </button>
        <button type="button" onClick={() => setView("create-org")} className={`${btnPrimary} ${btnLg}`}>
          <Building2 size={16} aria-hidden="true" />
          Create a new organisation
        </button>
      </div>
    </StepFooter>,
    () => undefined
  );
};

// The page behind the sheet. The sheet covers it on phones and sits centred on desktop.
function Page({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-paper">{children}</div>;
}

export default Onboarding;
