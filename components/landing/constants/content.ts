// Landing Page Content Data - Matches churchcoin.co.uk exactly

import type { LandingContent } from "./types";

export const landingContent: LandingContent = {
  hero: {
    eyebrow: "Built by treasurers",
    headline: "Stop chasing spreadsheets. Start growing",
    highlightedWord: "ministry.",
    subheadline:
      "The AI-powered finance platform that saves church treasurers 15 hours monthly. Join 500+ UK churches who've already made the switch.",
    primaryCta: "Get Started",
    secondaryCta: "Book a Demo",
    trustBadge: "10-minute setup • Cancel anytime • Secure payments via Stripe",
  },

  heroCard: {
    balance: 127450,
    income: 8240,
    expenses: 3120,
    giftAid: 1240,
  },

  progressBars: [
    { color: "#000000", baseWidth: 75, variance: 8, duration: 3 },
    { color: "#6b8e6b", baseWidth: 50, variance: 12, duration: 4 },
    { color: "#d4a574", baseWidth: 25, variance: 10, duration: 3.5 },
  ],

  trustMetrics: [
    { value: "500+", label: "UK churches trust ChurchCoin" },
    { value: "£2.3M", label: "Gift Aid recovered for our churches" },
    { value: "7,500", label: "Hours saved monthly across all users" },
    { value: "99.9%", label: "Uptime reliability" },
  ],

  testimonials: [
    {
      id: "1",
      quote:
        "I used to dread month-end. Now it takes me 20 minutes instead of an entire Saturday. ChurchCoin has genuinely given me my weekends back.",
      author: "Sarah Thompson",
      role: "Treasurer",
      church: "St. Michael's Parish, Bristol",
      result: "Saved 12 hours monthly",
    },
    {
      id: "2",
      quote:
        "We recovered £3,200 in Gift Aid that we'd been missing for years. The automated claims alone paid for the subscription 10x over.",
      author: "David Chen",
      role: "Church Administrator",
      church: "Grace Community Church, Manchester",
      result: "£3,200 Gift Aid recovered",
    },
    {
      id: "3",
      quote:
        "Our trustees finally have the clarity they need. The reports are professional, compliant, and I don't have to build them from scratch anymore.",
      author: "Margaret Williams",
      role: "Finance Lead",
      church: "Hope Baptist Church, Leeds",
      result: "100% Charity Commission compliant",
    },
  ],

  problems: [
    {
      stat: "15+ hours",
      description: "Lost to manual data entry every month",
      impact:
        "Time that could be spent on pastoral care, not spreadsheet wrestling.",
    },
    {
      stat: "£2,500",
      description: "Average unclaimed Gift Aid annually",
      impact:
        "Money that belongs to your ministry, sitting with HMRC instead.",
    },
    {
      stat: "73%",
      description: "Of church treasurers worry about compliance",
      impact:
        "Sleepless nights over Charity Commission requirements that feel like a maze.",
    },
  ],

  transformation: [
    {
      timeframe: "Day 1",
      title: "See all your funds on one dashboard",
      description:
        "Import your existing data in 10 minutes. Finally see your complete financial picture.",
    },
    {
      timeframe: "Week 2",
      title: "Submit your first automated Gift Aid claim",
      description:
        "Watch ChurchCoin validate declarations and prepare your HMRC submission.",
    },
    {
      timeframe: "Month 3",
      title: "Trustees receive their first automated report",
      description:
        "Professional, compliant reports generated with one click. No more late-night spreadsheet panic.",
    },
    {
      timeframe: "Year 1",
      title: "Focus on ministry, not administration",
      description:
        "180 hours saved. Thousands in Gift Aid recovered. Zero compliance worries.",
    },
  ],

  features: [
    {
      id: "fund-management",
      title: "Fund Management",
      description:
        "Automatically separate general, restricted, and designated funds. See real-time balances and never worry about compliance again.",
      icon: "Wallet",
      benefits: [
        "Auto-fund separation",
        "Real-time balance tracking",
        "Visual fund dashboards",
        "Restriction compliance alerts",
      ],
    },
    {
      id: "gift-aid",
      title: "Gift Aid Automation",
      description:
        "Digital donor declarations, automatic eligibility checking, and 2-click HMRC submissions. Recover every penny you're owed.",
      icon: "Gift",
      benefits: [
        "Digital declarations",
        "2-click HMRC claims",
        "Auto-validation",
        "Recovery tracking",
      ],
    },
    {
      id: "reporting",
      title: "Smart Reporting",
      description:
        "AI-generated reports that your trustees will actually understand. Annual accounts in hours, not weeks.",
      icon: "FileText",
      benefits: [
        "One-click trustee reports",
        "Annual accounts generator",
        "Budget variance analysis",
        "Trend insights",
      ],
    },
    {
      id: "donor-insights",
      title: "Donor Insights",
      description:
        "Understand your giving patterns without the complexity. See who's engaged, who's lapsed, and predict seasonal trends.",
      icon: "Users",
      benefits: [
        "Giving history tracking",
        "Seasonal predictions",
        "Retention metrics",
        "GDPR compliant",
      ],
    },
  ],

  pricing: [
    {
      id: "starter",
      name: "Starter",
      price: 29,
      period: "month",
      description: "Perfect for small churches just getting organised",
      features: [
        "Up to 50 donors",
        "3 funds",
        "Basic Gift Aid tracking",
        "Monthly reports",
        "Email support",
      ],
      cta: "Get Started",
    },
    {
      id: "growing",
      name: "Growing",
      price: 59,
      period: "month",
      description: "For established churches ready to scale",
      features: [
        "Up to 200 donors",
        "Unlimited funds",
        "Full Gift Aid automation",
        "AI categorisation",
        "Trustee reports",
        "Priority support",
      ],
      highlighted: true,
      cta: "Get Started",
    },
    {
      id: "thriving",
      name: "Thriving",
      price: 99,
      period: "month",
      description: "For multi-site churches and complex needs",
      features: [
        "Unlimited donors",
        "Multi-site support",
        "API access",
        "Custom integrations",
        "Dedicated support",
        "Training sessions",
      ],
      cta: "Contact Sales",
    },
  ],

  faq: [
    {
      question: "How long does it take to get started?",
      answer:
        "Most churches are up and running within 10 minutes. Simply create an account, connect your bank or import your data, and ChurchCoin's AI will automatically categorise your transactions.",
    },
    {
      question: "Is my data secure?",
      answer:
        "Absolutely. We use bank-level encryption (AES-256) and are fully GDPR compliant. Your data is stored in UK data centres and we never share your information with third parties.",
    },
    {
      question: "Do you offer training?",
      answer:
        "Yes! All plans include access to our help centre with video tutorials and guides. Growing and Thriving plans include live onboarding sessions and priority support.",
    },
    {
      question: "Can I export my data if I need to leave?",
      answer:
        "Of course. Your data belongs to you. Export everything at any time in standard formats (CSV, PDF) with no restrictions or fees.",
    },
    {
      question: "What about bank integration?",
      answer:
        "ChurchCoin supports direct bank feeds from most UK banks, or you can import transactions via CSV. Our AI automatically categorises and reconciles your transactions.",
    },
  ],

  footer: [
    {
      title: "Product",
      links: [
        { label: "Features", href: "#features" },
        { label: "Pricing", href: "#pricing" },
        { label: "Demo", href: "#" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Help Centre", href: "#" },
        { label: "Blog", href: "#" },
        { label: "Guides", href: "#" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "#" },
        { label: "Contact", href: "#" },
        { label: "Privacy", href: "#" },
        { label: "Terms", href: "#" },
      ],
    },
  ],
};

// Navigation items
export const navItems = ["Features", "Pricing", "Testimonials", "FAQ"];

// Secondary CTA content
export const secondaryCTAContent = {
  headline: "Ready to give your treasurer their weekends back?",
  subheadline: "Join 500+ UK churches who've already made the switch.",
  primaryCta: "Get Started",
  secondaryCta: "Book a Demo",
  trustText: "10-minute setup • Cancel anytime • Secure payments via Stripe",
};
