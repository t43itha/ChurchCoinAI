import React, { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { UserButton } from "@clerk/clerk-react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  Crown,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import { notify } from "../lib/notifications";
import { clerkAppearance } from "@/lib/clerkAppearance";
import type { PlanTier } from "../lib/onboardingIntent";
import { createClientAttemptId } from "../lib/clientId";

interface PlanConfig {
  id: PlanTier;
  name: string;
  price: number;
  description: string;
  features: string[];
  popular?: boolean;
}

const PLANS: PlanConfig[] = [
  {
    id: "starter",
    name: "Starter",
    price: 29,
    description: "Perfect for small churches just getting organised",
    features: ["Up to 50 donors", "3 funds", "Gift Aid tracking", "Monthly reports"],
  },
  {
    id: "growing",
    name: "Growing",
    price: 59,
    description: "For established churches ready to scale",
    features: ["Up to 200 donors", "Unlimited funds", "AI categorisation", "Trustee reports"],
    popular: true,
  },
  {
    id: "thriving",
    name: "Thriving",
    price: 99,
    description: "For multi-site churches and complex needs",
    features: ["Unlimited donors", "Multi-site support", "Custom integrations", "Dedicated support"],
  },
];

interface SubscriptionRequiredProps {
  organizationName: string;
  userRole: string;
  selectedPlan?: PlanTier;
  accessState: string;
}

const SubscriptionRequired: React.FC<SubscriptionRequiredProps> = ({
  organizationName,
  userRole,
  selectedPlan,
  accessState,
}) => {
  const createCheckout = useAction(api.actions.stripe.createCheckoutSession);
  const reconcileCheckout = useAction(api.actions.stripe.reconcileCheckoutSession);
  const createPortal = useAction(api.actions.stripe.createPortalSession);
  const subscription = useQuery(api.queries.subscriptions.current);
  const [loading, setLoading] = useState<PlanTier | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [processingTimedOut, setProcessingTimedOut] = useState(false);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const returnedFromCheckout = params.get("subscription") === "success";
  const checkoutSessionId = params.get("session_id");
  const checkoutCancelled = params.get("subscription") === "cancelled";
  const isProcessing = returnedFromCheckout || accessState === "payment_processing";

  useEffect(() => {
    if (!isProcessing) return;
    const timer = window.setTimeout(() => setProcessingTimedOut(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [isProcessing]);

  useEffect(() => {
    if (!returnedFromCheckout || !checkoutSessionId || userRole !== "Admin") return;
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
    setLoading("starter");
    try {
      const result = await createPortal({ returnUrl: window.location.href });
      window.location.assign(result.url);
    } catch (error) {
      notify(
        "Billing portal unavailable",
        error instanceof Error ? error.message : "Please try again."
      );
      setLoading(null);
    }
  };

  const header = (
    <header className="border-b border-ledger bg-white/90 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/ChurchCoin-Variation 01-transparent-s.png"
            alt="ChurchCoin Finance Platform"
            className="h-14"
          />
          <p className="text-xs text-grey-mid border-l border-ledger pl-3">{organizationName}</p>
        </div>
        <UserButton afterSignOutUrl="/" appearance={clerkAppearance} />
      </div>
    </header>
  );

  if (accessState === "demo_provisioning" || accessState === "demo_expired") {
    const expired = accessState === "demo_expired";
    return (
      <div className="min-h-screen bg-paper flex flex-col">
        {header}
        <main className="flex-1 grid place-items-center p-6">
          <div className="swiss-card-static max-w-lg p-8 text-center">
            {expired ? (
              <Clock3 size={34} className="mx-auto text-amber mb-5" />
            ) : (
              <Loader2 size={34} className="mx-auto text-sage animate-spin mb-5" />
            )}
            <h1 className="text-2xl font-bold text-ink">
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
        <main className="flex-1 grid place-items-center p-6">
          <div className="swiss-card-static max-w-lg p-8 text-center">
            <Loader2 size={36} className="mx-auto text-sage animate-spin mb-5" />
            <h1 className="text-2xl font-bold text-ink">Confirming your subscription</h1>
            <p className="mt-3 text-sm text-grey-mid leading-relaxed">
              Stripe has returned you to ChurchCoin. Access will open after the signed billing event is verified.
            </p>
            {processingTimedOut && (
              <div className="mt-6 space-y-3">
                <p className="text-xs text-amber-dark">
                  This is taking longer than expected. Your payment has not been charged again.
                </p>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => window.location.reload()} className="btn-primary inline-flex items-center gap-2">
                    <RefreshCw size={14} /> Check again
                  </button>
                  <button onClick={clearCheckoutResult} className="btn-secondary">Return to plans</button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (userRole !== "Admin") {
    return (
      <div className="min-h-screen bg-paper flex flex-col">
        {header}
        <main className="flex-1 grid place-items-center p-6">
          <div className="swiss-card-static max-w-lg p-8 text-center">
            <AlertTriangle size={34} className="mx-auto text-amber mb-5" />
            <h1 className="text-2xl font-bold text-ink">Billing action required</h1>
            <p className="mt-3 text-sm text-grey-mid leading-relaxed">
              An administrator for <strong>{organizationName}</strong> needs to choose a plan or restore billing before members can continue.
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
        <main className="flex-1 grid place-items-center p-6">
          <div className="swiss-card-static max-w-lg p-8 text-center">
            <AlertTriangle size={36} className="mx-auto text-amber mb-5" />
            <h1 className="text-2xl font-bold text-ink">Restore your subscription</h1>
            <p className="mt-3 text-sm text-grey-mid leading-relaxed">
              The subscription for <strong>{organizationName}</strong> is {subscription.status.replace("_", " ")}. Open Stripe to update the payment method or settle the outstanding invoice.
            </p>
            <button
              onClick={handleManageBilling}
              disabled={loading !== null}
              className="btn-primary mt-6 inline-flex items-center gap-2"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Crown size={15} />}
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
            <div className="inline-flex items-center gap-2 bg-sage-light text-sage-dark px-4 py-2 rounded-full text-sm font-medium mb-5">
              <Crown size={16} /> Your church ledger is ready
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-ink tracking-tight mb-4">
              Choose a plan to continue
            </h1>
            <p className="text-grey-dark max-w-2xl mx-auto">
              Confirm a plan for <strong>{organizationName}</strong>. Payment is handled securely by Stripe.
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
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={loading !== null}
                    className={`w-full py-3 rounded text-sm font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${
                      preferred
                        ? "bg-ink text-white hover:bg-charcoal"
                        : "bg-white border border-ledger text-grey-dark hover:border-ink"
                    } disabled:opacity-50`}
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={16} /> : <>Continue <ArrowRight size={14} /></>}
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
