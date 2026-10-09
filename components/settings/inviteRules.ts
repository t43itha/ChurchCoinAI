import type { UserRole } from "../../lib/permissions";
import type { InvitationCreateInput } from "../../types";

export type InviteStep = "email" | "role" | "send";

const LOCAL_PART = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

// Strict on purpose: one @, no spaces, and a dotted domain of letters, digits and hyphens. Surrounding spaces are trimmed.
export function isValidInviteEmail(value: string): boolean {
  const address = value.trim();
  if (address.length > 254) return false;
  const parts = address.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return LOCAL_PART.test(local) && DOMAIN.test(domain);
}

// The email step gates every later step, so the rail and Next can't get past an address that wouldn't be sent.
export function canOpenInviteStep(step: InviteStep, email: string): boolean {
  return step === "email" || isValidInviteEmail(email);
}

// The request the send step makes, or null when the address isn't valid.
export function inviteRequest(email: string, role: UserRole): InvitationCreateInput | null {
  if (!isValidInviteEmail(email)) return null;
  return { email: email.trim(), role };
}
