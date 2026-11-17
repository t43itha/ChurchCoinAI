import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DonorManager from "../components/DonorManager";
import type { UserRole } from "../types";

vi.mock("convex/react", () => ({
  useConvex: () => ({ query: vi.fn() }),
  useMutation: () => vi.fn(),
}));

function renderDonors(role: UserRole) {
  const props: ComponentProps<typeof DonorManager> = {
    donors: [{ _id: "donor", name: "Alex Smith", type: "Individual" }],
    transactions: [],
    pledges: [],
    funds: [],
    currentUser: { _id: "user", name: "Test User", email: "test@example.invalid", role },
    onAddDonor: vi.fn(),
    onUpdateDonor: vi.fn(),
    onAddPledge: vi.fn(),
    onUpdatePledge: vi.fn(),
    onUpdateTransaction: vi.fn(),
  };
  return renderToStaticMarkup(createElement(DonorManager, props));
}

describe("Donors page permissions", () => {
  it("shows Pastorate the directory and profile without editing controls", () => {
    const html = renderDonors("Pastorate");
    expect(html).toContain("Alex Smith");
    expect(html).toContain("Given in");
    expect(html).not.toContain("Access Restricted");
    expect(html).not.toContain("Add donor");
    expect(html).not.toContain("Find duplicates");
    expect(html).not.toContain("Select donors to merge");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain("+ New schedule");
  });

  it("keeps Guest blocked even when donor props are supplied", () => {
    const html = renderDonors("Guest");
    expect(html).toContain("Access Restricted");
    expect(html).not.toContain("Alex Smith");
    expect(html).not.toContain("Donor directory");
  });

  it.each<UserRole>(["Admin", "Finance Team"])("keeps the finance editing controls for %s", (role) => {
    const html = renderDonors(role);
    expect(html).toContain("Alex Smith");
    expect(html).toContain("Add donor");
    expect(html).toContain(">Edit<");
  });

  // Merging deletes the duplicate donor records, which is Admin only.
  it("offers duplicate finding and merging to Admin only", () => {
    const admin = renderDonors("Admin");
    expect(admin).toContain("Find duplicates");
    expect(admin).toContain("Select donors to merge");
    for (const role of ["Finance Team", "Pastorate"] as UserRole[]) {
      const html = renderDonors(role);
      expect(html).not.toContain("Find duplicates");
      expect(html).not.toContain("Select donors to merge");
    }
  });
});
