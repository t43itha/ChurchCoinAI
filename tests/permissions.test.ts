import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { CAPABILITIES, DEFAULT_INVITE_ROLE, OWNER_ROLE, ROLES, can, type Capability, type UserRole } from "../lib/permissions";
import { assertCapability, redactDonorFields, roleValidator } from "../convex/lib/auth";

// Independent, exhaustive policy expectations: Admin, Finance Team, Pastorate, Guest.
const expected: Record<Capability, readonly boolean[]> = {
  "ledger.read": [true, true, true, true],
  "ledger.write": [true, true, false, false],
  "ledger.delete": [true, false, false, false],
  "donors.read": [true, true, true, false],
  "donors.write": [true, true, false, false],
  "donors.delete": [true, false, false, false],
  "pledges.read": [true, true, true, true],
  "pledges.write": [true, true, false, false],
  "pledges.delete": [true, false, false, false],
  "reports.read": [true, true, true, false],
  "reconciliation.manage": [true, true, false, false],
  "bank.manage": [true, true, false, false],
  "bank.remove": [true, false, false, false],
  "settings.view": [true, true, false, false],
  "organization.update": [true, false, false, false],
  "organization.export": [true, false, false, false],
  "organization.delete": [true, false, false, false],
  "users.list": [true, true, false, false],
  "users.manage": [true, false, false, false],
  "invitations.read": [true, true, false, false],
  "invitations.manage": [true, false, false, false],
  "billing.manage": [true, false, false, false],
  "funds.write": [true, true, false, false],
  "funds.delete": [true, false, false, false],
  "categories.write": [true, true, false, false],
  "categories.delete": [true, false, false, false],
  "categories.migrate": [true, false, false, false],
  "cashCollections.read": [true, true, false, false],
  "cashCollections.write": [true, true, false, false],
  "cashCollections.delete": [true, false, false, false],
  "giftAid.read": [true, true, false, false],
  "intelligence.manage": [true, true, false, false],
  "intelligence.delete": [true, false, false, false],
};

it("covers every capability and uses one role vocabulary and validator", () => {
  expect(Object.keys(CAPABILITIES).sort()).toEqual(Object.keys(expected).sort());
  expect(ROLES).toEqual(["Admin", "Finance Team", "Pastorate", "Guest"]);
  expect(OWNER_ROLE).toBe("Admin");
  expect(DEFAULT_INVITE_ROLE).toBe("Guest");
  expect(roleValidator.members.map((member) => member.value)).toEqual(ROLES);
});

describe.each(Object.keys(expected) as Capability[])("%s", (capability) => {
  it.each(ROLES)("enforces the policy for %s on client and server", (role) => {
    const allowed = expected[capability][ROLES.indexOf(role)];
    expect(can(role, capability)).toBe(allowed);
    if (allowed) expect(() => assertCapability({ role }, capability)).not.toThrow();
    else expect(() => assertCapability({ role }, capability)).toThrow(`Forbidden: This action requires ${capability}`);
  });
});

it("redacts donor identity and contacts without changing the financial row or original", () => {
  const row = {
    donorId: "donor-1", donorName: "Alex (A.) Smith", donorEmail: "alex@example.invalid",
    donorPhone: "0123456789", donorAddress: "1 Church Road", donorPostcode: "AB1 2CD",
    description: "Tithes - Alex (A.) Smith", notes: "Contact alex@example.invalid",
    amount: 25, fundId: "fund-1", date: "2026-01-10",
  };
  expect(redactDonorFields({ role: "Guest" }, row)).toEqual({
    donorName: "", description: "Donation",
    amount: 25, fundId: "fund-1", date: "2026-01-10",
  });
  expect(row.donorName).toBe("Alex (A.) Smith");
  expect(redactDonorFields({ role: "Pastorate" }, row)).toBe(row);
});

