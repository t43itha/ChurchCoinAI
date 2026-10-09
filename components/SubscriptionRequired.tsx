import { can, type UserRole } from "../lib/permissions";
import { useEffect, useMemo, useState, type FC } from "react";
import { useAction, useQuery } from "convex/react";
import { UserButton } from "@clerk/clerk-react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  Crown,
  Loader2,
  LifeBuoy,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import { notify } from "../lib/notifications";
import {
  clerkUserButtonAppearance,
  clerkUserProfileAppearance,
} from "@/lib/clerkAppearance";
import type { PlanTier } from "../lib/onboardingIntent";
import { createClientAttemptId } from "../lib/clientId";
import { PLANS } from "../lib/plans";
import { btnLg, btnMd, btnOutline, btnPrimary, screenTitle } from "./wizard/ui";

// Sheet-style panels for the blocking states, built from the walkthrough kit.
const sheetCard = "mx-auto max-w-lg rounded-2xl border border-ledger bg-white p-8 text-center";
const actionBtn = `${btnPrimary} ${btnMd} !w-auto px-5`;
const secondaryBtn = `${btnOutline} ${btnMd} !w-auto px-5`;

interface SubscriptionRequiredProps {
  organizationName: string;
  userRole: UserRole;
  selectedPlan?: PlanTier;
  accessState: string;
  accessReason?: string;
  onOpenSupport: () => void;
}

