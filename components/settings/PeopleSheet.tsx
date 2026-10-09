import { useState } from "react";
import { useConvex } from "convex/react";
import { UserPlus } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { can, ROLES, type UserRole } from "../../lib/permissions";
import { notify } from "../../lib/notifications";
import type { AppUser, Invitation } from "../../types";
import WizardFrame from "../wizard/WizardFrame";
import StepFooter from "../wizard/StepFooter";
import { btnLg, btnPrimary, linkBtnSm, screenHelp, screenTitle, tagAmber, tagSage } from "../wizard/ui";
import { buildInviteUrl, generateInviteMessage } from "./inviteMessage";

interface PeopleSheetProps {
  currentUser: AppUser;
  churchName: string;
  users: AppUser[];
  pendingInvitations: Invitation[];
  onUpdateUserRole: (userId: string, newRole: UserRole) => void;
  onResendInvitation: (invitationId: string) => Promise<unknown>;
  onCancelInvitation: (invitationId: string) => void;
  onInvite: () => void;
  onClose: () => void;
}

const formatExpiry = (expiresAt: number) => {
  const days = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Expired";
  if (days === 1) return "1 day left";
  return `${days} days left`;
};

export default function PeopleSheet({
  currentUser,
  churchName,
  users,
  pendingInvitations,
  onUpdateUserRole,
  onResendInvitation,
  onCancelInvitation,
  onInvite,
  onClose,
}: PeopleSheetProps) {
  const convex = useConvex();
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const canManageInvites = can(currentUser.role, "invitations.manage");

  const handleResend = async (invitationId: string) => {
    setResendingInviteId(invitationId);
    try {
      await onResendInvitation(invitationId);
    } finally {
      setResendingInviteId(null);
    }
  };

  const handleCopy = async (invitation: Invitation) => {
    let link: { token: string | undefined };
    try {
      link = await convex.query(api.queries.invitations.getInviteLink, {
        invitationId: invitation._id as Id<"invitations">,
      });
    } catch (error) {
      notify("Error", error instanceof Error ? error.message : "Could not copy the invite link.");
      return;
    }
    const message = generateInviteMessage({
      churchName,
      email: invitation.email,
      role: invitation.role,
      inviteUrl: buildInviteUrl(window.location.origin, link.token),
      origin: window.location.origin,
      senderName: currentUser.name,
    });
    try {
      await navigator.clipboard.writeText(message);
      setCopiedInviteId(invitation._id);
      setTimeout(() => setCopiedInviteId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <WizardFrame
      ariaLabel="People and invitations"
      title="People and invitations"
      onClose={onClose}
      footer={
        canManageInvites ? (
          <StepFooter>
            <button type="button" onClick={onInvite} className={`${btnPrimary} ${btnLg}`}>
              <UserPlus size={16} aria-hidden="true" /> Invite someone
            </button>
          </StepFooter>
        ) : undefined
      }
    >
      <h2 className={screenTitle}>People and invitations</h2>
      <p className={screenHelp}>Who can see this church's books, and what they can do.</p>

      <h3 className="mt-5 text-[15px] font-bold text-ink">Active</h3>
      <ul className="mt-2.5 divide-y divide-ledger overflow-hidden rounded-2xl border border-ledger bg-white">
        {users.map((user) => (
          <li key={user._id} className="flex min-h-[64px] items-center gap-3 px-3.5 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1ede8] font-mono text-[13px] font-bold text-[#5b4a3f]">
              {user.name.charAt(0)}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[14.5px] text-ink">{user.name}</b>
              <span className="block truncate text-xs text-grey-mid">{user.email}</span>
            </span>
            {can(currentUser.role, "users.manage") ? (
              <select
                aria-label={`Role for ${user.name}`}
                value={user.role}
                onChange={(event) => onUpdateUserRole(user._id, event.target.value as UserRole)}
                disabled={user._id === currentUser._id}
                className="h-11 max-w-[9.5rem] rounded-[11px] border border-ledger bg-white px-2 text-sm text-grey-dark disabled:opacity-50"
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            ) : (
              <span className="shrink-0 text-xs text-grey-dark">{user.role}</span>
            )}
          </li>
        ))}
      </ul>

      {pendingInvitations.length > 0 && (
        <>
          <h3 className="mt-6 text-[15px] font-bold text-ink">Waiting to accept</h3>
          <p className="mt-1 text-xs text-grey-mid">These people haven't signed up yet.</p>
          <ul className="mt-2.5 divide-y divide-ledger overflow-hidden rounded-2xl border border-ledger bg-white">
            {pendingInvitations.map((invitation) => {
              const expired = invitation.expiresAt <= Date.now();
              return (
                <li key={invitation._id} className="grid gap-2 px-3.5 py-3">
                  <div className="min-w-0">
                    <b className="block break-all text-sm text-ink">{invitation.email}</b>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-grey-mid">
                      <span>{invitation.role}</span>
                      <span className={expired ? tagAmber : tagSage}>{formatExpiry(invitation.expiresAt)}</span>
                    </span>
                  </div>
                  {canManageInvites && (
                    <div className="flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        onClick={() => void handleResend(invitation._id)}
                        disabled={resendingInviteId === invitation._id}
                        title="Email the invitation again and extend its expiry"
                        className={`${linkBtnSm} disabled:opacity-50`}
                      >
                        {resendingInviteId === invitation._id ? "Sending…" : "Resend"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopy(invitation)}
                        title="Copy invite message with link"
                        className={linkBtnSm}
                      >
                        {copiedInviteId === invitation._id ? "Copied!" : "Copy link"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onCancelInvitation(invitation._id)}
                        className="inline-flex min-h-11 items-center text-xs font-bold text-error"
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </WizardFrame>
  );
}
