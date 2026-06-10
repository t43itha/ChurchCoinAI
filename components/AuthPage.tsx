import React, { useState } from "react";
import { SignIn, SignUp } from "@clerk/clerk-react";
import { ArrowLeft } from "lucide-react";

interface AuthPageProps {
  onBack?: () => void;
}

// Refined Ledger design system appearance for Clerk components.
export const clerkAppearance = {
  variables: {
    colorPrimary: "#1c1917",
    colorBackground: "#ffffff",
    colorText: "#1c1917",
    colorTextSecondary: "#78716c",
    colorInputBackground: "#ffffff",
    colorInputText: "#1c1917",
    colorSuccess: "#557555",
    colorDanger: "#b53d3d",
    colorTextOnPrimaryBackground: "#ffffff",
    borderRadius: "8px",
    fontFamily: '"DM Sans", system-ui, sans-serif',
    fontFamilyButtons: '"DM Sans", system-ui, sans-serif',
    fontSize: "14.5px",
  },
  elements: {
    rootBox: {
      width: "100%",
    },
    card: {
      backgroundColor: "#ffffff",
      border: "1px solid #e7e5e1",
      borderRadius: "12px",
      boxShadow:
        "0 1px 2px rgba(28,25,23,.04), 0 18px 40px -28px rgba(28,25,23,.25)",
    },
    headerTitle: {
      fontFamily: '"DM Sans", sans-serif',
      fontWeight: 700,
      letterSpacing: "-0.02em",
      color: "#1c1917",
    },
    headerSubtitle: {
      color: "#78716c",
    },
    formButtonPrimary: {
      backgroundColor: "#1c1917",
      color: "#ffffff",
      fontWeight: 600,
      textTransform: "none",
      border: "none",
      borderRadius: "8px",
      boxShadow: "none",
      transition:
        "transform .15s ease, box-shadow .15s ease, background .15s ease",
      "&:hover": {
        backgroundColor: "#2a2522",
        boxShadow: "0 8px 18px -10px rgba(28,25,23,.65)",
        transform: "translateY(-1px)",
      },
      "&:active": { transform: "translateY(0)", boxShadow: "none" },
    },
    formFieldInput: {
      backgroundColor: "#ffffff",
      border: "1px solid #e7e5e1",
      borderRadius: "8px",
      color: "#1c1917",
      "&:focus": {
        borderColor: "#1c1917",
        boxShadow: "0 0 0 3px rgba(28,25,23,.08)",
      },
      "&::placeholder": { color: "#a8a29e" },
    },
    formFieldLabel: {
      color: "#78716c",
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "10.5px",
      fontWeight: 500,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
    },
    footerActionLink: {
      color: "#a9743f",
      fontWeight: 600,
      "&:hover": {
        color: "#8c5d31",
      },
    },
    formFieldAction: {
      color: "#a9743f",
      fontWeight: 600,
      "&:hover": {
        color: "#8c5d31",
      },
    },
    socialButtonsBlockButton: {
      backgroundColor: "#ffffff",
      border: "1px solid #e7e5e1",
      borderRadius: "8px",
      color: "#1c1917",
      "&:hover": {
        backgroundColor: "#fcfbfa",
        borderColor: "#c9c5be",
      },
    },
    socialButtonsBlockButtonText: { fontWeight: 500, color: "#1c1917" },
    dividerLine: {
      backgroundColor: "#e7e5e1",
    },
    dividerText: {
      color: "#a8a29e",
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "10px",
      letterSpacing: "0.18em",
      textTransform: "uppercase",
    },
    identityPreview: {
      backgroundColor: "#faf9f7",
      border: "1px solid #e7e5e1",
      borderRadius: "8px",
    },
    identityPreviewText: {
      color: "#1c1917",
    },
    identityPreviewEditButton: {
      color: "#a9743f",
      "&:hover": {
        color: "#8c5d31",
      },
    },
    formResendCodeLink: {
      color: "#a9743f",
      "&:hover": {
        color: "#8c5d31",
      },
    },
    otpCodeFieldInput: {
      border: "1px solid #e7e5e1",
      borderRadius: "8px",
      color: "#1c1917",
      "&:focus": {
        borderColor: "#1c1917",
        boxShadow: "0 0 0 3px rgba(28,25,23,.08)",
      },
    },
    avatarBox: { borderRadius: "999px" },
    userButtonAvatarBox: {
      width: "38px",
      height: "38px",
      boxShadow: "0 0 0 3px #fff, 0 0 0 4px #cfe0cf",
    },
    userButtonPopoverCard: {
      borderRadius: "12px",
      border: "1px solid #e7e5e1",
      boxShadow: "0 16px 40px -16px rgba(28,25,23,.28)",
    },
    userButtonPopoverActionButton: {
      color: "#1c1917",
      "&:hover": {
        backgroundColor: "#f7f6f4",
      },
    },
    userButtonPopoverActionButtonIcon: {
      color: "#78716c",
    },
    userButtonPopoverFooter: {
      display: "none",
    },
    navbar: {
      backgroundColor: "#fcfbfa",
      borderRight: "1px solid #e7e5e1",
    },
    navbarButton: {
      color: "#78716c",
      borderRadius: "8px",
      "&[data-active='true'], &:hover": {
        color: "#a9743f",
        backgroundColor: "#faf2e9",
      },
    },
    profileSectionTitleText: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "10.5px",
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "#78716c",
    },
    badge: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "9.5px",
      fontWeight: 700,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: "#557555",
      backgroundColor: "#eef3ee",
      border: "1px solid #cfe0cf",
      borderRadius: "5px",
    },
  },
};

