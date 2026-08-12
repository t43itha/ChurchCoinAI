import type { PlanTier } from "./onboardingIntent";

export interface PlanConfig {
  id: PlanTier;
  name: string;
  price: number;
  description: string;
  features: string[];
  popular?: boolean;
}

export const PLANS: PlanConfig[] = [
  {
    id: "starter",
    name: "Starter",
    price: 29,
    description: "Perfect for small churches just getting organised",
    features: [
      "Up to 50 donors",
      "3 funds",
      "Basic Gift Aid tracking",
      "Monthly reports",
      "Email support",
    ],
  },
  {
    id: "growing",
    name: "Growing",
    price: 59,
    description: "For established churches ready to scale",
    features: [
      "Up to 200 donors",
      "Unlimited funds",
      "Full Gift Aid automation",
      "AI categorisation",
      "Trustee reports",
      "Priority support",
    ],
    popular: true,
  },
  {
    id: "thriving",
    name: "Thriving",
    price: 99,
    description: "For multi-site churches and complex needs",
    features: [
      "Unlimited donors",
      "Multi-site support",
      "API access",
      "Custom integrations",
      "Dedicated support",
      "Training sessions",
    ],
  },
];

export const getPlanName = (plan?: PlanTier | null) =>
  PLANS.find((candidate) => candidate.id === plan)?.name ?? null;
