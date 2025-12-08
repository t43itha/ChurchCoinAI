// LandingPage - Main orchestrator component

import { LedgerGridBackground } from "./shared";
import {
  Navigation,
  Hero,
  TrustMetrics,
  Testimonials,
  ProblemSection,
  TransformationJourney,
  Features,
  Pricing,
  FAQ,
  SecondaryCTA,
  Footer,
} from "./sections";

interface LandingPageProps {
  onGetStarted: () => void;
}

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="bg-paper min-h-screen text-ink selection:bg-amber-light selection:text-amber-dark">
      {/* Background grid */}
      <LedgerGridBackground />

      {/* Navigation */}
      <Navigation onSignIn={onGetStarted} onGetStarted={onGetStarted} />

      {/* Main content */}
      <main>
        <Hero onGetStarted={onGetStarted} />
        <TrustMetrics />
        <Testimonials />
        <ProblemSection />
        <TransformationJourney />
        <Features />
        <Pricing onGetStarted={onGetStarted} />
        <FAQ />
        <SecondaryCTA onGetStarted={onGetStarted} />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
