import React, { useState } from 'react';
import { useQuery, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import { CreditCard, ExternalLink, AlertTriangle, Check, Loader2, Sparkles, Crown } from 'lucide-react';
import { notify } from '../lib/notifications';

// Plan configurations
interface PlanConfig {
  id: 'starter' | 'growing' | 'thriving';
  name: string;
  price: number;
  description: string;
  features: string[];
  popular?: boolean;
}

const PLANS: PlanConfig[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 29,
    description: 'Perfect for small churches just getting organised',
    features: [
      'Up to 50 donors',
      '3 funds',
      'Basic Gift Aid tracking',
      'Monthly reports',
      'Email support',
    ],
  },
  {
    id: 'growing',
    name: 'Growing',
    price: 59,
    description: 'For established churches ready to scale',
    features: [
      'Up to 200 donors',
      'Unlimited funds',
      'Full Gift Aid automation',
      'AI categorisation',
      'Trustee reports',
      'Priority support',
    ],
    popular: true,
  },
  {
    id: 'thriving',
    name: 'Thriving',
    price: 99,
    description: 'For multi-site churches and complex needs',
    features: [
      'Unlimited donors',
      'Multi-site support',
      'API access',
      'Custom integrations',
      'Dedicated support',
      'Training sessions',
    ],
  },
];

type PlanId = PlanConfig['id'];

