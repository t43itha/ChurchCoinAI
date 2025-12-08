import React, { useState } from "react";
import { useUser, UserButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "./convex/_generated/api";
import { Id } from "./convex/_generated/dataModel";

// Components
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import TransactionManager from "./components/TransactionManager";
import FundManager from "./components/FundManager";
import Campaigns from "./components/Campaigns";
import Reports from "./components/Reports";
import AICoPilot from "./components/AICoPilot";
import DonorManager from "./components/DonorManager";
import Settings from "./components/Settings";
import Onboarding from "./components/Onboarding";
import AuthPage from "./components/AuthPage";
import LoadingSpinner from "./components/LoadingSpinner";
import LandingPage from "./components/landing/LandingPage";

import { Menu, Command, CheckCircle2, X } from "lucide-react";

// Types for notification
type Notification = {
  visible: boolean;
  title: string;
  message: string;
};

function App() {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();

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
    api.queries.categories.list,
    hasUser ? {} : "skip"
  );
  const users = useQuery(
    api.queries.users.listByOrganization,
    hasUser ? {} : "skip"
  );

  // UI State (local only)
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notification, setNotification] = useState<Notification>({
    visible: false,
    title: "",
    message: "",
  });
  const [transactionFilterFundId, setTransactionFilterFundId] = useState<
    string | undefined
  >(undefined);
  const [showAuth, setShowAuth] = useState(false);

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

  // Show loading while remaining data loads
  if (
    funds === undefined ||
    transactions === undefined ||
    pledges === undefined
  ) {
    return <LoadingSpinner message="Loading financial data..." />;
  }

  // Helper to show notification
  const showNotification = (title: string, message: string) => {
    setNotification({ visible: true, title, message });
    setTimeout(
      () => setNotification((prev) => ({ ...prev, visible: false })),
      6000
    );
  };

  // Navigate to transaction ledger filtered by fund
  const handleViewFundLedger = (fundId: string) => {
    setTransactionFilterFundId(fundId);
    setActiveTab("transactions");
  };

  // Map organization details for backwards compatibility
  const churchDetails = {
    name: organization.name,
    charityNumber: organization.charityNumber,
    address: organization.address,
    email: organization.email,
    website: organization.website,
    reportingPeriod: organization.reportingPeriod,
    logoUrl: organization.logoUrl,
  };

  // Render main content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <Dashboard
            funds={funds ?? []}
            transactions={transactions ?? []}
          />
        );
      case "transactions":
        return (
          <TransactionManager
            transactions={transactions ?? []}
            funds={funds ?? []}
            pledges={pledges ?? []}
            categories={categories ?? []}
            currentUser={currentUser}
            initialFundId={transactionFilterFundId}
            onPledgeCompleted={(donorName, amount) =>
              showNotification(
                "Pledge Fulfilled! 🎉",
                `${donorName} has completed their goal of £${amount.toLocaleString()}.`
              )
            }
          />
        );
      case "funds":
        return (
          <FundManager
            funds={funds ?? []}
            transactions={transactions ?? []}
            onViewLedger={handleViewFundLedger}
          />
        );
      case "donors":
        return (
          <DonorManager
            donors={donors ?? []}
            transactions={transactions ?? []}
            pledges={pledges ?? []}
            funds={funds ?? []}
            currentUser={currentUser}
            churchDetails={churchDetails}
          />
        );
      case "campaigns":
        return (
          <Campaigns
            funds={funds ?? []}
            pledges={pledges ?? []}
            transactions={transactions ?? []}
            donors={donors ?? []}
            currentUser={currentUser}
            onPledgeCompleted={(donorName, amount) =>
              showNotification(
                "Pledge Fulfilled! 🎉",
                `${donorName} has completed their goal of £${amount.toLocaleString()}.`
              )
            }
          />
        );
      case "reports":
        return (
          <Reports
            transactions={transactions ?? []}
            funds={funds ?? []}
            pledges={pledges ?? []}
            churchDetails={churchDetails}
          />
        );
      case "copilot":
        return (
          <AICoPilot
            transactions={transactions ?? []}
            funds={funds ?? []}
          />
        );
      case "settings":
        return (
          <Settings
            currentUser={currentUser}
            users={users ?? []}
            categories={categories ?? []}
            funds={funds ?? []}
            churchDetails={churchDetails}
          />
        );
      default:
        return (
          <Dashboard
            funds={funds ?? []}
            transactions={transactions ?? []}
          />
        );
    }
  };

  return (
    <div className="flex bg-paper min-h-screen text-ink selection:bg-amber-light selection:text-amber-dark animate-enter relative">
      {/* Global Toast Notification */}
      {notification.visible && (
        <div className="fixed top-4 right-4 z-[100] bg-charcoal text-white shadow-hard-md rounded-lg p-4 flex items-start gap-3 animate-enter max-w-sm border border-ink">
          <div className="mt-0.5 w-6 h-6 rounded-full bg-sage flex items-center justify-center text-white shrink-0">
            <CheckCircle2 size={14} strokeWidth={3} />
          </div>
          <div>
            <h4 className="text-sm font-bold">{notification.title}</h4>
            <p className="text-xs text-grey-light mt-0.5 leading-relaxed">
              {notification.message}
            </p>
          </div>
          <button
            onClick={() =>
              setNotification((prev) => ({ ...prev, visible: false }))
            }
            className="text-grey-light hover:text-white transition-colors ml-2"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        users={users ?? []}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      <main className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden">
        <header className="md:hidden flex items-center justify-between p-4 border-b border-ledger bg-paper/95 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-ink text-white flex items-center justify-center rounded-lg">
              <Command size={16} />
            </div>
            <span className="font-bold text-ink">
              ChurchCoin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <UserButton afterSignOutUrl="/" />
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-grey-dark hover:bg-grey-light rounded-md"
            >
              <Menu size={24} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8">{renderContent()}</div>
      </main>
    </div>
  );
}

export default App;
