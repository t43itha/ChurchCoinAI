import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import {
  ArrowRight,
  Building2,
  User,
  Sparkles,
  Command,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface OnboardingProps {
  clerkUser: {
    firstName?: string | null;
    lastName?: string | null;
    emailAddresses?: { emailAddress: string }[];
    fullName?: string | null;
  } | null;
  onComplete: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ clerkUser, onComplete }) => {
  const [step, setStep] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from Clerk user if available
  const defaultName =
    clerkUser?.fullName ||
    `${clerkUser?.firstName || ""} ${clerkUser?.lastName || ""}`.trim() ||
    "";
  const defaultEmail = clerkUser?.emailAddresses?.[0]?.emailAddress || "";

  // Form State
  const [userName, setUserName] = useState(defaultName);
  const [userEmail, setUserEmail] = useState(defaultEmail);
  const [orgName, setOrgName] = useState("");
  const [orgCharityNum, setOrgCharityNum] = useState("");

  // Convex mutation
  const createOrganization = useMutation(api.mutations.organizations.create);

  const handleNext = () => {
    setIsAnimating(true);
    setTimeout(() => {
      setStep((prev) => prev + 1);
      setIsAnimating(false);
    }, 300);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await createOrganization({
        name: orgName,
        charityNumber: orgCharityNum || undefined,
        reportingPeriod: "tax_year",
        userName: userName,
        userEmail: userEmail,
      });

      setIsAnimating(true);
      setTimeout(() => {
        onComplete();
      }, 600);
    } catch (err) {
      console.error("Onboarding error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create organization"
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCF8] flex flex-col items-center justify-center p-4">
      {/* Brand Header */}
      <div className="mb-8 flex items-center gap-3 animate-enter">
        <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center rounded-xl shadow-xl shadow-slate-200">
          <Command size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold font-display tracking-tight leading-none text-slate-900">
            ChurchCoin
          </h1>
          <p className="text-[10px] font-mono text-slate-400 mt-1 uppercase tracking-wider">
            Finance OS
          </p>
        </div>
      </div>

      <div
        className={`w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden transition-all duration-300 transform ${isAnimating ? "scale-95 opacity-50" : "scale-100 opacity-100"}`}
      >
        {/* Progress Bar */}
        <div className="h-1 bg-slate-50 w-full flex">
          <div
            className={`h-full bg-slate-900 transition-all duration-500 ease-out`}
            style={{ width: step === 1 ? "50%" : "100%" }}
          ></div>
        </div>

        <div className="p-8">
          {step === 1 && (
            <div className="space-y-6 animate-enter">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold font-display text-slate-900">
                  Welcome, Treasurer.
                </h2>
                <p className="text-slate-500 text-sm">
                  Let's confirm your administrator profile.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <User
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-all placeholder-slate-400"
                      placeholder="e.g. Sarah Jones"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-all placeholder-slate-400"
                    placeholder="name@church.org"
                    disabled={!!defaultEmail}
                  />
                  {defaultEmail && (
                    <p className="text-xs text-slate-400 mt-1">
                      Using your signed-in email address
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={handleNext}
                disabled={!userName || !userEmail}
                className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
              >
                Continue{" "}
                <ArrowRight
                  size={16}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-enter">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold font-display text-slate-900">
                  Your Organization
                </h2>
                <p className="text-slate-500 text-sm">
                  Create your digital ledger identity.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    Organization Name
                  </label>
                  <div className="relative">
                    <Building2
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-all placeholder-slate-400"
                      placeholder="e.g. St Mary's Church"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    Charity Number{" "}
                    <span className="text-slate-400 font-normal normal-case">
                      (Optional)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={orgCharityNum}
                    onChange={(e) => setOrgCharityNum(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-all placeholder-slate-400 font-mono"
                    placeholder="12345678"
                  />
                </div>

                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="flex items-start gap-3">
                    <CheckCircle2
                      size={16}
                      className="text-emerald-600 mt-0.5 shrink-0"
                    />
                    <div>
                      <h3 className="text-sm font-bold text-slate-700">
                        Ready to Go
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Your organization will be created with a General Fund
                        and standard UK charity categories.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  disabled={isSubmitting}
                  className="px-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-slate-50 transition-all disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!orgName || isSubmitting}
                  className="flex-1 py-3 bg-slate-900 text-white rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Create Ledger{" "}
                      <Sparkles size={16} className="text-orange-300" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="mt-8 text-xs text-slate-400 font-medium">
        Secure. Private. Intelligent.
      </p>
    </div>
  );
};

export default Onboarding;
