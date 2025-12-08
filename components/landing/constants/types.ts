// Landing Page TypeScript Types

export interface HeroContent {
  eyebrow: string;
  headline: string;
  highlightedWord: string;
  subheadline: string;
  primaryCta: string;
  secondaryCta: string;
  trustBadge: string;
}

export interface HeroCardStats {
  balance: number;
  income: number;
  expenses: number;
  giftAid: number;
}

export interface ProgressBarConfig {
  color: string;
  baseWidth: number;
  variance: number;
  duration: number;
}

export interface Testimonial {
  id: string;
  quote: string;
  author: string;
  role: string;
  church: string;
  result: string;
}

export interface Feature {
  id: string;
  title: string;
  description: string;
  icon: "Wallet" | "Gift" | "FileText" | "Users";
  benefits: string[];
}

export interface ProblemPoint {
  stat: string;
  description: string;
  impact: string;
}

export interface TransformationStep {
  timeframe: string;
  title: string;
  description: string;
}

export interface TrustMetric {
  value: string;
  label: string;
}

export interface PricingTier {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  cta: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export interface LandingContent {
  hero: HeroContent;
  heroCard: HeroCardStats;
  progressBars: ProgressBarConfig[];
  testimonials: Testimonial[];
  features: Feature[];
  problems: ProblemPoint[];
  transformation: TransformationStep[];
  trustMetrics: TrustMetric[];
  pricing: PricingTier[];
  faq: FAQ[];
  footer: FooterColumn[];
}
