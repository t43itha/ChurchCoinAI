import { can, type Capability, type UserRole } from "../../lib/permissions";
import type { LaunchFeatures } from "../../convex/lib/launchFeatures";

export type SettingsSheetId = "church" | "gift-aid" | "funds" | "categories" | "people" | "bank" | "billing" | "privacy";
export type SettingsGroup = "Church" | "Team" | "Money" | "Account";

export interface SettingsRow {
  id: SettingsSheetId;
  group: SettingsGroup;
  title: string;
  // Admin-only rows set this; the others follow the settings.view gate every row needs.
  capability?: Capability;
  // Rows for a feature that is switched off on this deployment are hidden.
  feature?: keyof LaunchFeatures;
}

// Grouped in the order they appear on the page.
export const SETTINGS_ROWS: readonly SettingsRow[] = [
  { id: "church", group: "Church", title: "Church details" },
  { id: "gift-aid", group: "Church", title: "Gift Aid" },
  { id: "funds", group: "Church", title: "Funds and campaigns" },
  { id: "categories", group: "Church", title: "Categories" },
  { id: "people", group: "Team", title: "People and invitations" },
  { id: "bank", group: "Money", title: "Bank connections", feature: "bankFeeds" },
  { id: "billing", group: "Account", title: "Plan and billing", capability: "billing.manage", feature: "billing" },
  { id: "privacy", group: "Account", title: "Data and privacy", capability: "organization.export" },
];

export const SETTINGS_GROUPS: readonly SettingsGroup[] = ["Church", "Team", "Money", "Account"];

// Older links used the tab names from the side-tab layout. Keep them working.
const LEGACY_TAB_IDS: Record<string, SettingsSheetId> = {
  general: "church",
  users: "people",
  data: "privacy",
};

export function settingsRowsFor(role: UserRole, features: LaunchFeatures): SettingsRow[] {
  if (!can(role, "settings.view")) return [];
  return SETTINGS_ROWS.filter(
    (row) => (!row.capability || can(role, row.capability)) && (!row.feature || features[row.feature])
  );
}

// The sheet a `?tab=` deep link opens, or null when the role can't see that row.
export function sheetForTab(tab: string | null, role: UserRole, features: LaunchFeatures): SettingsSheetId | null {
  if (!tab) return null;
  const id = (LEGACY_TAB_IDS[tab] ?? tab) as SettingsSheetId;
  return settingsRowsFor(role, features).some((row) => row.id === id) ? id : null;
}

export function sheetForSearch(search: string, role: UserRole, features: LaunchFeatures): SettingsSheetId | null {
  return sheetForTab(new URLSearchParams(search).get("tab"), role, features);
}

// Drops the named params from a search string, leaving the rest in place.
export function searchWithout(search: string, names: readonly string[]): string {
  const params = new URLSearchParams(search);
  if (!names.some((name) => params.has(name))) return search;
  names.forEach((name) => params.delete(name));
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

// Drops a consumed `?tab=` so the same link (the trial card's, for one) changes the URL and opens the sheet again.
export function searchWithoutTab(search: string): string {
  return searchWithout(search, ["tab"]);
}