// Dark branded panel for the sign-in split layout (Refined Ledger).
const BrandPanel: React.FC = () => (
  <div className="relative hidden lg:flex w-[380px] shrink-0 flex-col overflow-hidden bg-[#1c1917] text-white px-10 py-11">
    {/* faint ledger grid */}
    <div
      className="pointer-events-none absolute inset-0 opacity-5"
      style={{
        backgroundImage:
          "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
        backgroundSize: "34px 34px",
      }}
    />
    {/* accent rule */}
    <div className="absolute left-0 top-11 bottom-11 w-[3px] bg-[#a9743f]" />

    <div className="relative z-10">
      <img
        src="/churchcoin-logo-lg.png"
        alt="ChurchCoin"
        className="h-[42px] w-auto brightness-0 invert"
      />
    </div>

    <div className="relative z-10 mt-auto">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#c79a5f] mb-[18px]">
        Church Finance Platform
      </div>
      <h2 className="text-[28px] leading-[1.18] font-bold tracking-tight m-0">
        Faithful stewardship,
        <br />
        by the numbers.
      </h2>
      <p className="mt-4 max-w-[280px] text-[14.5px] leading-relaxed text-white/60">
        Reconcile giving, track restricted funds, and close the month with
        confidence.
      </p>
    </div>
  </div>
);

export const AuthPage: React.FC<AuthPageProps> = ({ onBack }) => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div className="min-h-screen bg-paper flex">
      {mode === "signin" && <BrandPanel />}

      <div
        className="relative flex flex-1 flex-col items-center justify-center p-4"
        style={
          mode === "signup"
            ? {
                backgroundImage:
                  "radial-gradient(rgba(28,25,23,.045) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }
            : undefined
        }
      >
        {/* Back to landing page button */}
        {onBack && (
          <button
            onClick={onBack}
            className="absolute top-6 left-6 flex items-center gap-2 text-sm text-grey-mid hover:text-ink transition-colors"
          >
            <ArrowLeft size={16} />
            Back to home
          </button>
        )}

        <div className="w-full max-w-md">
          <div className={`mb-8 flex justify-center ${mode === "signin" ? "lg:hidden" : ""}`}>
            <img
              src="/churchcoin-logo-lg.png"
              alt="ChurchCoin"
              className="h-[42px] w-auto"
            />
          </div>
          {mode === "signin" ? (
            <SignIn
              appearance={clerkAppearance}
              routing="hash"
              signUpUrl="#signup"
            />
          ) : (
            <SignUp
              appearance={clerkAppearance}
              routing="hash"
              signInUrl="#signin"
            />
          )}

          <div className="mt-4 text-center">
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-sm text-grey-mid hover:text-ink transition-colors"
            >
              {mode === "signin"
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </div>

        <div className="mt-12 text-center text-xs text-grey-mid">
          <p>Secure church finance management</p>
          <p className="mt-1">Built with Convex & Clerk</p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
