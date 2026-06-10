import React, { useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import { UserButton } from '@clerk/clerk-react';
import { Check, Loader2, Sparkles, Crown, ArrowRight } from 'lucide-react';
import { notify } from '../lib/notifications';
import { clerkAppearance } from '@/lib/clerkAppearance';

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

interface SubscriptionRequiredProps {
  organizationName: string;
}

const SubscriptionRequired: React.FC<SubscriptionRequiredProps> = ({ organizationName }) => {
  const createCheckout = useAction(api.actions.stripe.createCheckoutSession);
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubscribe = async (planId: 'starter' | 'growing' | 'thriving') => {
    setLoading(planId);
    try {
      const result = await createCheckout({
        plan: planId,
        successUrl: `${window.location.origin}?subscription=success`,
        cancelUrl: `${window.location.origin}?subscription=cancelled`,
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

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Header */}
      <header className="border-b border-ledger bg-white/80 backdrop-blur-sm sticky top-0 z-10">
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

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-5xl w-full">
          {/* Welcome Message */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-sage-light text-sage-dark px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Crown size={16} />
              Welcome to ChurchCoin
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-ink tracking-tight mb-4">
              Choose your plan to get started
            </h1>
            <p className="text-grey-dark text-lg max-w-2xl mx-auto">
              Your organisation <strong>{organizationName}</strong> is ready.
              Select a plan below to unlock all features and start managing your finances.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {PLANS.map((plan) => {
              const isLoading = loading === plan.id;

              return (
                <div
                  key={plan.id}
                  className={`relative p-6 border rounded-xl transition-all ${
                    plan.popular
                      ? 'border-ink bg-white shadow-soft-lg'
                      : 'border-ledger bg-white hover:border-grey-mid'
                  }`}
                >
                  {/* Popular badge */}
                  {plan.popular && (
                    <div className="absolute -top-3 left-4 bg-ink text-white px-3 py-1 text-[10px] uppercase tracking-wide font-bold flex items-center gap-1">
                      <Sparkles size={10} /> Recommended
                    </div>
                  )}

                  <h3 className="text-xl font-bold text-ink mb-1">{plan.name}</h3>
                  <p className="text-xs text-grey-mid mb-4">{plan.description}</p>

                  <div className="mb-6">
                    <span className="text-4xl font-bold text-ink font-mono">£{plan.price}</span>
                    <span className="text-grey-mid text-sm">/month</span>
                  </div>

                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <Check size={16} className="text-sage-dark shrink-0 mt-0.5" />
                        <span className="text-grey-dark">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={isLoading || loading !== null}
                    className={`w-full py-3 rounded text-sm font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${
                      plan.popular
                        ? 'bg-ink text-white hover:bg-charcoal'
                        : 'bg-white border border-ledger text-grey-dark hover:border-ink hover:text-ink'
                    }`}
                  >
                    {isLoading ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <>
                        Get Started
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-grey-mid">
            All prices exclude VAT. Registered charities may be exempt. Secure payment via Stripe.
          </p>
        </div>
      </main>
    </div>
  );
};

export default SubscriptionRequired;
