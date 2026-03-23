import React, { useCallback, useEffect, useState } from "react";
import { useUser, UserButton } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./convex/_generated/api";
import {
  ChurchDetails,
  Invitation,
} from "./types";

// Components
import Sidebar from "./components/Sidebar";
import Onboarding from "./components/Onboarding";
import AuthPage from "./components/AuthPage";
import LoadingSpinner from "./components/LoadingSpinner";
import LandingPage from "./components/landing/LandingPage";
import AppContentRoutes from "./components/app/AppContentRoutes";
import AppNotificationToast, {
  AppNotification,
} from "./components/app/AppNotificationToast";
import { useAppActions } from "./components/app/useAppActions";
import { subscribeToNotifications } from "./lib/notifications";

import { Menu } from "lucide-react";

function App() {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const location = useLocation();
  const navigate = useNavigate();

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

  const funds = useQuery(
    api.queries.funds.list,
    hasUser ? {} : "skip"
  );
  const transactions = useQuery(
    api.queries.transactions.list,
    hasUser ? {} : "skip"
  );
  const pledges = useQuery(
    api.queries.pledges.list,
    hasUser ? {} : "skip"
  );
  const donors = useQuery(
    api.queries.donors.list,
    hasUser ? {} : "skip"
  );
  const categories = useQuery(
    api.queries.categories.listWithDetails,
    hasUser ? {} : "skip"
  );
  const users = useQuery(
    api.queries.users.listByOrganization,
    hasUser ? {} : "skip"
  );
  const pendingInvitations = useQuery(
    api.queries.invitations.listPending,
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

  const {
    handleAddDonor,
    handleUpdateDonor,
    handleAddPledge,
    handleUpdatePledge,
    handleBulkAddPledges,
    handleBulkAddDonors,
    handleUpdateTransaction,
    handleAddFund,
    handleUpdateFund,
    handleRemoveFund,
    handleAddCategory,
    handleRemoveCategory,
    handleInviteUser,
    handleCancelInvitation,
    handleUpdateUserRole,
    handleUpdateChurchDetails,
  } = useAppActions({
    categories: categories ?? [],
    showNotification,
  });

  // Show loading while Clerk initializes
  if (!isLoaded) {
    return <LoadingSpinner message="Initializing..." />;
  }

  // Show landing page or auth page if not signed in
  if (!isSignedIn) {
    if (showAuth) {
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

  // Show loading while remaining data loads
  if (
    funds === undefined ||
    transactions === undefined ||
    pledges === undefined
  ) {
    return <LoadingSpinner message="Loading financial data..." />;
  }

  // Navigate to transaction ledger filtered by fund
  const handleViewFundLedger = (fundId: string) => {
    navigate(`/transactions?fundId=${encodeURIComponent(fundId)}`);
  };

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
  const handlePledgeCompleted = (donorName: string, amount: number) => {
    showNotification(
      "Pledge Fulfilled!",
      `${donorName} has completed their goal of £${amount.toLocaleString()}.`
    );
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

      <main className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden">
        <header className="md:hidden flex items-center justify-between p-4 border-b border-ledger bg-paper/95 backdrop-blur-sm sticky top-0 z-10">
          <img
            src="/ChurchCoin-Variation 01-transparent-s.png"
            alt="ChurchCoin Finance Platform"
            className="h-10"
          />
          <div className="flex items-center gap-2">
            <UserButton afterSignOutUrl="/" />
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-grey-dark hover:bg-grey-light rounded-md"
              aria-label="Open navigation menu"
            >
              <Menu size={24} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <AppContentRoutes
            currentUser={currentUser}
            churchDetails={churchDetails}
            funds={funds ?? []}
            transactions={transactions ?? []}
            pledges={pledges ?? []}
            donors={donors ?? []}
            categories={categories ?? []}
            users={users ?? []}
            pendingInvitations={(pendingInvitations ?? []) as Invitation[]}
            onViewFundLedger={handleViewFundLedger}
            onPledgeCompleted={handlePledgeCompleted}
            onAddDonor={handleAddDonor}
            onUpdateDonor={handleUpdateDonor}
            onAddPledge={handleAddPledge}
            onUpdatePledge={handleUpdatePledge}
            onBulkAddPledges={handleBulkAddPledges}
            onBulkAddDonors={handleBulkAddDonors}
            onUpdateTransaction={handleUpdateTransaction}
            onUpdateUserRole={handleUpdateUserRole}
            onAddCategory={handleAddCategory}
            onRemoveCategory={handleRemoveCategory}
            onInviteUser={handleInviteUser}
            onCancelInvitation={handleCancelInvitation}
            onUpdateChurchDetails={handleUpdateChurchDetails}
            onAddFund={handleAddFund}
            onUpdateFund={handleUpdateFund}
            onRemoveFund={handleRemoveFund}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
