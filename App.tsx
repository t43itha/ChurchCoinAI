import React, { useState } from "react";
import { useUser, UserButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "./convex/_generated/api";
import { Id } from "./convex/_generated/dataModel";
import {
  AppUser,
  AppUserInviteInput,
  ChurchDetails,
  Donor,
  DonorCreateInput,
  Fund,
  FundCreateInput,
  Pledge,
  PledgeCreateInput,
  Transaction,
  UserRole,
} from "./types";

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
    api.queries.categories.listWithDetails,
    hasUser ? {} : "skip"
  );
  const users = useQuery(
    api.queries.users.listByOrganization,
    hasUser ? {} : "skip"
  );

  // ============ MUTATIONS ============

  // Donor mutations
  const createDonor = useMutation(api.mutations.donors.create);
  const updateDonor = useMutation(api.mutations.donors.update);
  const removeDonor = useMutation(api.mutations.donors.remove);
  const bulkUpsertDonors = useMutation(api.mutations.donors.bulkUpsert);
  const linkOrphanedRecords = useMutation(api.mutations.donors.linkOrphanedRecords);

  // Pledge mutations
  const createPledge = useMutation(api.mutations.pledges.create);
  const updatePledge = useMutation(api.mutations.pledges.update);
  const removePledge = useMutation(api.mutations.pledges.remove);
  const bulkCreatePledges = useMutation(api.mutations.pledges.bulkCreate);

  // Fund mutations
  const createFund = useMutation(api.mutations.funds.create);
  const updateFund = useMutation(api.mutations.funds.update);
  const removeFund = useMutation(api.mutations.funds.remove);

  // Category mutations
  const createCategory = useMutation(api.mutations.categories.create);
  const removeCategory = useMutation(api.mutations.categories.remove);

  // User mutations
  const inviteUser = useMutation(api.mutations.users.invite);
  const updateUserRole = useMutation(api.mutations.users.updateRole);
  const removeUser = useMutation(api.mutations.users.remove);

  // Organization mutations
  const updateOrganization = useMutation(api.mutations.organizations.update);

  // Transaction mutations (for linking to pledges)
  const updateTransaction = useMutation(api.mutations.transactions.update);

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
  const churchDetails: ChurchDetails = {
    name: organization.name,
    charityNumber: organization.charityNumber,
    address: organization.address,
    email: organization.email,
    website: organization.website,
    reportingPeriod: organization.reportingPeriod,
    logoUrl: organization.logoUrl,
  };

  // ============ HANDLER FUNCTIONS ============

  // Donor handlers
  const handleAddDonor = async (donor: DonorCreateInput): Promise<string | undefined> => {
    try {
      const donorId = await createDonor({
        name: donor.name,
        email: donor.email,
        phone: donor.phone,
        address: donor.address,
        postcode: donor.postcode,
        notes: donor.notes,
        type: donor.type,
        isGiftAidActive: donor.isGiftAidActive,
        communicationPreference: donor.communicationPreference,
      });
      showNotification("Donor Added", `${donor.name} has been added successfully.`);
      return donorId as string;
    } catch (error) {
      console.error("Failed to add donor:", error);
      showNotification("Error", "Failed to add donor. Please try again.");
      return undefined;
    }
  };

  const handleUpdateDonor = async (donor: Donor) => {
    try {
      await updateDonor({
        donorId: donor._id as Id<"donors">,
        name: donor.name,
        email: donor.email,
        phone: donor.phone,
        address: donor.address,
        postcode: donor.postcode,
        notes: donor.notes,
        type: donor.type,
        isGiftAidActive: donor.isGiftAidActive,
        communicationPreference: donor.communicationPreference,
      });
      showNotification("Donor Updated", `${donor.name} has been updated.`);
    } catch (error) {
      console.error("Failed to update donor:", error);
      showNotification("Error", "Failed to update donor. Please try again.");
    }
  };

  const handleLinkOrphanedRecords = async (donorId: string, oldName: string) => {
    try {
      const result = await linkOrphanedRecords({
        donorId: donorId as Id<"donors">,
        oldName,
      });
      showNotification(
        "Records Linked",
        `Linked ${result.linkedTransactions} transactions and ${result.linkedPledges} pledges.`
      );
      return result;
    } catch (error) {
      console.error("Failed to link records:", error);
      showNotification("Error", "Failed to link records. Please try again.");
      return { linkedTransactions: 0, linkedPledges: 0 };
    }
  };

  // Pledge handlers
  const handleAddPledge = async (pledge: PledgeCreateInput) => {
    try {
      await createPledge({
        donorId: pledge.donorId ? pledge.donorId as Id<"donors"> : undefined,
        donorName: pledge.donorName,
        amount: pledge.amount,
        fundId: pledge.fundId as Id<"funds">,
        frequency: pledge.frequency,
        startDate: pledge.startDate,
        endDate: pledge.endDate,
        status: pledge.status,
      });
      showNotification("Pledge Added", `Pledge from ${pledge.donorName} has been recorded.`);
    } catch (error) {
      console.error("Failed to add pledge:", error);
      showNotification("Error", "Failed to add pledge. Please try again.");
    }
  };

  const handleUpdatePledge = async (pledge: Pledge) => {
    try {
      await updatePledge({
        pledgeId: pledge._id as Id<"pledges">,
        donorId: pledge.donorId ? pledge.donorId as Id<"donors"> : undefined,
        donorName: pledge.donorName,
        amount: pledge.amount,
        fundId: pledge.fundId as Id<"funds">,
        frequency: pledge.frequency,
        startDate: pledge.startDate,
        endDate: pledge.endDate,
        status: pledge.status,
      });
      showNotification("Pledge Updated", `Pledge from ${pledge.donorName} has been updated.`);
    } catch (error) {
      console.error("Failed to update pledge:", error);
      showNotification("Error", "Failed to update pledge. Please try again.");
    }
  };

  const handleBulkAddPledges = async (pledgesToAdd: PledgeCreateInput[]) => {
    try {
      const formattedPledges = pledgesToAdd.map(p => ({
        donorId: p.donorId ? p.donorId as Id<"donors"> : undefined,
        donorName: p.donorName,
        amount: p.amount,
        fundId: p.fundId as Id<"funds">,
        frequency: p.frequency,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
      }));
      const result = await bulkCreatePledges({ pledges: formattedPledges });
      showNotification("Pledges Imported", `${result.count} pledges have been imported.`);
    } catch (error) {
      console.error("Failed to bulk add pledges:", error);
      showNotification("Error", "Failed to import pledges. Please try again.");
    }
  };

  const handleBulkAddDonors = async (donorsToAdd: DonorCreateInput[]): Promise<{ id: string; name: string; isNew: boolean }[]> => {
    try {
      const formattedDonors = donorsToAdd.map(d => ({
        name: d.name,
        email: d.email,
        phone: d.phone,
        address: d.address,
        postcode: d.postcode,
        type: d.type,
        isGiftAidActive: d.isGiftAidActive,
      }));
      const result = await bulkUpsertDonors({ donors: formattedDonors });
      const newCount = result.filter(r => r.isNew).length;
      const updatedCount = result.filter(r => !r.isNew).length;
      showNotification("Donors Imported", `${newCount} new donors added, ${updatedCount} updated.`);
      return result; // Return results so caller can link pledges
    } catch (error) {
      console.error("Failed to bulk add donors:", error);
      showNotification("Error", "Failed to import donors. Please try again.");
      return [];
    }
  };

  // Transaction handler (for linking to pledges)
  const handleUpdateTransaction = async (transaction: Transaction) => {
    try {
      await updateTransaction({
        transactionId: transaction._id as Id<"transactions">,
        pledgeId: transaction.pledgeId ? transaction.pledgeId as Id<"pledges"> : null,
        donorId: transaction.donorId ? transaction.donorId as Id<"donors"> : undefined,
        donorName: transaction.donorName,
      });
    } catch (error) {
      console.error("Failed to update transaction:", error);
      showNotification("Error", "Failed to update transaction. Please try again.");
    }
  };

  // Fund handlers
  const handleAddFund = async (fund: FundCreateInput) => {
    try {
      await createFund({
        name: fund.name,
        type: fund.type,
        description: fund.description,
        targetAmount: fund.targetAmount,
        deadline: fund.deadline,
        logoUrl: fund.logoUrl,
      });
      showNotification("Fund Created", `${fund.name} has been created.`);
    } catch (error) {
      console.error("Failed to add fund:", error);
      showNotification("Error", "Failed to create fund. Please try again.");
    }
  };

  const handleUpdateFund = async (fund: Fund) => {
    try {
      await updateFund({
        fundId: fund._id as Id<"funds">,
        name: fund.name,
        type: fund.type,
        description: fund.description,
        targetAmount: fund.targetAmount,
        deadline: fund.deadline,
        logoUrl: fund.logoUrl,
      });
      showNotification("Fund Updated", `${fund.name} has been updated.`);
    } catch (error) {
      console.error("Failed to update fund:", error);
      showNotification("Error", "Failed to update fund. Please try again.");
    }
  };

  const handleRemoveFund = async (fundId: string) => {
    try {
      await removeFund({ fundId: fundId as Id<"funds"> });
      showNotification("Fund Deleted", "The fund has been deleted.");
    } catch (error: any) {
      console.error("Failed to remove fund:", error);
      showNotification("Error", error.message || "Failed to delete fund. Please try again.");
    }
  };

  // Category handlers
  const handleAddCategory = async (categoryName: string) => {
    try {
      await createCategory({ name: categoryName });
      showNotification("Category Added", `"${categoryName}" has been added.`);
    } catch (error: any) {
      console.error("Failed to add category:", error);
      showNotification("Error", error.message || "Failed to add category. Please try again.");
    }
  };

  const handleRemoveCategory = async (categoryName: string) => {
    // Find the category ID from the categories list
    const category = categories?.find(c => c.name === categoryName);
    if (!category) {
      showNotification("Error", "Category not found.");
      return;
    }
    try {
      await removeCategory({ categoryId: category._id });
      showNotification("Category Removed", `"${categoryName}" has been removed.`);
    } catch (error: any) {
      console.error("Failed to remove category:", error);
      showNotification("Error", error.message || "Failed to remove category. Please try again.");
    }
  };

  // User handlers
  const handleAddUser = async (user: AppUserInviteInput) => {
    try {
      await inviteUser({
        clerkId: user.clerkId,
        name: user.name,
        email: user.email,
        role: user.role,
      });
      showNotification("User Invited", `${user.name} has been added to the organization.`);
    } catch (error: any) {
      console.error("Failed to add user:", error);
      showNotification("Error", error.message || "Failed to add user. Please try again.");
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: UserRole) => {
    try {
      await updateUserRole({
        userId: userId as Id<"users">,
        role: newRole,
      });
      showNotification("Role Updated", "User role has been updated.");
    } catch (error: any) {
      console.error("Failed to update user role:", error);
      showNotification("Error", error.message || "Failed to update user role. Please try again.");
    }
  };

  // Church details handler
  const handleUpdateChurchDetails = async (details: ChurchDetails) => {
    try {
      await updateOrganization({
        name: details.name,
        charityNumber: details.charityNumber,
        address: details.address,
        email: details.email,
        website: details.website,
        reportingPeriod: details.reportingPeriod,
        logoUrl: details.logoUrl,
      });
      showNotification("Organization Updated", "Organization details have been saved.");
    } catch (error) {
      console.error("Failed to update organization:", error);
      showNotification("Error", "Failed to update organization. Please try again.");
    }
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
            funds={funds ?? []}
            pledges={pledges ?? []}
            categories={categories ?? []}
            currentUser={currentUser}
            initialFundId={transactionFilterFundId}
            onPledgeCompleted={(donorName, amount) =>
              showNotification(
                "Pledge Fulfilled!",
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
            onAddDonor={handleAddDonor}
            onUpdateDonor={handleUpdateDonor}
            onAddPledge={handleAddPledge}
            onUpdatePledge={handleUpdatePledge}
            onUpdateTransaction={handleUpdateTransaction}
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
            onAddPledge={handleAddPledge}
            onUpdatePledge={handleUpdatePledge}
            onBulkAddPledges={handleBulkAddPledges}
            onBulkAddDonors={handleBulkAddDonors}
            onUpdateTransaction={handleUpdateTransaction}
            currentUser={currentUser}
            onPledgeCompleted={(donorName, amount) =>
              showNotification(
                "Pledge Fulfilled!",
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
        return <AICoPilot />;
      case "settings":
        return (
          <Settings
            currentUser={currentUser}
            users={users ?? []}
            categories={categories?.map(c => c.name) ?? []}
            funds={funds ?? []}
            churchDetails={churchDetails}
            onUpdateUserRole={handleUpdateUserRole}
            onAddCategory={handleAddCategory}
            onRemoveCategory={handleRemoveCategory}
            onAddUser={handleAddUser}
            onUpdateChurchDetails={handleUpdateChurchDetails}
            onAddFund={handleAddFund}
            onUpdateFund={handleUpdateFund}
            onRemoveFund={handleRemoveFund}
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
