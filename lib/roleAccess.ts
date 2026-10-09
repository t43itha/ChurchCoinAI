import { can, ROLES, type UserRole } from "./permissions";

// Plain-English access for each role, built from the capability checks so it can't drift from
// lib/permissions.ts. Used by the invite walkthrough, where people pick a role without seeing the grant table.
export function roleAccessLines(role: UserRole): string[] {
  return [
    can(role, "ledger.write") ? "Records and changes money" : "Sees money, read only",
    can(role, "donors.read")
      ? can(role, "donors.write")
        ? "Sees and edits donor records"
        : "Sees donor records, read only"
      : "Donor names are hidden",
    can(role, "reports.read") ? "Opens Reports" : "No Reports",
    can(role, "invitations.manage") ? "Manages people, billing and settings" : "Cannot manage people or billing",
  ];
}

export const roleOptions = ROLES.map((role) => ({ role, lines: roleAccessLines(role) }));
