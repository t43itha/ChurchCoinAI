import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/clerk-react";

// ChurchCoin Clerk appearance — "Refined Ledger"
//
// Keep component-specific themes as separate exports. Clerk's UserButton opens
// UserProfile internally, so passing the nested profile appearance explicitly is
// the most reliable way to prevent that modal from falling back to Clerk defaults.

type ClerkAppearance = NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;

const ink = "#1c1917";
const charcoal = "#2a2522";
const muted = "#78716c";
const faint = "#a8a29e";
const paper = "#faf9f7";
const paperRaised = "#fcfbfa";
const line = "#e7e5e1";
const lineStrong = "#c9c5be";
const accent = "#a9743f";
const accentDark = "#8c5d31";
const accentSoft = "#faf2e9";
const sage = "#557555";
const sageSoft = "#eef3ee";
const sageLine = "#cfe0cf";
const danger = "#b53d3d";
const dangerSoft = "#fff1f0";

const variables = {
  colorPrimary: ink,
  colorBackground: "#ffffff",
  colorText: ink,
  colorTextSecondary: muted,
  colorMutedForeground: muted,
  colorInputBackground: "#ffffff",
  colorInputText: ink,
  colorInputForeground: ink,
  colorInput: "#ffffff",
  colorSuccess: sage,
  colorDanger: danger,
  colorTextOnPrimaryBackground: "#ffffff",
  colorBorder: line,
  colorRing: ink,
  colorShadow: ink,
  colorModalBackdrop: ink,
  borderRadius: "8px",
  fontFamily: '"DM Sans", system-ui, sans-serif',
  fontFamilyButtons: '"DM Sans", system-ui, sans-serif',
  fontSize: "14.5px",
} as const;

const focusRing = "0 0 0 3px rgba(28,25,23,.10)";
const cardShadow = "0 1px 2px rgba(28,25,23,.04), 0 18px 40px -28px rgba(28,25,23,.25)";
const modalShadow = "0 28px 80px -28px rgba(28,25,23,.42)";

const sharedElements = {
  rootBox: { width: "100%", color: ink },
  card: {
    backgroundColor: "#ffffff",
    border: `1px solid ${line}`,
    borderRadius: "12px",
    boxShadow: cardShadow,
  },
  headerTitle: {
    fontFamily: '"DM Sans", system-ui, sans-serif',
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: ink,
  },
  headerSubtitle: { color: muted, lineHeight: 1.55 },
  formFieldLabel: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: "10.5px",
    fontWeight: 500,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: muted,
  },
  formFieldInput: {
    minHeight: "40px",
    backgroundColor: "#ffffff",
    border: `1px solid ${line}`,
    borderRadius: "8px",
    color: ink,
    boxShadow: "none",
    "&:hover": { borderColor: lineStrong },
    "&:focus": { borderColor: ink, boxShadow: focusRing },
    "&::placeholder": { color: faint },
  },
  formFieldInputShowPasswordButton: {
    color: muted,
    borderRadius: "6px",
    "&:hover": { color: ink, backgroundColor: paper },
    "&:focus-visible": { boxShadow: focusRing },
  },
  formButtonPrimary: {
    minHeight: "40px",
    backgroundColor: ink,
    color: "#ffffff",
    fontWeight: 600,
    textTransform: "none",
    border: "none",
    borderRadius: "8px",
    boxShadow: "none",
    transition: "transform .15s ease, box-shadow .15s ease, background .15s ease",
    "&:hover": {
      backgroundColor: charcoal,
      transform: "translateY(-1px)",
      boxShadow: "0 8px 18px -10px rgba(28,25,23,.65)",
    },
    "&:focus-visible": { boxShadow: focusRing },
    "&:active": { transform: "translateY(0)", boxShadow: "none" },
  },
  formFieldAction: {
    color: accent,
    fontWeight: 600,
    borderRadius: "4px",
    "&:hover": { color: accentDark },
    "&:focus-visible": { boxShadow: focusRing },
  },
  formFieldErrorText: { color: danger, fontWeight: 500 },
  formFieldWarningText: { color: accentDark, fontWeight: 500 },
  formFieldSuccessText: { color: sage, fontWeight: 500 },
  alert: {
    backgroundColor: dangerSoft,
    color: danger,
    border: "1px solid #f0c7c3",
    borderRadius: "8px",
  },
  alertIcon: { color: danger },
  dividerLine: { backgroundColor: line },
  dividerText: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: "10px",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: faint,
  },
  identityPreview: {
    backgroundColor: paper,
    border: `1px solid ${line}`,
    borderRadius: "8px",
  },
  identityPreviewText: { color: ink },
  identityPreviewEditButton: {
    color: accent,
    borderRadius: "5px",
    "&:hover": { color: accentDark, backgroundColor: accentSoft },
    "&:focus-visible": { boxShadow: focusRing },
  },
  otpCodeFieldInput: {
    border: `1px solid ${line}`,
    borderRadius: "8px",
    color: ink,
    backgroundColor: "#ffffff",
    "&:focus": { borderColor: ink, boxShadow: focusRing },
  },
  badge: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: "9.5px",
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: sage,
    backgroundColor: sageSoft,
    border: `1px solid ${sageLine}`,
    borderRadius: "5px",
  },
  switchRoot: {
    backgroundColor: lineStrong,
    "&[data-checked='true']": { backgroundColor: sage },
    "&:focus-visible": { boxShadow: focusRing },
  },
  switchThumb: { backgroundColor: "#ffffff" },
} as const;

