import { describe, expect, it } from "vitest";

import {
  clerkAppearance,
  clerkAuthAppearance,
  clerkUserButtonAppearance,
  clerkUserProfileAppearance,
} from "../lib/clerkAppearance";

describe("Clerk ChurchCoin appearance coverage", () => {
  it("registers component-specific themes with the global Clerk provider", () => {
    expect(clerkAppearance.signIn).toBe(clerkAuthAppearance);
    expect(clerkAppearance.signUp).toBe(clerkAuthAppearance);
    expect(clerkAppearance.userVerification).toBe(clerkAuthAppearance);
    expect(clerkAppearance.userButton).toBe(clerkUserButtonAppearance);
    expect(clerkAppearance.userProfile).toBe(clerkUserProfileAppearance);
  });

  it("hides Clerk-owned footers where ChurchCoin supplies its own navigation", () => {
    expect(clerkAuthAppearance.elements.footer).toEqual({ display: "none" });
    expect(clerkUserButtonAppearance.elements.userButtonPopoverFooter).toEqual({ display: "none" });
    expect(clerkUserProfileAppearance.elements.footer).toEqual({ display: "none" });
  });

  it("covers modal, profile, account-switching, verification, and MFA states", () => {
    expect(clerkUserProfileAppearance.elements.modalBackdrop).toBeDefined();
    expect(clerkUserProfileAppearance.elements.modalCloseButton).toBeDefined();
    expect(clerkUserProfileAppearance.elements.profileSectionItemList).toBeDefined();
    expect(clerkUserProfileAppearance.elements.navbarMobileMenuButton).toBeDefined();
    expect(clerkUserButtonAppearance.elements.accountSwitcherActionButton).toBeDefined();
    expect(clerkAuthAppearance.elements.verificationLinkStatusBox).toBeDefined();
    expect(clerkAuthAppearance.elements.taskSetupMfaMethodSelectionItem).toBeDefined();
    expect(clerkAuthAppearance.elements.qrCodeContainer).toBeDefined();
  });
});
