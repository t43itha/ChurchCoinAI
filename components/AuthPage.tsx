import React, { useState } from "react";
import { SignIn, SignUp } from "@clerk/clerk-react";
import { ArrowLeft } from "lucide-react";
import { clerkAppearance } from "@/lib/clerkAppearance";

interface AuthPageProps {
  onBack?: () => void;
}


// Dark branded panel for the sign-in split layout (Refined Ledger).
const BrandPanel: React.FC = () => (
  <div className="relative hidden lg:flex w-[380px] shrink-0 flex-col overflow-hidden bg-ink text-white px-10 py-11">
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
    <div className="absolute left-0 top-11 bottom-11 w-[3px] bg-amber" />

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
