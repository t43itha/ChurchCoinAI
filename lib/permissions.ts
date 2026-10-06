export const ROLES = ["Admin", "Finance Team", "Pastorate", "Guest"] as const;
export type UserRole = (typeof ROLES)[number];

export const OWNER_ROLE = ROLES[0];
export const DEFAULT_INVITE_ROLE = ROLES[3];

const administrators = [ROLES[0]] as const;
const finance = [ROLES[0], ROLES[1]] as const;
const leadership = [ROLES[0], ROLES[1], ROLES[2]] as const;

export const CAPABILITIES = {
  "ledger.read": ROLES,
  "ledger.write": finance,
  "ledger.delete": administrators,
  "donors.read": leadership,
  "donors.write": finance,
  "donors.delete": administrators,
  // Pledge rows are available to everyone; donor fields require donors.read.
  "pledges.read": ROLES,
  "pledges.write": finance,
  "pledges.delete": administrators,
  "reports.read": leadership,
  "reconciliation.manage": finance,
  "bank.manage": finance,
  "bank.remove": administrators,
  "settings.view": finance,
  "organization.update": administrators,
  "organization.export": administrators,
  "organization.delete": administrators,
  "users.list": finance,
  "users.manage": administrators,
  "invitations.read": finance,
  "invitations.manage": administrators,
  "billing.manage": administrators,
  "funds.write": finance,
  "funds.delete": administrators,
  "categories.write": finance,
  "categories.delete": administrators,
  "categories.migrate": administrators,
  "cashCollections.read": finance,
  "cashCollections.write": finance,
  "cashCollections.delete": administrators,
  "giftAid.read": finance,
  "intelligence.manage": finance,
  "intelligence.delete": administrators,
} as const satisfies Record<string, readonly UserRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: UserRole, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly UserRole[]).includes(role);
}
