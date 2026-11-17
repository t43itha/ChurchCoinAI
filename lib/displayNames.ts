// Church and person names are shown inside invitation emails, so they are
// limited to name-like text: letters, digits, spaces and common name
// punctuation. Links, email addresses and markup cannot be written into them.
const NAME_CHARACTERS = /^[\p{L}\p{M}\p{N} '’&.,()/!–—-]+$/u;
// Any label, a dot, then two or more letters with no space between ("x.info",
// "example.com") reads as a web address. Initials stay valid because a dot is
// followed by a single letter or a space ("J.R. Smith", "A. Smith").
const DOMAIN_LIKE = /[\p{L}\p{N}-]\.\p{L}{2,}/u;
const IP_ADDRESS = /\d{1,3}(?:\.\d{1,3}){3}/u;

export const DISPLAY_NAME_LIMITS = { church: 100, person: 80 } as const;

export type DisplayNameKind = keyof typeof DISPLAY_NAME_LIMITS;

const LABELS: Record<DisplayNameKind, string> = { church: "Church name", person: "Name" };

/** Returns the reason a display name is not allowed, or null when it is fine. */
export function displayNameProblem(value: string, kind: DisplayNameKind): string | null {
  const name = value.trim();
  const label = LABELS[kind];
  if (!name) return `${label} is required`;
  if (name.length > DISPLAY_NAME_LIMITS[kind]) {
    return `${label} must be ${DISPLAY_NAME_LIMITS[kind]} characters or fewer`;
  }
  if (!NAME_CHARACTERS.test(name) || [DOMAIN_LIKE, IP_ADDRESS].some((pattern) => pattern.test(name))) {
    return `${label} can only use letters, numbers, spaces and simple punctuation (no web or email addresses)`;
  }
  return null;
}

/** The trimmed name, or throws with a message suitable for the person typing it. */
export function requireDisplayName(value: string, kind: DisplayNameKind): string {
  const problem = displayNameProblem(value, kind);
  if (problem) throw new Error(problem);
  return value.trim();
}

// Pledge donor names come from people typing and from imported files (often a
// bank's "MR J SMITH"), so they keep any printable characters but are capped
// at a length that fits real names, joint names and family names.
export const PLEDGE_DONOR_NAME_MAX = 120;
const CONTROL_CHARACTERS = /\p{Cc}/u;

/** Why a pledge donor name would be refused, or null when it is fine. */
export function pledgeDonorNameProblem(value: string): string | null {
  const name = value.trim();
  if (!name) return "Donor name is required";
  if (name.length > PLEDGE_DONOR_NAME_MAX) return `Donor name must be ${PLEDGE_DONOR_NAME_MAX} characters or fewer`;
  if (CONTROL_CHARACTERS.test(name)) return "Donor name cannot contain control characters";
  return null;
}

/** The trimmed pledge donor name, or throws with a message for the person typing it. */
export function requirePledgeDonorName(value: string): string {
  const problem = pledgeDonorNameProblem(value);
  if (problem) throw new Error(problem);
  return value.trim();
}
