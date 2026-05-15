import React from "react";

type LegalPageProps = {
  type: "privacy" | "terms";
};

const updatedAt = "15 May 2026";

const sections = {
  privacy: {
    title: "Privacy Policy",
    intro:
      "ChurchCoinAI is a financial management platform for UK churches. This policy explains how we handle personal data when you use the service.",
    items: [
      {
        heading: "Data we process",
        body:
          "We process account profile details, church and organisation records, donor and pledge records entered by authorised users, transaction data, reporting data, support messages, and technical usage data needed to operate and secure the service.",
      },
      {
        heading: "Banking data",
        body:
          "When an authorised user connects a bank account, ChurchCoinAI uses Enable Banking to request read-only account and transaction access. We do not receive or store online banking passwords. Imported transactions are shown for manual review before they are added to the ledger.",
      },
      {
        heading: "How data is used",
        body:
          "We use data to provide fund accounting, donor management, transaction categorisation, reporting, subscription billing, support, security monitoring, and service improvement.",
      },
      {
        heading: "Processors",
        body:
          "The service uses trusted processors including Convex for application data hosting, Clerk for authentication, Stripe for subscription billing, Enable Banking for open banking connectivity, and AI providers for categorisation features where enabled.",
      },
      {
        heading: "Retention and control",
        body:
          "Organisation administrators control the records held in the service. Data is retained while the organisation account is active and for a reasonable period afterwards where needed for security, legal, accounting, or backup purposes.",
      },
      {
        heading: "Contact",
        body:
          "For privacy or data protection requests, contact the ChurchCoinAI administrator responsible for your organisation or email the service operator at the data protection contact supplied during onboarding.",
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    intro:
      "These terms govern use of ChurchCoinAI. By using the service, you agree to use it responsibly and only for organisations you are authorised to manage.",
    items: [
      {
        heading: "Authorised use",
        body:
          "You must only access data for churches or organisations where you have permission to act. You are responsible for keeping your login secure and for ensuring user roles are assigned appropriately.",
      },
      {
        heading: "Financial records",
        body:
          "ChurchCoinAI helps organise financial information, but it does not replace professional accounting, tax, legal, or charity compliance advice. Users remain responsible for reviewing imported transactions, reports, and filings before relying on them.",
      },
      {
        heading: "Bank connections",
        body:
          "Bank connections are read-only and require explicit user consent through Enable Banking. You may disconnect a bank connection or allow consent to expire. Transaction sync is manual and reviewed before import.",
      },
      {
        heading: "Subscriptions",
        body:
          "Paid plans, billing, renewals, and cancellations are handled through Stripe. Access to paid functionality may depend on the organisation's subscription status.",
      },
      {
        heading: "Availability and changes",
        body:
          "We aim to keep the service reliable, but availability is not guaranteed. Features may be changed, improved, or withdrawn as the product evolves.",
      },
      {
        heading: "Acceptable use",
        body:
          "You must not misuse the service, attempt unauthorised access, upload unlawful material, interfere with the platform, or use it in a way that breaches applicable law or third-party rights.",
      },
    ],
  },
} as const;

export default function LegalPage({ type }: LegalPageProps) {
  const content = sections[type];

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-ledger bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <a href="/" className="inline-flex items-center">
            <img
              src="/ChurchCoin-Variation 01-transparent-s.png"
              alt="ChurchCoin Finance Platform"
              className="h-11"
            />
          </a>
          <a
            href="/"
            className="text-xs font-bold uppercase tracking-wide text-grey-dark hover:text-ink"
          >
            Back to home
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-grey-mid">
          Last updated {updatedAt}
        </p>
        <h1 className="mb-5 text-4xl font-bold tracking-normal text-ink">
          {content.title}
        </h1>
        <p className="mb-10 max-w-3xl text-base leading-7 text-grey-dark">
          {content.intro}
        </p>

        <div className="space-y-7">
          {content.items.map((item) => (
            <section key={item.heading} className="border-t border-ledger pt-6">
              <h2 className="mb-2 text-lg font-bold text-ink">{item.heading}</h2>
              <p className="text-sm leading-7 text-grey-dark">{item.body}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