const BillingSettings: React.FC = () => {
  const subscription = useQuery(api.queries.subscriptions.current);
  const createCheckout = useAction(api.actions.stripe.createCheckoutSession);
  const createPortal = useAction(api.actions.stripe.createPortalSession);

  const [loading, setLoading] = useState<string | null>(null);

  const currentTier = subscription?.plan || null;
  const status = subscription?.status || 'none';
  const isActive = status === 'active';
  const isPastDue = status === 'past_due';

  const handleSubscribe = async (plan: PlanId) => {
    setLoading(plan);
    try {
      const result = await createCheckout({
        plan,
        successUrl: `${window.location.origin}?tab=settings&billing=success`,
        cancelUrl: `${window.location.origin}?tab=settings`,
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

  // Loading state
  if (subscription === undefined) {
    return (
      <div className="swiss-card p-8 flex items-center justify-center">
        <Loader2 className="animate-spin text-grey-mid" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Subscription Status */}
      {subscription && (
        <div className={`swiss-card-static overflow-hidden ${isPastDue ? 'border-[#ecd8bd]' : ''}`}>
          <div className="flex items-center justify-between gap-4 px-6 py-[18px] border-b border-grey-light bg-[#fcfbf9]">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center justify-center w-[34px] h-[34px] rounded-[9px] border border-ledger shrink-0 ${
                isPastDue ? 'bg-amber-light text-amber' : 'bg-white text-grey-dark'
              }`}>
                {isPastDue ? <AlertTriangle size={16} strokeWidth={1.9} /> : <Crown size={16} strokeWidth={1.9} />}
              </span>
              <div>
                <h3 className="text-[13.5px] font-bold text-ink uppercase tracking-[0.02em]">Current Plan</h3>
                <p className="text-[11.5px] text-grey-mid mt-0.5">
                  {PLANS.find(p => p.id === currentTier)?.name || 'No active plan'} • {' '}
                  <span className={`font-bold ${isActive ? 'text-sage-dark' : isPastDue ? 'text-amber' : 'text-grey-mid'}`}>
                    {status.replace('_', ' ').toUpperCase()}
                  </span>
                </p>
              </div>
            </div>
            {subscription && (
              <button
                onClick={handleManageBilling}
                disabled={loading === 'portal'}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[9px] bg-white border border-ledger text-grey-dark text-xs font-bold uppercase tracking-[0.04em] hover:border-grey-mid hover:text-ink transition-colors disabled:opacity-50"
              >
                {loading === 'portal' ? (
                  <Loader2 className="animate-spin" size={12} />
                ) : (
                  <CreditCard size={12} />
                )}
                Manage Billing
                <ExternalLink size={10} />
              </button>
            )}
          </div>

          <div className="p-6">
            {isPastDue && (
              <div className="mb-4 px-3.5 py-3 bg-error-light border border-[#eccaca] rounded-[10px] flex items-start gap-3">
                <AlertTriangle size={16} className="text-error mt-0.5 shrink-0" strokeWidth={1.9} />
                <div>
                  <p className="text-sm font-bold text-error">Payment Failed</p>
                  <p className="text-xs text-[#8a3434] mt-1">
                    Please update your payment method to continue using premium features.
                  </p>
                </div>
              </div>
            )}

            {subscription.cancelAtPeriodEnd && (
              <div className="mb-4 bg-[#fcf7f0] border border-[#ecd8bd] rounded-[10px] px-3.5 py-[11px]">
                <p className="text-xs text-[#7a5a30] leading-relaxed">
                  <strong>Cancellation scheduled:</strong> Your subscription will end on{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-[10.5px] font-bold text-grey-mid uppercase tracking-[0.08em] mb-1.5">Monthly Price</p>
                <p className="text-2xl font-bold text-ink font-mono tracking-tight">
                  £{PLANS.find(p => p.id === currentTier)?.price || 0}
                  <span className="text-sm text-grey-mid font-normal">/month</span>
                </p>
              </div>
              <div>
                <p className="text-[10.5px] font-bold text-grey-mid uppercase tracking-[0.08em] mb-1.5">Next Billing Date</p>
                <p className="text-[14.5px] font-medium text-ink">
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Selection */}
      <div className="swiss-card-static overflow-hidden">
        <div className="px-6 py-[18px] border-b border-grey-light bg-[#fcfbf9]">
          <h3 className="text-[13.5px] font-bold text-ink uppercase tracking-[0.02em]">
            {subscription ? 'Change Plan' : 'Choose a Plan'}
          </h3>
          <p className="text-[11.5px] text-grey-mid mt-0.5">
            {subscription
              ? 'Upgrade or downgrade your subscription at any time.'
              : 'Select a plan to get started with ChurchCoin.'}
          </p>
        </div>

        <div className="p-6">
          <div className="grid md:grid-cols-3 gap-4">
            {PLANS.map((plan) => {
              const isCurrent = currentTier === plan.id;
              const isLoading = loading === plan.id;

              return (
                <div
                  key={plan.id}
                  className={`relative p-6 border rounded-xl transition-all ${
                    plan.popular
                      ? 'border-ink bg-white shadow-soft-lg'
                      : isCurrent
                      ? 'border-sage bg-sage-light/30'
                      : 'border-ledger bg-white hover:border-grey-mid'
                  }`}
                >
                  {/* Popular badge */}
                  {plan.popular && (
                    <div className="absolute -top-3 left-4 bg-ink text-white px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.05em] font-bold flex items-center gap-1">
                      <Sparkles size={10} /> Most Popular
                    </div>
                  )}

                  {/* Current badge */}
                  {isCurrent && (
                    <div className="absolute -top-3 right-4 bg-sage text-white px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.05em] font-bold">
                      Current
                    </div>
                  )}

                  <h4 className="text-lg font-bold text-ink mb-1">{plan.name}</h4>
                  <p className="text-xs text-grey-mid mb-4">{plan.description}</p>

                  <div className="mb-4">
                    <span className="text-3xl font-bold text-ink font-mono">£{plan.price}</span>
                    <span className="text-grey-mid text-sm">/month</span>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs">
                        <Check size={14} className="text-sage-dark shrink-0 mt-0.5" />
                        <span className="text-grey-dark">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={isCurrent || isLoading || loading !== null}
                    className={`w-full py-2.5 rounded text-xs font-bold uppercase tracking-wide transition-all ${
                      isCurrent
                        ? 'bg-grey-light text-grey-mid cursor-not-allowed'
                        : plan.popular
                        ? 'bg-ink text-white hover:bg-charcoal'
                        : 'bg-white border border-ledger text-grey-dark hover:border-ink hover:text-ink'
                    }`}
                  >
                    {isLoading ? (
                      <Loader2 className="animate-spin mx-auto" size={14} />
                    ) : isCurrent ? (
                      'Current Plan'
                    ) : subscription ? (
                      'Switch Plan'
                    ) : (
                      'Get Started'
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-[10px] text-grey-mid mt-6">
            All prices exclude VAT. Registered charities may be exempt. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
};

export default BillingSettings;