const authElements = {
  ...sharedElements,
  card: { ...sharedElements.card, overflow: "hidden" },
  socialButtonsBlockButton: {
    minHeight: "38px",
    backgroundColor: "#ffffff",
    border: `1px solid ${line}`,
    borderRadius: "8px",
    color: ink,
    boxShadow: "none",
    "&:hover": { backgroundColor: paperRaised, borderColor: lineStrong },
    "&:focus-visible": { boxShadow: focusRing },
  },
  socialButtonsBlockButtonText: { fontWeight: 500, color: ink },
  socialButtonsIconButton: {
    border: `1px solid ${line}`,
    borderRadius: "8px",
    "&:hover": { backgroundColor: paperRaised, borderColor: lineStrong },
    "&:focus-visible": { boxShadow: focusRing },
  },
  alternativeMethodsBlockButton: {
    backgroundColor: paper,
    color: ink,
    border: `1px solid ${line}`,
    borderRadius: "8px",
    "&:hover": { backgroundColor: accentSoft, borderColor: "#e8d4bc" },
    "&:focus-visible": { boxShadow: focusRing },
  },
  alternativeMethodsBlockButtonText: { fontWeight: 600 },
  formResendCodeLink: {
    color: accent,
    fontWeight: 600,
    "&:hover": { color: accentDark },
    "&:focus-visible": { boxShadow: focusRing },
  },
  verificationLinkStatusBox: {
    backgroundColor: sageSoft,
    border: `1px solid ${sageLine}`,
    borderRadius: "10px",
    color: sage,
  },
  verificationLinkStatusIcon: { color: sage },
  verificationLinkStatusText: { color: sage, fontWeight: 600 },
  taskSetupMfaMethodSelectionItem: {
    backgroundColor: "#ffffff",
    border: `1px solid ${line}`,
    borderRadius: "10px",
    boxShadow: "none",
    "&:hover": { backgroundColor: paper, borderColor: lineStrong },
    "&:focus-visible": { boxShadow: focusRing },
  },
  taskSetupMfaPhoneSelectionItem: {
    backgroundColor: "#ffffff",
    border: `1px solid ${line}`,
    borderRadius: "10px",
    "&:hover": { backgroundColor: paper, borderColor: lineStrong },
    "&:focus-visible": { boxShadow: focusRing },
  },
  taskSetupMfaPhoneSelectionAddPhoneAction: {
    color: accent,
    "&:hover": { color: accentDark },
  },
  qrCodeContainer: {
    padding: "12px",
    backgroundColor: "#ffffff",
    border: `1px solid ${line}`,
    borderRadius: "10px",
  },
  footer: { display: "none" },
} as const;