const SubscriptionRequired: FC<SubscriptionRequiredProps> = ({
  organizationName,
  userRole,
  selectedPlan,
  accessState,
  accessReason,
  onOpenSupport,
}) => {
  const createCheckout = useAction(api.actions.stripe.createCheckoutSession);
  const reconcileCheckout = useAction(api.actions.stripe.reconcileCheckoutSession);
  const createPortal = useAction(api.actions.stripe.createPortalSession);
  const subscription = useQuery(api.queries.subscriptions.current);
  const [loading, setLoading] = useState<PlanTier | null>(null);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [processingTimedOut, setProcessingTimedOut] = useState(false);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const returnedFromCheckout = params.get("subscription") === "success";
  const checkoutSessionId = params.get("session_id");
  const checkoutCancelled = params.get("subscription") === "cancelled";
  const isProcessing = returnedFromCheckout || accessState === "payment_processing";
  const trialExpired = accessReason === "product_trial_expired";

  useEffect(() => {
    if (!isProcessing) return;
    const timer = window.setTimeout(() => setProcessingTimedOut(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [isProcessing]);

  useEffect(() => {
    if (!returnedFromCheckout || !checkoutSessionId || !can(userRole, "billing.manage")) return;
    const timer = window.setTimeout(() => {
      void reconcileCheckout({ sessionId: checkoutSessionId }).catch((error) => {
        console.error("Checkout reconciliation failed:", error);
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [checkoutSessionId, reconcileCheckout, returnedFromCheckout, userRole]);

  const clearCheckoutResult = () => {
    const next = new URL(window.location.href);
    next.searchParams.delete("subscription");
    next.searchParams.delete("session_id");
    window.history.replaceState({}, "", `${next.pathname}${next.search}${next.hash}`);
    window.location.reload();
  };

  const handleSubscribe = async (planId: PlanTier) => {
    setLoading(planId);
    setCheckoutError(null);
    try {
      const attemptId = createClientAttemptId();
      const result = await createCheckout({
        plan: planId,
        attemptId,
        successUrl: `${window.location.origin}?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}?subscription=cancelled`,
      });

      if (!result?.url) throw new Error("Stripe did not return a checkout URL");
      window.location.assign(result.url);
    } catch (error) {
      console.error("Failed to create checkout:", error);
      setCheckoutError(
        error instanceof Error ? error.message : "Checkout could not be started. Please try again."
      );
      notify(
        "Checkout unavailable",
        error instanceof Error ? error.message : "Please try again."
      );
      setLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setIsPortalLoading(true);
    try {
      const result = await createPortal({ returnUrl: window.location.href });
      window.location.assign(result.url);
    } catch (error) {
      notify(
        "Billing portal unavailable",
        error instanceof Error ? error.message : "Please try again."
      );
      setIsPortalLoading(false);
    }
  };

  const header = (
    <header className="border-b border-ledger bg-white/90 backdrop-blur-xs">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/ChurchCoin-Variation 01-transparent-s.png"
            alt="ChurchCoin Finance Platform"
            className="h-14"
          />
          <p className="text-xs text-grey-mid border-l border-ledger pl-3">{organizationName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSupport}
            className={`${btnOutline} h-11 !w-auto gap-2 px-3 text-xs`}
          >
            <LifeBuoy size={14} />
            <span className="hidden sm:inline">Help & feedback</span>
          </button>
          <UserButton
            afterSignOutUrl="/"
            appearance={clerkUserButtonAppearance}
            userProfileProps={{ appearance: clerkUserProfileAppearance }}
          />
        </div>
      </div>
    </header>
  );

  if (accessState === "demo_provisioning" || accessState === "demo_expired") {
    const expired = accessState === "demo_expired";
    return (
      <div className="min-h-screen bg-paper flex flex-col">
        {header}
        <main className="grid flex-1 place-items-center p-6">
          <div className={sheetCard}>
            {expired ? (
              <Clock3 size={34} className="mx-auto text-amber mb-5" />
            ) : (
              <Loader2 size={34} className="mx-auto text-sage animate-spin mb-5" />
            )}
            <h1 className={screenTitle}>
              {expired ? "This demo has expired" : "Preparing your demo church"}
            </h1>
            <p className="mt-3 text-sm text-grey-mid leading-relaxed">
              {expired
                ? "Contact ChurchCoin to arrange a fresh demonstration or create a clean production church. Synthetic financial data is never converted into live records."
                : "We are loading a fictional ledger, donors, funds, and transactions. Refresh shortly if this screen does not update automatically."}
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="min-h-screen bg-paper flex flex-col">
        {header}
        <main className="grid flex-1 place-items-center p-6">
          <div className={sheetCard}>
            <Loader2 size={36} className="mx-auto text-sage animate-spin mb-5" />
            <h1 className={screenTitle}>Confirming your subscription</h1>
            <p className="mt-3 text-sm text-grey-mid leading-relaxed">
              Stripe has returned you to ChurchCoin. Access will open after the signed billing event is verified.
            </p>
            {processingTimedOut && (
              <div className="mt-6 space-y-3">
                <p className="text-xs text-amber-dark">
                  This is taking longer than expected. Your payment has not been charged again.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <button type="button" onClick={() => window.location.reload()} className={actionBtn}>
                    <RefreshCw size={14} aria-hidden="true" /> Check again
                  </button>
                  <button type="button" onClick={clearCheckoutResult} className={secondaryBtn}>Return to plans</button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (!can(userRole, "billing.manage")) {
    return (
      <div className="min-h-screen bg-paper flex flex-col">
        {header}
        <main className="grid flex-1 place-items-center p-6">
          <div className={sheetCard}>
            <AlertTriangle size={34} className="mx-auto text-amber mb-5" />
            <h1 className={screenTitle}>Billing action required</h1>
            <p className="mt-3 text-sm text-grey-mid leading-relaxed">
              {trialExpired
                ? <>The free trial for <strong>{organizationName}</strong> has ended. Ask an organisation administrator to choose a plan.</>
                : <>An administrator for <strong>{organizationName}</strong> needs to choose a plan or restore billing before members can continue.</>}
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (
    subscription &&
    ["past_due", "unpaid", "paused"].includes(subscription.status)
  ) {
    return (
      <div className="min-h-screen bg-paper flex flex-col">
        {header}
        <main className="grid flex-1 place-items-center p-6">
          <div className={sheetCard}>
            <AlertTriangle size={36} className="mx-auto text-amber mb-5" />
            <h1 className={screenTitle}>Restore your subscription</h1>
            <p className="mt-3 text-sm text-grey-mid leading-relaxed">
              The subscription for <strong>{organizationName}</strong> is {subscription.status.replace("_", " ")}. Open Stripe to update the payment method or settle the outstanding invoice.
            </p>
            <button
              type="button"
              onClick={handleManageBilling}
              disabled={isPortalLoading}
              className={`${actionBtn} mt-6`}
            >
              {isPortalLoading ? <Loader2 size={15} className="animate-spin" /> : <Crown size={15} />}
              Manage billing
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {header}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-5xl w-full">
          <div className="text-center mb-10">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-5 ${
              trialExpired ? "bg-amber-light text-amber-dark" : "bg-sage-light text-sage-dark"
            }`}>
              {trialExpired ? <Clock3 size={16} /> : <Crown size={16} />}
              {trialExpired ? "Your 14-day trial is complete" : "Your church ledger is ready"}
            </div>
            <h1 className="mb-4 text-3xl font-bold tracking-tight text-ink md:text-4xl">
              {trialExpired ? "Keep ChurchCoin working for your church" : "Choose a plan to continue"}
            </h1>
            <p className="text-grey-dark max-w-2xl mx-auto">
              {trialExpired
                ? <>Choose a plan for <strong>{organizationName}</strong> to restore access. Your records are safe and waiting.</>
                : <>Confirm a plan for <strong>{organizationName}</strong>. Payment is handled securely by Stripe.</>}
            </p>
            {checkoutCancelled && (
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-amber-dark bg-amber-light px-4 py-2 rounded-lg">
                <AlertTriangle size={15} /> Checkout was cancelled. No subscription was started.
              </p>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {PLANS.map((plan) => {
              const isLoading = loading === plan.id;
              const preferred = selectedPlan === plan.id || (!selectedPlan && plan.popular);
              return (
                <div
                  key={plan.id}
                  className={`relative p-6 border rounded-xl transition-all bg-white ${
                    preferred ? "border-ink shadow-soft-lg" : "border-ledger hover:border-grey-mid"
                  }`}
                >
                  {preferred && (
                    <div className="absolute -top-3 left-4 bg-ink text-white px-3 py-1 text-[10px] uppercase tracking-wide font-bold flex items-center gap-1">
                      <Sparkles size={10} /> {selectedPlan ? "Your selection" : "Recommended"}
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-ink mb-1">{plan.name}</h3>
                  <p className="text-xs text-grey-mid mb-4 min-h-8">{plan.description}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-ink font-mono">£{plan.price}</span>
                    <span className="text-grey-mid text-sm">/month</span>
                  </div>
                  <ul className="space-y-3 mb-6 min-h-28">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check size={16} className="text-sage-dark shrink-0 mt-0.5" />
                        <span className="text-grey-dark">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={loading !== null}
                    className={`${preferred ? btnPrimary : btnOutline} ${btnLg}`}
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <>Continue <ArrowRight size={14} aria-hidden="true" /></>}
                  </button>
                </div>
              );
            })}
          </div>
          {checkoutError && (
            <div className="max-w-2xl mx-auto mb-6 border border-error/40 bg-error-light text-error px-4 py-3 rounded-lg text-sm text-center">
              {checkoutError}
            </div>
          )}
          <p className="text-center text-xs text-grey-mid">
            All prices exclude VAT. Secure subscription payment via Stripe.
          </p>
        </div>
      </main>
    </div>
  );
};

export default SubscriptionRequired;
