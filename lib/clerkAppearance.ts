// ─────────────────────────────────────────────────────────────────────────────
// ChurchCoin · Clerk appearance — "Refined Ledger"
// Set once on <ClerkProvider> in index.tsx; also passed to <SignIn>, <SignUp>,
// and <UserButton> directly.
//
// Design system: calm white cards, 1px hairline borders, 12px radius, NO hard
// shadows. Mono (JetBrains Mono) ledger labels, DM Sans body, amber primary
// accent (#a9743f) with sage for success. Matches the "C · Refined Ledger"
// dashboard direction.
// ─────────────────────────────────────────────────────────────────────────────

const ink = "#1c1917";
const muted = "#78716c";
const faint = "#a8a29e";
const paper = "#faf9f7";
const line = "#e7e5e1";
const accent = "#a9743f";        // amber — primary brand accent
const accentSoft = "#faf2e9";
const sage = "#557555";          // success
const danger = "#b53d3d";

export const clerkAppearance = {
  variables: {
    colorPrimary: ink,            // primary buttons are calm ink, not pure black
    colorBackground: "#ffffff",
    colorText: ink,
    colorTextSecondary: muted,
    colorInputBackground: "#ffffff",
    colorInputText: ink,
    colorSuccess: sage,
    colorDanger: danger,
    colorTextOnPrimaryBackground: "#ffffff",
    borderRadius: "8px",
    fontFamily: '"DM Sans", system-ui, sans-serif',
    fontFamilyButtons: '"DM Sans", system-ui, sans-serif',
    fontSize: "14.5px",
  },

  elements: {
    rootBox: { width: "100%" },

    // calm card — hairline border, 12px radius, soft (not hard) shadow
    card: {
      backgroundColor: "#ffffff",
      border: `1px solid ${line}`,
      borderRadius: "12px",
      boxShadow: "0 1px 2px rgba(28,25,23,.04), 0 18px 40px -28px rgba(28,25,23,.25)",
    },
    headerTitle: {
      fontFamily: '"DM Sans", sans-serif',
      fontWeight: 700,
      letterSpacing: "-0.02em",
      color: ink,
    },
    headerSubtitle: { color: muted },

    // ledger field labels — mono, uppercase, tracked
    formFieldLabel: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "10.5px",
      fontWeight: 500,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: muted,
    },
    formFieldInput: {
      backgroundColor: "#ffffff",
      border: `1px solid ${line}`,
      borderRadius: "8px",
      color: ink,
      "&:focus": {
        borderColor: ink,
        boxShadow: "0 0 0 3px rgba(28,25,23,.08)",
      },
      "&::placeholder": { color: faint },
    },

    // primary — calm ink with a soft lift on hover (no neo-brutalist hard shadow)
    formButtonPrimary: {
      backgroundColor: ink,
      color: "#ffffff",
      fontWeight: 600,
      textTransform: "none",
      border: "none",
      borderRadius: "8px",
      boxShadow: "none",
      transition: "transform .15s ease, box-shadow .15s ease, background .15s ease",
      "&:hover": {
        backgroundColor: "#2a2522",
        transform: "translateY(-1px)",
        boxShadow: "0 8px 18px -10px rgba(28,25,23,.65)",
      },
      "&:active": { transform: "translateY(0)", boxShadow: "none" },
    },

    socialButtonsBlockButton: {
      backgroundColor: "#ffffff",
      border: `1px solid ${line}`,
      borderRadius: "8px",
      color: ink,
      "&:hover": { backgroundColor: "#fcfbfa", borderColor: "#c9c5be" },
    },
    socialButtonsBlockButtonText: { fontWeight: 500, color: ink },

    dividerLine: { backgroundColor: line },
    dividerText: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "10px",
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: faint,
    },

    // links / accents — amber
    footerActionLink: { color: accent, fontWeight: 600, "&:hover": { color: "#8c5d31" } },
    formFieldAction: { color: accent, fontWeight: 600, "&:hover": { color: "#8c5d31" } },
    formResendCodeLink: { color: accent, "&:hover": { color: "#8c5d31" } },
    identityPreviewEditButton: { color: accent, "&:hover": { color: "#8c5d31" } },

    identityPreview: {
      backgroundColor: paper,
      border: `1px solid ${line}`,
      borderRadius: "8px",
    },
    identityPreviewText: { color: ink },

    otpCodeFieldInput: {
      border: `1px solid ${line}`,
      borderRadius: "8px",
      color: ink,
      "&:focus": { borderColor: ink, boxShadow: "0 0 0 3px rgba(28,25,23,.08)" },
    },

    // ── UserButton (avatar menu) ──────────────────────────────────────────────
    avatarBox: { borderRadius: "999px" },
    userButtonAvatarBox: {
      width: "38px",
      height: "38px",
      boxShadow: "0 0 0 3px #fff, 0 0 0 4px #cfe0cf", // sage ring
    },
    userButtonPopoverCard: {
      borderRadius: "12px",
      border: `1px solid ${line}`,
      boxShadow: "0 16px 40px -16px rgba(28,25,23,.28)",
    },
    userButtonPopoverActionButton: {
      color: ink,
      "&:hover": { backgroundColor: "#f7f6f4" },
    },
    userButtonPopoverActionButtonIcon: { color: muted },
    userButtonPopoverFooter: { display: "none" }, // hide Clerk footer if desired

    // ── UserProfile (account modal) ──────────────────────────────────────────
    navbar: { backgroundColor: "#fcfbfa", borderRight: `1px solid ${line}` },
    navbarButton: {
      color: muted,
      borderRadius: "8px",
      "&[data-active='true'], &:hover": { color: accent, backgroundColor: accentSoft },
    },
    profileSectionTitleText: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "10.5px",
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: muted,
    },
    badge: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "9.5px",
      fontWeight: 700,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: sage,
      backgroundColor: "#eef3ee",
      border: "1px solid #cfe0cf",
      borderRadius: "5px",
    },
  },
};

export default clerkAppearance;
