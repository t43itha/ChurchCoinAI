import { useState, type FC } from 'react';
import { useQuery, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import { createClientAttemptId } from '../lib/clientId';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { notify } from '../lib/notifications';
import { PLANS } from '../lib/plans';
import type { PlanTier } from '../lib/onboardingIntent';
import { getTrialProgress } from '../lib/trial';
import WizardFrame from './wizard/WizardFrame';
import StepFooter from './wizard/StepFooter';
import { btnLg, btnOutline, btnPrimary, card, eyebrow, screenHelp, screenTitle, tagAmber, tagGrey, tagSage } from './wizard/ui';

interface BillingSettingsProps {
  onClose: () => void;
}

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// Plan, payment and renewal. Checkout and the billing portal leave the app for Stripe and come back.
const BillingSettings: FC<BillingSettingsProps> = ({ onClose }) => {
  const subscription = useQuery(api.queries.subscriptions.current);
  const access = useQuery(api.queries.subscriptions.access);
  const createCheckout = useAction(api.actions.stripe.createCheckoutSession);
  const createPortal = useAction(api.actions.stripe.createPortalSession);

  const [loading, setLoading] = useState<string | null>(null);

  const isProductTrial = access?.state === 'active_trial';
  const currentTier = subscription?.plan || access?.plan || null;
  const status = subscription?.status || 'none';
  const isActive = status === 'active' || status === 'trialing';
  const isPastDue = status === 'past_due';
  const checkoutCancelled = new URLSearchParams(window.location.search).get('subscription') === 'cancelled';
  const currentPlan = PLANS.find((plan) => plan.id === currentTier);

  const handleSubscribe = async (plan: PlanTier) => {
    setLoading(plan);
    try {
      const result = await createCheckout({
        plan,
        attemptId: createClientAttemptId(),
        successUrl: `${window.location.origin}?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/settings?tab=billing&subscription=cancelled`,
      });

      if (result?.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      console.error('Failed to create checkout:', error);
      notify('Error', 'Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setLoading('portal');
    try {
      const result = await createPortal({
        returnUrl: window.location.href,
      });

      if (result?.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      console.error('Failed to open billing portal:', error);
      notify('Error', 'Failed to open billing portal. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const loadingState = subscription === undefined || access === undefined;
  const planHeading = subscription ? 'Change plan' : isProductTrial ? 'Upgrade your trial' : 'Choose a plan';

  return (
    <WizardFrame
      ariaLabel="Plan and billing"
      title="Plan and billing"
      onClose={onClose}
      footer={
        subscription && !loadingState ? (
          <StepFooter>
            <button type="button" onClick={handleManageBilling} disabled={loading === 'portal'} className={`${btnOutline} ${btnLg}`}>
              {loading === 'portal' ? <Loader2 className="animate-spin" size={15} aria-hidden="true" /> : null}
              Manage billing in Stripe
            </button>
          </StepFooter>
        ) : undefined
      }
    >
      {loadingState ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="animate-spin text-grey-mid" size={24} aria-label="Loading" />
        </div>
      ) : (
        <>
          <h2 className={screenTitle}>Plan and billing</h2>
          <p className={screenHelp}>Billing is handled by Stripe. Card details never reach ChurchCoin.</p>

          {checkoutCancelled && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#e4d0b5] bg-amber-light px-4 py-3 text-sm text-amber-dark">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-bold">Checkout cancelled</p>
                <p className="mt-0.5 text-xs">No subscription was started and your remaining trial access is unchanged.</p>
              </div>
            </div>
          )}

          {isProductTrial && access?.expiresAt && (() => {
            const progress = getTrialProgress(access.expiresAt);
            return (
              <div className="mb-4 rounded-2xl border border-[#e4d0b5] bg-[#fcf7f0] p-4">
                <p className={eyebrow}>Free trial</p>
                <p className="mt-1 text-[15px] font-bold text-ink">
                  Day {progress.dayNumber} of 14 · {progress.daysLeft === 0 ? 'ends today' : `${progress.daysLeft} ${progress.daysLeft === 1 ? 'day' : 'days'} left`}
                </p>
                <p className="mt-1 text-xs text-grey-mid">Choose a plan below. Billing starts after secure Stripe checkout.</p>
              </div>
            );
          })()}

          {subscription && (
            <div className={`${card} mb-4`}>
              {isPastDue && (
                <div className="mb-3 flex items-start gap-3 rounded-2xl border border-[#eccaca] bg-error-light p-3.5">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold text-error">Payment failed</p>
                    <p className="mt-1 text-xs text-[#8a3434]">Update your payment method to keep using every feature.</p>
                  </div>
                </div>
              )}

              {subscription.cancelAtPeriodEnd && (
                <p className="mb-3 rounded-2xl border border-[#ecd8bd] bg-[#fcf7f0] px-3.5 py-3 text-xs leading-relaxed text-[#7a5a30]">
                  <strong>Cancellation scheduled:</strong> Your subscription ends on {formatDate(subscription.currentPeriodEnd)}.
                </p>
              )}

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={eyebrow}>Current plan</p>
                  <p className="mt-1 text-[15px] font-bold text-ink">{currentPlan?.name || 'No active plan'}</p>
                </div>
                <span className={isPastDue ? tagAmber : isActive ? tagSage : tagGrey}>{status.replace('_', ' ')}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className={eyebrow}>Monthly</p>
                  <p className="mt-1 font-mono text-[15px] font-bold text-ink">£{currentPlan?.price || 0}</p>
                </div>
                <div>
                  <p className={eyebrow}>Next billing date</p>
                  <p className="mt-1 text-sm text-ink">{formatDate(subscription.currentPeriodEnd)}</p>
                </div>
              </div>
            </div>
          )}

          <h3 className="mb-2.5 mt-6 text-[15px] font-bold text-ink">{planHeading}</h3>
          <p className="mb-3 text-xs text-grey-mid">
            {subscription
              ? 'Upgrade or downgrade at any time.'
              : isProductTrial
                ? 'Pick a plan to keep your church ledger active after the trial.'
                : 'Pick a plan to get started with ChurchCoin.'}
          </p>

          <div className="grid gap-3">
            {PLANS.map((plan) => {
              const isCurrent = Boolean(subscription) && currentTier === plan.id;
              const isLoading = loading === plan.id;
              const label = isCurrent
                ? 'Current plan'
                : subscription
                  ? 'Switch to this plan'
                  : isProductTrial
                    ? `Upgrade to ${plan.name}`
                    : 'Get started';

              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl border bg-white p-4 ${
                    isCurrent ? 'border-sage' : plan.popular ? 'border-ink' : 'border-ledger'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-[15px] font-bold text-ink">{plan.name}</h4>
                      <p className="mt-0.5 text-xs leading-relaxed text-grey-mid">{plan.description}</p>
                    </div>
                    <p className="shrink-0 font-mono text-[18px] font-bold text-ink">
                      £{plan.price}
                      <span className="text-xs font-normal text-grey-mid">/mo</span>
                    </p>
                  </div>

                  <ul className="mt-3 grid gap-1.5">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-grey-dark">
                        <Check size={14} className="mt-0.5 shrink-0 text-sage" aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={isCurrent || isLoading || loading !== null}
                    className={`${plan.popular && !isCurrent ? btnPrimary : btnOutline} mt-4 h-[46px] text-sm`}
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : label}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="mt-5 text-center text-xs text-grey-mid">
            Prices exclude VAT. Registered charities may be exempt. Cancel any time.
          </p>
        </>
      )}
    </WizardFrame>
  );
};

export default BillingSettings;