const userButtonElements = {
  ...sharedElements,
  userButtonBox: { maxWidth: "100%" },
  userButtonTrigger: {
    borderRadius: "999px",
    "&:focus": { boxShadow: focusRing },
    "&:focus-visible": { boxShadow: focusRing },
  },
  avatarBox: { borderRadius: "999px" },
  userButtonAvatarBox: {
    width: "38px",
    height: "38px",
    boxShadow: `0 0 0 3px #fff, 0 0 0 4px ${sageLine}`,
  },
  userButtonPopoverRootBox: { zIndex: 80 },
  userButtonPopoverCard: {
    overflow: "hidden",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    border: `1px solid ${line}`,
    boxShadow: "0 16px 40px -16px rgba(28,25,23,.28)",
  },
  userButtonPopoverMain: { backgroundColor: "#ffffff" },
  userPreview: {
    backgroundColor: paperRaised,
    borderBottom: `1px solid ${line}`,
  },
  userPreviewMainIdentifierText: { color: ink, fontWeight: 700 },
  userPreviewSecondaryIdentifier: { color: muted },
  userButtonPopoverActions: { padding: "6px" },
  userButtonPopoverActionButton: {
    minHeight: "38px",
    color: ink,
    borderRadius: "8px",
    fontWeight: 600,
    "&:hover": { backgroundColor: paper },
    "&:focus-visible": { boxShadow: focusRing },
  },
  userButtonPopoverActionButtonIconBox: { color: muted },
  userButtonPopoverActionButtonIcon: { color: muted },
  userButtonPopoverCustomItemButton: {
    minHeight: "38px",
    color: ink,
    borderRadius: "8px",
    "&:hover": { backgroundColor: paper },
    "&:focus-visible": { boxShadow: focusRing },
  },
  accountSwitcherActionButton: {
    color: ink,
    borderRadius: "8px",
    "&:hover": { backgroundColor: paper },
    "&:focus-visible": { boxShadow: focusRing },
  },
  accountSwitcherActionButtonIcon: { color: muted },
  userButtonPopoverFooter: { display: "none" },
} as const;

