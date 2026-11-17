// Church and person names are shown inside invitation emails, so they are
// limited to name-like text: letters, digits, spaces and common name
// punctuation. Links, email addresses and markup cannot be written into them.
const NAME_CHARACTERS = /^[\p{L}\p{M}\p{N} '’&.,()/!–—-]+$/u;
// A label of two or more characters, a dot, then a suffix of two or more
// letters ("example.com") reads as a web address; initials ("J.R.") do not.
const DOMAIN_LIKE = /[\p{L}\p{N}-]{2,}\.\p{L}{2,}/u;

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
  if (!NAME_CHARACTERS.test(name) || DOMAIN_LIKE.test(name)) {
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

/** The trimmed pledge donor name, or throws with a message for the person typing it. */
export function requirePledgeDonorName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error("Donor name is required");
  if (name.length > PLEDGE_DONOR_NAME_MAX) {
    throw new Error(`Donor name must be ${PLEDGE_DONOR_NAME_MAX} characters or fewer`);
  }
  if (CONTROL_CHARACTERS.test(name)) throw new Error("Donor name cannot contain control characters");
  return name;
}
