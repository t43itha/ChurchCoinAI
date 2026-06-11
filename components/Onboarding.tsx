import React, { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import {
  ArrowRight,
  Building2,
  User,
  Sparkles,
  CheckCircle2,
  Loader2,
  Mail,
  LinkIcon,
  AlertTriangle,
} from "lucide-react";
import {
  clearStoredInviteToken,
  extractInviteToken,
  getStoredInviteToken,
  storeInviteToken,
} from "../lib/inviteToken";

interface OnboardingProps {
  clerkUser: {
    firstName?: string | null;
    lastName?: string | null;
    emailAddresses?: { emailAddress: string }[];
    fullName?: string | null;
  } | null;
  onComplete: () => void;
}

type View = "invites" | "enter-link" | "create-org";

const inputClass =
  "w-full px-4 py-3 bg-grey-light border border-ledger rounded-lg text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-all placeholder-grey-mid";

const Onboarding: React.FC<OnboardingProps> = ({ clerkUser, onComplete }) => {
  const [inviteToken, setInviteToken] = useState<string | null>(
    getStoredInviteToken()
  );
  const [view, setView] = useState<View>("invites");
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
      onComplete();
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

  const handleCreateOrg = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await createOrganization({
        name: orgName,
        charityNumber: orgCharityNum || undefined,
        reportingPeriod: "tax_year",
        userName: userName,
      });
      clearStoredInviteToken();
      onComplete();
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

  if (isLoadingInvites) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-3 text-grey-mid p-8">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">Checking for invitations...</span>
        </div>
      </Shell>
    );
  }

  const errorBox = error && (
    <div className="p-3 bg-error-light border border-error rounded-lg text-sm text-error">
      {error}
    </div>
  );

  // ----- Invite link points at a valid invitation: explicit acceptance -----
  if (view === "invites" && inviteToken && tokenInvite && tokenInvite.status === "valid") {
    return (
      <Shell>
        <div className="p-8 space-y-6 animate-enter">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold font-mono text-ink">
              You're invited
            </h2>
            <p className="text-grey-mid text-sm">
              Review the invitation before joining.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-ledger bg-grey-light space-y-1">
            <div className="text-sm font-bold text-ink">
              {tokenInvite.organizationName}
            </div>
            <div className="text-xs text-grey-mid">
              Joining as <span className="font-semibold text-grey-dark">{tokenInvite.role}</span>
            </div>
            {signedInEmail && (
              <div className="text-xs text-grey-mid">
                Signed in as <span className="font-mono">{signedInEmail}</span>
              </div>
            )}
          </div>

          {errorBox}

          <button
            onClick={() => handleAccept({ token: inviteToken })}
            disabled={isSubmitting}
            className="w-full py-3 bg-ink text-white rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-charcoal disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Joining...
              </>
            ) : (
              <>
                Accept &amp; Join <ArrowRight size={16} />
              </>
            )}
          </button>

          <button
            onClick={dismissTokenInvite}
            disabled={isSubmitting}
            className="w-full text-xs text-grey-mid hover:text-grey-dark transition-colors"
          >
            This isn't for me
          </button>
        </div>
      </Shell>
    );
  }

  // ----- Invite link present but expired or already used -----
  if (view === "invites" && inviteToken && (!tokenInvite || tokenInvite.status !== "valid")) {
    const message = !tokenInvite
      ? "This invite link is invalid or has been revoked."
      : tokenInvite.status === "accepted"
        ? "This invitation has already been used."
        : "This invitation has expired.";
    return (
      <Shell>
        <div className="p-8 space-y-6 animate-enter text-center">
          <AlertTriangle size={32} className="text-amber mx-auto" />
          <div className="space-y-2">
            <h2 className="text-xl font-bold font-mono text-ink">
              Invitation unavailable
            </h2>
            <p className="text-grey-mid text-sm">
              {message} Ask your church administrator to send you a new
              invitation.
            </p>
          </div>
          <button
            onClick={dismissTokenInvite}
            className="w-full py-3 bg-ink text-white rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-charcoal transition-all"
          >
            Continue
          </button>
        </div>
      </Shell>
    );
  }

  // ----- Invitations matched to the signed-in email -----
  if (view === "invites" && emailInvites && emailInvites.length > 0) {
    return (
      <Shell>
        <div className="p-8 space-y-6 animate-enter">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold font-mono text-ink">
              You're invited
            </h2>
            <p className="text-grey-mid text-sm">
              {emailInvites.length === 1
                ? "An invitation is waiting for your email address."
                : "Multiple invitations are waiting for your email address. Choose one to join."}
            </p>
          </div>

          {errorBox}

          <div className="space-y-3">
            {emailInvites.map((invite) => (
              <div
                key={invite.invitationId}
                className="p-4 rounded-xl border border-ledger bg-grey-light flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink truncate">
                    {invite.organizationName}
                  </div>
                  <div className="text-xs text-grey-mid">as {invite.role}</div>
                </div>
                <button
                  onClick={() =>
                    handleAccept({ invitationId: invite.invitationId })
                  }
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-ink text-white rounded-lg font-bold text-xs uppercase tracking-wide hover:bg-charcoal disabled:opacity-50 transition-all shrink-0"
                >
                  {isSubmitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    "Join"
                  )}
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => setView("create-org")}
            disabled={isSubmitting}
            className="w-full text-xs text-grey-mid hover:text-grey-dark transition-colors"
          >
            None of these? Create a new organization instead
          </button>
        </div>
      </Shell>
    );
  }

  // ----- Paste an invite link manually -----
  if (view === "enter-link") {
    return (
      <Shell>
        <div className="p-8 space-y-6 animate-enter">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold font-mono text-ink">
              Join your church
            </h2>
            <p className="text-grey-mid text-sm">
              Paste the invite link your administrator shared with you.
            </p>
          </div>

          {errorBox}

          <div>
            <label className="block text-xs font-bold text-grey-mid uppercase tracking-wide mb-1.5">
              Invite Link
            </label>
            <div className="relative">
              <LinkIcon
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid"
              />
              <input
                type="text"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                className={`${inputClass} pl-10 font-mono text-xs`}
                placeholder="https://app.churchcoin.ai/?invite=..."
                autoFocus
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setError(null);
                setView("invites");
              }}
              className="px-4 py-3 bg-white border border-ledger text-grey-dark rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-grey-light transition-all"
            >
              Back
            </button>
            <button
              onClick={handleUseLink}
              disabled={!linkInput.trim()}
              className="flex-1 py-3 bg-ink text-white rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-charcoal disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              Find Invitation <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ----- Create a new organization -----
  if (view === "create-org") {
    return (
      <Shell>
        <div className="p-8 space-y-6 animate-enter">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold font-mono text-ink">
              Create your organization
            </h2>
            <p className="text-grey-mid text-sm">
              You'll be set up as the administrator
              {signedInEmail && (
                <>
                  {" "}using <span className="font-mono">{signedInEmail}</span>
                </>
              )}
              .
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-grey-mid uppercase tracking-wide mb-1.5">
                Your Full Name
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid"
                />
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className={`${inputClass} pl-10`}
                  placeholder="e.g. Sarah Jones"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-grey-mid uppercase tracking-wide mb-1.5">
                Organization Name
              </label>
              <div className="relative">
                <Building2
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid"
                />
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className={`${inputClass} pl-10`}
                  placeholder="e.g. St Mary's Church"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-grey-mid uppercase tracking-wide mb-1.5">
                Charity Number{" "}
                <span className="text-grey-mid font-normal normal-case">
                  (Optional)
                </span>
              </label>
              <input
                type="text"
                value={orgCharityNum}
                onChange={(e) => setOrgCharityNum(e.target.value)}
                className={`${inputClass} font-mono`}
                placeholder="12345678"
              />
            </div>

            <div className="p-4 rounded-xl border border-ledger bg-grey-light">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={16} className="text-sage mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-grey-dark">
                    Ready to Go
                  </h3>
                  <p className="text-xs text-grey-mid mt-1 leading-relaxed">
                    Your organization will be created with a General Fund and
                    standard UK charity categories.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {errorBox}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setError(null);
                setView("invites");
              }}
              disabled={isSubmitting}
              className="px-4 py-3 bg-white border border-ledger text-grey-dark rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-grey-light transition-all disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={handleCreateOrg}
              disabled={!orgName || !userName || isSubmitting}
              className="flex-1 py-3 bg-ink text-white rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-charcoal disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Create Ledger <Sparkles size={16} className="text-amber" />
                </>
              )}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ----- No invitation found: guard against accidental duplicate orgs -----
  return (
    <Shell>
      <div className="p-8 space-y-6 animate-enter">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold font-mono text-ink">
            Welcome to ChurchCoin
          </h2>
          <p className="text-grey-mid text-sm">
            How would you like to get started?
          </p>
        </div>

        <div className="p-4 rounded-xl border border-amber/40 bg-amber-light/30">
          <div className="flex items-start gap-3">
            <Mail size={16} className="text-amber mt-0.5 shrink-0" />
            <p className="text-xs text-grey-dark leading-relaxed">
              <span className="font-bold">Expecting to join an existing church?</span>{" "}
              We couldn't find an invitation
              {signedInEmail && (
                <>
                  {" "}for <span className="font-mono">{signedInEmail}</span>
                </>
              )}
              . Use the invite link you were sent, or ask your administrator to
              invite this email address.
            </p>
          </div>
        </div>

        {errorBox}

        <div className="space-y-3">
          <button
            onClick={() => setView("enter-link")}
            className="w-full py-3 bg-white border border-ledger text-ink rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-grey-light transition-all flex items-center justify-center gap-2"
          >
            <LinkIcon size={16} /> I have an invite link
          </button>
          <button
            onClick={() => setView("create-org")}
            className="w-full py-3 bg-ink text-white rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-charcoal transition-all flex items-center justify-center gap-2"
          >
            <Building2 size={16} /> Create a new organization
          </button>
        </div>
      </div>
    </Shell>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-4">
    <div className="mb-8 animate-enter">
      <img
        src="/ChurchCoin-Variation 01-transparent-s.png"
        alt="ChurchCoin Finance Platform"
        className="h-12"
      />
    </div>
    <div className="w-full max-w-md bg-white border border-ledger rounded-2xl shadow-xl shadow-ledger/50 overflow-hidden">
      {children}
    </div>
    <p className="mt-8 text-xs text-grey-mid font-medium">
      Secure. Private. Intelligent.
    </p>
  </div>
);

export default Onboarding;
