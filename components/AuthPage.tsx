import React, { useState } from "react";
import { SignIn, SignUp } from "@clerk/clerk-react";

export const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-display font-bold text-slate-800 mb-2">
          ChurchCoin
        </h1>
        <p className="text-slate-500 text-sm">Swiss Ledger for Church Finance</p>
      </div>

      <div className="w-full max-w-md">
        {mode === "signin" ? (
          <SignIn
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "swiss-card shadow-none border border-slate-200",
                headerTitle: "font-display text-slate-800",
                headerSubtitle: "text-slate-500",
                formButtonPrimary: "btn-primary",
                formFieldInput:
                  "border-slate-200 focus:ring-slate-900 focus:border-slate-900",
                footerActionLink: "text-slate-800 hover:text-slate-600",
              },
            }}
            routing="hash"
            signUpUrl="#signup"
          />
        ) : (
          <SignUp
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "swiss-card shadow-none border border-slate-200",
                headerTitle: "font-display text-slate-800",
                headerSubtitle: "text-slate-500",
                formButtonPrimary: "btn-primary",
                formFieldInput:
                  "border-slate-200 focus:ring-slate-900 focus:border-slate-900",
                footerActionLink: "text-slate-800 hover:text-slate-600",
              },
            }}
            routing="hash"
            signInUrl="#signin"
          />
        )}

        <div className="mt-4 text-center">
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            {mode === "signin"
              ? "Don't have an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>

      <div className="mt-12 text-center text-xs text-slate-400">
        <p>Secure church finance management</p>
        <p className="mt-1">Built with Convex & Clerk</p>
      </div>
    </div>
  );
};

export default AuthPage;
