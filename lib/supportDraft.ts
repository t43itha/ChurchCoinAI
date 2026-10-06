export const SUPPORT_DRAFT_STORAGE_KEY = "churchcoin:support-draft";

export type SupportDraft = {
  title?: string;
  description?: string;
  type?: "bug" | "question" | "feature";
  impact?: "blocking" | "difficult" | "minor";
};

export const storeSupportDraft = (draft: SupportDraft) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SUPPORT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
};

export const takeSupportDraft = (): SupportDraft | null => {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY);
  if (!value) return null;
  window.sessionStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY);
  try {
    return JSON.parse(value) as SupportDraft;
  } catch {
    return null;
  }
};

export const hasSupportDraft = () =>
  typeof window !== "undefined" &&
  window.sessionStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY) !== null;
