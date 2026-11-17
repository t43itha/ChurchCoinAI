// Shared by the invitation mutations and the People sheet, so the screen and
// the server agree on when an invitation may be emailed again.
export const INVITE_RESEND_COOLDOWN_MS = 10 * 60 * 1000;

/** When an invitation last emailed at `lastSentAt` may be resent, or null if it can be now. */
export function nextResendAt(lastSentAt: number | undefined, now = Date.now()): number | null {
  if (lastSentAt === undefined) return null;
  const allowedAt = lastSentAt + INVITE_RESEND_COOLDOWN_MS;
  return allowedAt > now ? allowedAt : null;
}
