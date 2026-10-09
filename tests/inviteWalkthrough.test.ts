import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import InviteWalkthrough from "../components/settings/InviteWalkthrough";
import { generateInviteMessage } from "../components/settings/inviteMessage";
import { ROLES } from "../lib/permissions";
import { roleAccessLines, roleOptions } from "../lib/roleAccess";

const message = (inviteUrl: string | null) =>
  generateInviteMessage({
    churchName: "St Barnabas",
    email: "new@example.invalid",
    role: "Pastorate",
    inviteUrl,
    origin: "https://app.example.invalid",
    senderName: "Sarah",
  });

describe("invite message", () => {
  it("includes the invite link when one exists", () => {
    const text = message("https://app.example.invalid/?invite=abc");
    expect(text).toContain("https://app.example.invalid/?invite=abc");
    expect(text).toContain("You've been invited to join St Barnabas on ChurchCoin as a Pastorate member.");
    expect(text).toContain("Sarah");
  });

  it("falls back to sign-up steps when there is no link", () => {
    const text = message(null);
    expect(text).toContain("1. Go to https://app.example.invalid");
    expect(text).toContain("Sign up or log in using this email address: new@example.invalid");
  });
});

describe("role access", () => {
  it("describes every role from the permissions policy", () => {
    expect(roleOptions.map((option) => option.role)).toEqual([...ROLES]);
    for (const option of roleOptions) expect(option.lines.length).toBeGreaterThan(0);
  });

  it("states what a Guest cannot do in words", () => {
    const guest = roleAccessLines("Guest");
    expect(guest).toContain("Donor names are hidden");
    expect(guest).toContain("No Reports");
    expect(guest).toContain("Cannot manage people or billing");
  });

  it("lets an Admin manage people and billing", () => {
    expect(roleAccessLines("Admin")).toContain("Manages people, billing and settings");
  });
});

describe("InviteWalkthrough", () => {
  it("opens on the email step with Next disabled until an address is typed", () => {
    const html = renderToStaticMarkup(
      createElement(InviteWalkthrough, {
        churchName: "St Barnabas",
        senderName: "Sarah",
        onInviteUser: vi.fn(),
        onClose: vi.fn(),
      })
    );
    expect(html).toContain("Who are you inviting?");
    expect(html).toContain("Email address");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Next: choose a role/);
  });
});
