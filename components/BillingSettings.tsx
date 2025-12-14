import React, { useState } from 'react';
import { useQuery, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import { CreditCard, ExternalLink, AlertTriangle, Check, Loader2, Sparkles, Crown } from 'lucide-react';

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
      alert('Failed to start checkout. Please try again.');
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
      alert('Failed to open billing portal. Please try again.');
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
        <div className={`swiss-card overflow-hidden ${isPastDue ? 'border-amber-300' : ''}`}>
          <div className="p-6 border-b border-ledger flex justify-between items-center bg-paper/50">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isPastDue ? 'bg-amber-100 text-amber-600' : 'bg-sage-light text-sage-dark'
              }`}>
                {isPastDue ? <AlertTriangle size={16} /> : <Crown size={16} />}
              </div>
              <div>
                <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Current Plan</h3>
                <p className="text-[10px] text-grey-mid">
                  {PLANS.find(p => p.id === currentTier)?.name || 'No active plan'} • {' '}
                  <span className={`font-bold ${isActive ? 'text-sage-dark' : isPastDue ? 'text-amber-600' : 'text-grey-mid'}`}>
                    {status.replace('_', ' ').toUpperCase()}
                  </span>
                </p>
              </div>
            </div>
            {subscription && (
              <button
                onClick={handleManageBilling}
                disabled={loading === 'portal'}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-ledger text-grey-dark hover:border-grey-mid hover:text-ink rounded text-xs font-bold uppercase tracking-wide transition-colors shadow-sm"
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
              <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-900">Payment Failed</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Please update your payment method to continue using premium features.
                  </p>
                </div>
              </div>
            )}

            {subscription.cancelAtPeriodEnd && (
              <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-xs text-orange-900">
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
                <p className="text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Monthly Price</p>
                <p className="text-2xl font-bold text-ink font-mono">
                  £{PLANS.find(p => p.id === currentTier)?.price || 0}
                  <span className="text-sm text-grey-mid font-normal">/month</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Next Billing Date</p>
                <p className="text-sm font-medium text-grey-dark">
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
      <div className="swiss-card overflow-hidden">
        <div className="p-6 border-b border-ledger bg-paper/50">
          <h3 className="font-bold text-ink text-sm uppercase tracking-wide">
            {subscription ? 'Change Plan' : 'Choose a Plan'}
          </h3>
          <p className="text-[10px] text-grey-mid mt-1">
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
                  className={`relative p-6 border-2 rounded-lg transition-all ${
                    plan.popular
                      ? 'border-ink bg-paper shadow-[4px_4px_0px_#1a1a1a]'
                      : isCurrent
                      ? 'border-sage bg-sage-light/30'
                      : 'border-ledger bg-white hover:border-grey-mid'
                  }`}
                >
                  {/* Popular badge */}
                  {plan.popular && (
                    <div className="absolute -top-3 left-4 bg-ink text-white px-3 py-1 text-[10px] uppercase tracking-wide font-bold flex items-center gap-1">
                      <Sparkles size={10} /> Most Popular
                    </div>
                  )}

                  {/* Current badge */}
                  {isCurrent && (
                    <div className="absolute -top-3 right-4 bg-sage text-white px-3 py-1 text-[10px] uppercase tracking-wide font-bold">
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
