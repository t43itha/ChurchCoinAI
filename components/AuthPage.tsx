import React, { useState } from "react";
import { SignIn, SignUp } from "@clerk/clerk-react";
import { ArrowLeft } from "lucide-react";

interface AuthPageProps {
  onBack?: () => void;
}

// Refined Ledger design system appearance for Clerk components
const clerkAppearance = {
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
  },
};

export const AuthPage: React.FC<AuthPageProps> = ({ onBack }) => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-4">
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
        <div className="mb-8 flex justify-center">
          <img
            src="/churchcoin-logo-lg.png"
            alt="ChurchCoin"
            className="h-16 w-auto"
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
  );
};

export default AuthPage;
