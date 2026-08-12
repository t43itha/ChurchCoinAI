export const PRODUCT_TRIAL_DAYS = 14;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const PRODUCT_TRIAL_DURATION_MS = PRODUCT_TRIAL_DAYS * DAY_MS;

export function getTrialProgress(expiresAt: number, now = Date.now()) {
  const startsAt = expiresAt - PRODUCT_TRIAL_DURATION_MS;
  const elapsedDays = Math.floor(Math.max(0, now - startsAt) / DAY_MS);
  const dayNumber = Math.min(PRODUCT_TRIAL_DAYS, Math.max(1, elapsedDays + 1));
  const daysLeft = Math.max(0, PRODUCT_TRIAL_DAYS - dayNumber);

  return {
    dayNumber,
    daysLeft,
    progressPercent: (dayNumber / PRODUCT_TRIAL_DAYS) * 100,
    hasExpired: now >= expiresAt,
  };
}