const userProfileElements = {
  ...sharedElements,
  rootBox: { width: "100%", maxWidth: "100%", color: ink },
  modalBackdrop: {
    backgroundColor: "rgba(28,25,23,.60)",
    backdropFilter: "blur(3px)",
  },
  modalContent: { borderRadius: "14px", boxShadow: modalShadow },
  modalCloseButton: {
    width: "36px",
    height: "36px",
    color: muted,
    backgroundColor: "rgba(255,255,255,.94)",
    border: `1px solid ${line}`,
    borderRadius: "999px",
    boxShadow: "0 4px 12px rgba(28,25,23,.10)",
    "&:hover": { color: ink, backgroundColor: "#ffffff", borderColor: lineStrong },
    "&:focus-visible": { boxShadow: focusRing },
  },
  card: {
    backgroundColor: "#ffffff",
    border: `1px solid ${line}`,
    borderRadius: "14px",
    boxShadow: modalShadow,
    overflow: "hidden",
  },
  navbar: { backgroundColor: paperRaised, borderRight: `1px solid ${line}` },
  navbarButtons: { gap: "4px" },
  navbarButton: {
    minHeight: "40px",
    color: muted,
    borderRadius: "8px",
    fontWeight: 600,
    "&:hover": { color: ink, backgroundColor: "#f3f1ee" },
    "&[data-active='true']": { color: accentDark, backgroundColor: accentSoft },
    "&:focus-visible": { boxShadow: focusRing },
  },
  navbarButton__active: { color: accentDark, backgroundColor: accentSoft },
  navbarButtonIcon: { color: muted },
  navbarButtonIcon__active: { color: accent },
  navbarButtonText: { color: "inherit" },
  navbarMobileMenuRow: {
    backgroundColor: paperRaised,
    borderBottom: `1px solid ${line}`,
  },
  navbarMobileMenuButton: {
    color: ink,
    border: `1px solid ${line}`,
    borderRadius: "8px",
    "&:focus-visible": { boxShadow: focusRing },
  },
  pageScrollBox: { backgroundColor: "#ffffff" },
  page: { backgroundColor: "#ffffff" },
  profileSection: { padding: "20px 0", borderBottom: `1px solid ${line}` },
  profileSectionHeader: { marginBottom: "12px" },
  profileSectionTitleText: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: "10.5px",
    fontWeight: 600,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: muted,
  },
  profileSectionSubtitleText: { color: muted, lineHeight: 1.5 },
  profileSectionItemList: {
    overflow: "hidden",
    border: `1px solid ${line}`,
    borderRadius: "10px",
    backgroundColor: "#ffffff",
  },
  profileSectionItem: {
    minHeight: "58px",
    borderBottom: `1px solid ${line}`,
    "&:last-child": { borderBottom: "none" },
  },
  profileSectionPrimaryButton: {
    color: accentDark,
    backgroundColor: accentSoft,
    border: "1px solid #ead6bd",
    borderRadius: "7px",
    fontWeight: 700,
    "&:hover": { color: "#704621", backgroundColor: "#f6e8d8" },
    "&:focus-visible": { boxShadow: focusRing },
  },
  profileSectionButtonGroup: { gap: "8px" },
  avatarImageActionsUpload: {
    color: accentDark,
    backgroundColor: accentSoft,
    border: "1px solid #ead6bd",
    borderRadius: "7px",
    "&:hover": { backgroundColor: "#f6e8d8" },
    "&:focus-visible": { boxShadow: focusRing },
  },
  avatarImageActionsRemove: {
    color: danger,
    borderRadius: "7px",
    "&:hover": { backgroundColor: dangerSoft },
    "&:focus-visible": { boxShadow: focusRing },
  },
  activeDeviceListItem: {
    border: `1px solid ${line}`,
    borderRadius: "10px",
    backgroundColor: "#ffffff",
  },
  activeDeviceIcon: { color: muted },
  tableHead: { backgroundColor: paperRaised },
  tableRow: { borderBottom: `1px solid ${line}` },
  tableHeaderCell: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: "10px",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: muted,
  },
  tableBodyCell: { color: ink },
  menuButton: {
    color: muted,
    borderRadius: "7px",
    "&:hover": { color: ink, backgroundColor: paper },
    "&:focus-visible": { boxShadow: focusRing },
  },
  menuList: {
    backgroundColor: "#ffffff",
    border: `1px solid ${line}`,
    borderRadius: "10px",
    boxShadow: "0 14px 32px -18px rgba(28,25,23,.35)",
  },
  menuItem: {
    color: ink,
    borderRadius: "7px",
    "&:hover": { backgroundColor: paper },
    "&:focus-visible": { boxShadow: focusRing },
  },
  drawerBackdrop: {
    backgroundColor: "rgba(28,25,23,.52)",
    backdropFilter: "blur(2px)",
  },
  drawerContent: {
    backgroundColor: "#ffffff",
    borderLeft: `1px solid ${line}`,
    boxShadow: modalShadow,
  },
  drawerHeader: { borderBottom: `1px solid ${line}` },
  drawerTitle: { color: ink, fontWeight: 700 },
  drawerClose: {
    color: muted,
    borderRadius: "999px",
    "&:hover": { color: ink, backgroundColor: paper },
    "&:focus-visible": { boxShadow: focusRing },
  },
  footer: { display: "none" },
} as const;

export const clerkAuthAppearance = { variables, elements: authElements } as const;
export const clerkUserButtonAppearance = { variables, elements: userButtonElements } as const;
export const clerkUserProfileAppearance = { variables, elements: userProfileElements } as const;

export const clerkAppearance = {
  variables,
  elements: sharedElements,
  signIn: clerkAuthAppearance,
  signUp: clerkAuthAppearance,
  userButton: clerkUserButtonAppearance,
  userProfile: clerkUserProfileAppearance,
  userVerification: clerkAuthAppearance,
} satisfies ClerkAppearance;

export default clerkAppearance;
