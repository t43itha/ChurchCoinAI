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
  onSignIn: () => void;
  onGetStarted: (plan?: "starter" | "growing" | "thriving") => void;
  onBookDemo: () => void;
}

export default function LandingPage({ onSignIn, onGetStarted, onBookDemo }: LandingPageProps) {
  return (
    <div className="bg-paper min-h-screen text-ink selection:bg-amber-light selection:text-amber-dark">
      {/* Background grid */}
      <LedgerGridBackground />

      {/* Navigation */}
      <Navigation onSignIn={onSignIn} onGetStarted={() => onGetStarted()} />

      {/* Main content */}
      <main>
        <Hero onGetStarted={() => onGetStarted()} onBookDemo={onBookDemo} />
        <TrustMetrics />
        <Testimonials />
        <ProblemSection />
        <TransformationJourney />
        <Features />
        <Pricing onGetStarted={onGetStarted} />
        <FAQ />
        <SecondaryCTA onGetStarted={() => onGetStarted()} onBookDemo={onBookDemo} />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
