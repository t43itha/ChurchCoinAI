import React, { useState } from "react";
import { SignIn, SignUp } from "@clerk/clerk-react";
import { ArrowLeft } from "lucide-react";

interface AuthPageProps {
  onBack?: () => void;
}

// Swiss Ledger design system appearance for Clerk components
const clerkAppearance = {
  variables: {
    colorPrimary: "#000000",
    colorBackground: "#fafaf9",
    colorText: "#000000",
    colorTextSecondary: "#666666",
    colorInputBackground: "#ffffff",
    colorInputText: "#000000",
    colorDanger: "#c64545",
    borderRadius: "8px",
    fontFamily: '"DM Sans", sans-serif',
  },
  elements: {
    rootBox: {
      width: "100%",
    },
    card: {
      backgroundColor: "#fafaf9",
      border: "2px solid #000000",
      borderRadius: "8px",
      boxShadow: "none",
    },
    headerTitle: {
      fontFamily: '"JetBrains Mono", monospace',
      fontWeight: 700,
      color: "#000000",
    },
    headerSubtitle: {
      color: "#666666",
    },
    formButtonPrimary: {
      backgroundColor: "#000000",
      color: "#ffffff",
      fontWeight: 600,
      border: "none",
      borderRadius: "8px",
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: "#1a1a1a",
        boxShadow: "4px 4px 0px 0px #d4a574",
        transform: "translate(-2px, -2px)",
      },
    },
    formFieldInput: {
      backgroundColor: "#ffffff",
      border: "1px solid #e5e5e5",
      borderRadius: "6px",
      "&:focus": {
        borderColor: "#000000",
        boxShadow: "0 0 0 1px #000000",
      },
    },
    formFieldLabel: {
      color: "#000000",
      fontWeight: 500,
    },
    footerActionLink: {
      color: "#000000",
      fontWeight: 500,
      "&:hover": {
        color: "#44403c",
      },
    },
    socialButtonsBlockButton: {
      backgroundColor: "#ffffff",
      border: "1px solid #e5e5e5",
      borderRadius: "8px",
      "&:hover": {
        backgroundColor: "#f5f5f5",
        borderColor: "#000000",
      },
    },
    dividerLine: {
      backgroundColor: "#e5e5e5",
    },
    dividerText: {
      color: "#666666",
    },
    identityPreview: {
      backgroundColor: "#f5f5f5",
      border: "1px solid #e5e5e5",
      borderRadius: "8px",
    },
    identityPreviewText: {
      color: "#000000",
    },
    identityPreviewEditButton: {
      color: "#000000",
      "&:hover": {
        color: "#44403c",
      },
    },
    formResendCodeLink: {
      color: "#000000",
      "&:hover": {
        color: "#44403c",
      },
    },
    otpCodeFieldInput: {
      border: "1px solid #e5e5e5",
      borderRadius: "6px",
      "&:focus": {
        borderColor: "#000000",
        boxShadow: "0 0 0 1px #000000",
      },
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
