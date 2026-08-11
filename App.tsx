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
import AppContentRoutes from "./components/app/AppContentRoutes";
import AppNotificationToast, {
  AppNotification,
} from "./components/app/AppNotificationToast";
import { subscribeToNotifications } from "./lib/notifications";
import { getStoredInviteToken, storeInviteToken } from "./lib/inviteToken";

import { Menu } from "lucide-react";

function App() {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const location = useLocation();
  const navigate = useNavigate();

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

  // Shared reference data used by every route. Route-specific data
  // (transactions, donors, pledges, users) is fetched inside each route.
  const funds = useQuery(api.queries.funds.list, hasUser ? {} : "skip");
  const categories = useQuery(
    api.queries.categories.listWithDetails,
    hasUser ? {} : "skip"
  );

  // UI State (local only)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notification, setNotification] = useState<AppNotification>({
    visible: false,
    title: "",
    message: "",
  });
  const [showAuth, setShowAuth] = useState(false);
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
    if (showAuth || hasStoredInvite) {
      return <AuthPage onBack={() => setShowAuth(false)} />;
    }
    return <LandingPage onGetStarted={() => setShowAuth(true)} />;
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
        onComplete={() => {
          // Convex will automatically refetch after mutation
        }}
      />
    );
  }

  const currentOrganization = organization;

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
