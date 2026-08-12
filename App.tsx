import React, { useCallback, useEffect, useState } from "react";
import { useUser, UserButton } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./convex/_generated/api";
import { ChurchDetails } from "./types";

// Components
import Sidebar from "./components/Sidebar";
import Onboarding from "./components/Onboarding";
import AuthPage from "./components/AuthPage";
import { clerkAppearance } from "./lib/clerkAppearance";
import LoadingSpinner from "./components/LoadingSpinner";
import LandingPage from "./components/landing/LandingPage";
import LegalPage from "./components/legal/LegalPage";
import SubscriptionRequired from "./components/SubscriptionRequired";
import AppContentRoutes from "./components/app/AppContentRoutes";
import AppNotificationToast, {
  AppNotification,
} from "./components/app/AppNotificationToast";
import { subscribeToNotifications } from "./lib/notifications";
import { getStoredInviteToken, storeInviteToken } from "./lib/inviteToken";
import { setMonitoringContext } from "./lib/monitoring";
import {
  clearOnboardingIntent,
  getOnboardingIntent,
  PlanTier,
  storeOnboardingIntent,
} from "./lib/onboardingIntent";

import { Menu } from "lucide-react";

function App() {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const isClerkCallback = /(?:^#\/?|\/)sso-callback(?:\/|$)/.test(
    location.hash
  );

  // Capture an invite token from the URL before auth so it survives the
  // Clerk sign-up flow; Onboarding picks it up from localStorage.
  const inviteParam = new URLSearchParams(location.search).get("invite");
  useEffect(() => {
    if (inviteParam) {
      storeInviteToken(inviteParam);
      const params = new URLSearchParams(location.search);
      params.delete("invite");
      navigate(
        { pathname: location.pathname, search: params.toString() },
        { replace: true }
      );
    }
  }, [inviteParam, location.pathname, location.search, navigate]);
  const hasStoredInvite = !!inviteParam || !!getStoredInviteToken();
  const publicLegalPage =
    location.pathname === "/privacy"
      ? "privacy"
      : location.pathname === "/terms"
        ? "terms"
        : null;

  // Convex queries - only run when signed in (pass "skip" to disable)
  // First, get the current user - this returns null for new users (no error)
  const currentUser = useQuery(
    api.queries.users.current,
    isSignedIn ? {} : "skip"
  );
  const organization = useQuery(
    api.queries.organizations.current,
    isSignedIn ? {} : "skip"
  );
  // These queries require a user to exist (use requireAuth), so only run them
  // AFTER we confirm currentUser exists (not null, not undefined)
  const hasUser = isSignedIn && currentUser !== undefined && currentUser !== null;
  const access = useQuery(
    api.queries.subscriptions.access,
    hasUser ? {} : "skip"
  );

  // Shared reference data used by every route. Route-specific data
  // (transactions, donors, pledges, users) is fetched inside each route.
  const hasAppAccess = access?.canUseApp === true;
  const funds = useQuery(api.queries.funds.list, hasAppAccess ? {} : "skip");
  const categories = useQuery(
    api.queries.categories.listWithDetails,
    hasAppAccess ? {} : "skip"
  );

  useEffect(() => {
    setMonitoringContext(
      clerkUser?.id ?? null,
      organization?._id ? String(organization._id) : null
    );
  }, [clerkUser?.id, organization?._id]);

  // UI State (local only)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notification, setNotification] = useState<AppNotification>({
    visible: false,
    title: "",
    message: "",
  });
  const [showAuth, setShowAuth] = useState(
    () => getOnboardingIntent() !== null || isClerkCallback
  );
  const [authMode, setAuthMode] = useState<"signin" | "signup">(
    () => getOnboardingIntent()?.authMode ?? "signin"
  );
  const [selectedPlan, setSelectedPlan] = useState<PlanTier | undefined>(
    () => getOnboardingIntent()?.selectedPlan
  );

  useEffect(() => {
    if (access?.canUseApp) {
      clearOnboardingIntent();
    }
  }, [access?.canUseApp]);

  const beginAuth = (mode: "signin" | "signup", plan?: PlanTier, source = "landing") => {
    storeOnboardingIntent({ authMode: mode, selectedPlan: plan, source });
    setAuthMode(mode);
    setSelectedPlan(plan);
    setShowAuth(true);
  };

  const bookDemo = () => {
    const bookingUrl = import.meta.env.VITE_DEMO_BOOKING_URL as string | undefined;
    if (bookingUrl) {
      window.open(bookingUrl, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.href = "mailto:hello@churchcoin.ai?subject=ChurchCoin%20demo%20request";
  };
  const showNotification = useCallback((title: string, message: string) => {
    setNotification({ visible: true, title, message });
    setTimeout(
      () => setNotification((prev) => ({ ...prev, visible: false })),
      6000
    );
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToNotifications(({ title, message }) => {
      showNotification(title, message);
    });
    return unsubscribe;
  }, [showNotification]);

  // All hooks must run before any conditional return (Rules of Hooks), so
  // the public legal pages are handled here rather than at the top.
  if (publicLegalPage) {
    return <LegalPage type={publicLegalPage} />;
  }

  // Show loading while Clerk initializes
  if (!isLoaded) {
    return <LoadingSpinner message="Initializing..." />;
  }

  // Show landing page or auth page if not signed in.
  // Invitees arriving via an invite link go straight to sign-up.
  if (!isSignedIn) {
    if (showAuth || hasStoredInvite || isClerkCallback) {
      return (
        <AuthPage
          initialMode={hasStoredInvite ? "signup" : authMode}
          onBack={() => setShowAuth(false)}
        />
      );
    }
    return (
      <LandingPage
        onSignIn={() => beginAuth("signin", undefined, "navigation")}
        onGetStarted={(plan) => beginAuth("signup", plan, plan ? "pricing" : "landing")}
        onBookDemo={bookDemo}
      />
    );
  }

  // Show loading while Convex fetches user data
  if (currentUser === undefined) {
    return <LoadingSpinner message="Loading your data..." />;
  }

  // Organization query can still be pending while user query has resolved
  if (organization === undefined) {
    return <LoadingSpinner message="Loading your organization..." />;
  }

  // Show onboarding if user has no organization
  if (currentUser === null || organization === null) {
    return (
      <Onboarding
        clerkUser={clerkUser}
        onComplete={(result) => {
          if (result === "invitation") {
            clearOnboardingIntent();
            setSelectedPlan(undefined);
          }
          // Convex automatically refetches after the membership mutation.
        }}
      />
    );
  }

  const currentOrganization = organization;

  if (access === undefined) {
    return <LoadingSpinner message="Checking organization access..." />;
  }

  if (access === null || !access.canUseApp) {
    return (
      <SubscriptionRequired
        organizationName={currentOrganization.name}
        userRole={currentUser.role}
        selectedPlan={selectedPlan}
        accessState={access?.state ?? "access_revoked"}
      />
    );
  }

  // Show loading while financial setup data loads.
  if (funds === undefined || categories === undefined) {
    return <LoadingSpinner message="Loading financial setup..." />;
  }

  // Map organization details for backwards compatibility
  const churchDetails: ChurchDetails = {
    name: currentOrganization.name,
    charityNumber: currentOrganization.charityNumber,
    address: currentOrganization.address,
    email: currentOrganization.email,
    website: currentOrganization.website,
    reportingPeriod: currentOrganization.reportingPeriod,
    logoUrl: currentOrganization.logoUrl,
  };

  return (
    <div className="flex bg-paper min-h-screen text-ink selection:bg-amber-light selection:text-amber-dark animate-enter relative">
      <AppNotificationToast
        notification={notification}
        onClose={() => setNotification((prev) => ({ ...prev, visible: false }))}
      />

      <Sidebar
        currentUser={currentUser}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      <main className="flex-1 md:ml-[248px] flex flex-col h-screen overflow-hidden">
        <header className="md:hidden flex items-center justify-between p-4 border-b border-ledger bg-paper/95 backdrop-blur-sm sticky top-0 z-10">
          <img
            src="/churchcoin-logo.png"
            alt="ChurchCoin Finance Platform"
            className="h-10 w-auto"
          />
          <div className="flex items-center gap-2">
            <UserButton afterSignOutUrl="/" appearance={clerkAppearance} />
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-grey-dark hover:bg-grey-light rounded-md"
              aria-label="Open navigation menu"
            >
              <Menu size={24} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-[30px]">
          {access.state === "active_demo" && (
            <div className="mb-4 border border-amber/50 bg-amber-light/40 text-amber-dark px-4 py-3 rounded-lg text-sm font-medium">
              Synthetic demo data — this church is fictional. Live bank connections and Stripe billing are disabled.
            </div>
          )}
          {access.state === "past_due_grace" && (
            <div className="mb-4 border border-error/40 bg-error-light text-error px-4 py-3 rounded-lg text-sm font-medium">
              A subscription payment needs attention. An administrator should open Settings → Billing before the grace period ends.
            </div>
          )}
          <AppContentRoutes
            currentUser={currentUser}
            churchDetails={churchDetails}
            funds={funds}
            categories={categories}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