describe("donor display text redaction", () => {
  const row = {
    donorId: "primary-donor", donorName: "Alex Smith",
    description: "Tithes - Robin Jones", notes: "Contact Robin Jones at robin@example.invalid",
    voidReason: "Robin Jones requested a correction", isVoided: true,
    amount: 25, fundId: "fund-1", date: "2026-01-10", category: "Tithes", paymentMethod: "Cash",
  };

  it.each([
    { name: "donor ID", donorId: "primary-donor" },
    { name: "donor name", donorName: "Alex Smith" },
    { name: "donor contact projection", donorEmail: "alex@example.invalid" },
    { name: "donor marker", donorMatched: true },
    { name: "pledge link", pledgeId: "pledge-1" },
    { name: "Gift Aid eligibility", isGiftAidEligible: true },
  ])("replaces all donor-bearing text when only $name remains", ({ name: _name, ...marker }) => {
    const original = { ...row, donorId: undefined, donorName: "", ...marker };
    const result = redactDonorFields({ role: "Guest" }, original);
    expect(result).toMatchObject({
      donorName: "", description: "Donation", isVoided: true,
      amount: 25, fundId: "fund-1", date: "2026-01-10", category: "Tithes", paymentMethod: "Cash",
    });
    expect(result).not.toHaveProperty("donorId");
    expect(result).not.toHaveProperty("donorEmail");
    expect(result).not.toHaveProperty("donorMatched");
    expect(result).not.toHaveProperty("notes");
    expect(result).not.toHaveProperty("voidReason");
    expect(JSON.stringify(result)).not.toMatch(/Robin Jones|Alex Smith|@example\.invalid/);
    expect(original.description).toBe(row.description);
    expect(original.notes).toBe(row.notes);
    expect(original.voidReason).toBe(row.voidReason);
  });

  it.each(["Cash", "Cheque", "Card"])("redacts a named cash collection donation paid by %s", (paymentMethod) => {
    const result = redactDonorFields({ role: "Guest" }, { ...row, cashCollectionId: "collection-1", paymentMethod });
    expect(result.description).toBe("Donation");
    expect(result).not.toHaveProperty("notes");
    expect(result).toMatchObject({ cashCollectionId: "collection-1", paymentMethod, category: "Tithes", amount: 25 });
  });

  it.each<UserRole>(["Admin", "Finance Team", "Pastorate"])("preserves everything for %s while restricting Guest display text", (role) => {
    const original = structuredClone(row);
    expect(redactDonorFields({ role }, row)).toBe(row);
    expect(row).toEqual(original);
    expect(redactDonorFields({ role: "Guest" }, row).description).toBe("Donation");
    expect(row).toEqual(original);
  });
});

// Loading the full ESLint config takes several seconds on a busy runner.
describe("role-literal enforcement", { timeout: 60_000 }, () => {
  const eslint = new ESLint();
  it("rejects role checks, role arrays, validators, dropdowns and TS literal unions", async () => {
    const [result] = await eslint.lintText(`
      const role = "Admin";
      const allowed = ["Finance Team", "Pastorate"].includes(role);
      type Role = "Guest";
      const validator = v.literal("Admin");
      const option = <option value="Guest">Guest</option>;
    `, { filePath: "components/PermissionExample.tsx" });
    const errors = result.messages.filter((message) => message.ruleId === "churchcoin/role-literal");
    expect(errors).toHaveLength(6);
    expect(errors.every((error) => error.severity === 2 && error.message.includes("lib/permissions.ts"))).toBe(true);
  });
  it.each(["tests/permissionExample.test.ts", "lib/permissions.ts"])("allows the explicit exception %s", async (filePath) => {
    const [result] = await eslint.lintText('export const role = "Admin";', { filePath });
    expect(result.messages.filter((message) => message.ruleId === "churchcoin/role-literal")).toEqual([]);
  });
  it("also protects JavaScript and leaves unrelated strings alone", async () => {
    const [result] = await eslint.lintText('export const roles = ["Admin", "Admin & Governance"];', { filePath: "lib/example.js" });
    expect(result.messages.filter((message) => message.ruleId === "churchcoin/role-literal")).toHaveLength(1);
  });
});
