export type PlanTier = "starter" | "growing" | "thriving";
export type AuthMode = "signin" | "signup";

const STORAGE_KEY = "churchcoin:onboarding-intent";

export interface OnboardingIntent {
  authMode: AuthMode;
  selectedPlan?: PlanTier;
  source?: string;
}
export function getOnboardingIntent(): OnboardingIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<OnboardingIntent>;
    if (parsed.authMode !== "signin" && parsed.authMode !== "signup") return null;
    if (
      parsed.selectedPlan &&
      !["starter", "growing", "thriving"].includes(parsed.selectedPlan)
    ) return null;
    return parsed as OnboardingIntent;
  } catch {
    return null;
  }
}

export function storeOnboardingIntent(intent: OnboardingIntent) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
}

export function clearOnboardingIntent() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
