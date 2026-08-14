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
    name: "Core",
    price: 19,
    description: "For churches with under £100k annual income and straightforward finances",
    features: [
      "Restricted and designated funds",
      "AI transaction categorisation",
      "Gift Aid records and schedules",
      "Monthly and annual reports",
      "Standard data exports",
      "Self-service support",
    ],
  },
  {
    id: "growing",
    name: "Standard",
    price: 29,
    description: "For churches with £100k–£500k annual income and more to manage",
    features: [
      "Everything in Core",
      "Human approval workflow",
      "Connected bank accounts",
      "Trustee-ready reports",
      "One onboarding session",
      "Standard support",
    ],
    popular: true,
  },
  {
    id: "thriving",
    name: "Plus",
    price: 49,
    description: "For churches with £500k–£1m annual income and greater support needs",
    features: [
      "Everything in Standard",
      "More connected bank accounts",
      "Advanced permissions",
      "Assisted onboarding",
      "Training sessions",
      "Priority support",
    ],
  },
];

export const getPlanName = (plan?: PlanTier | null) =>
  PLANS.find((candidate) => candidate.id === plan)?.name ?? null;
