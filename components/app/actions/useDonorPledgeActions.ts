import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Donor,
  DonorCreateInput,
  Pledge,
  PledgeCreateInput,
  Transaction,
} from "../../../types";
import { ShowNotification } from "./types";

interface UseDonorPledgeActionsArgs {
  showNotification: ShowNotification;
}

export const useDonorPledgeActions = ({
  showNotification,
}: UseDonorPledgeActionsArgs) => {
  const createDonor = useMutation(api.mutations.donors.create);
  const updateDonor = useMutation(api.mutations.donors.update);
  const bulkUpsertDonors = useMutation(api.mutations.donors.bulkUpsert);

  const createPledge = useMutation(api.mutations.pledges.create);
  const updatePledge = useMutation(api.mutations.pledges.update);
  const bulkCreatePledges = useMutation(api.mutations.pledges.bulkCreate);
  const updateTransaction = useMutation(api.mutations.transactions.update);

  const handleAddDonor = async (
    donor: DonorCreateInput
  ): Promise<string | undefined> => {
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

  const handleAddPledge = async (pledge: PledgeCreateInput) => {
    try {
      await createPledge({
        donorId: pledge.donorId ? (pledge.donorId as Id<"donors">) : undefined,
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
        donorId: pledge.donorId ? (pledge.donorId as Id<"donors">) : undefined,
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
      const formattedPledges = pledgesToAdd.map((pledge) => ({
        donorId: pledge.donorId ? (pledge.donorId as Id<"donors">) : undefined,
        donorName: pledge.donorName,
        amount: pledge.amount,
        fundId: pledge.fundId as Id<"funds">,
        frequency: pledge.frequency,
        startDate: pledge.startDate,
        endDate: pledge.endDate,
        status: pledge.status,
      }));
      const result = await bulkCreatePledges({ pledges: formattedPledges });
      showNotification("Pledges Imported", `${result.count} pledges have been imported.`);
    } catch (error) {
      console.error("Failed to bulk add pledges:", error);
      showNotification("Error", "Failed to import pledges. Please try again.");
    }
  };

  const handleBulkAddDonors = async (
    donorsToAdd: DonorCreateInput[]
  ): Promise<{ id: string; name: string; isNew: boolean }[]> => {
    try {
      const formattedDonors = donorsToAdd.map((donor) => ({
        name: donor.name,
        email: donor.email,
        phone: donor.phone,
        address: donor.address,
        postcode: donor.postcode,
        type: donor.type,
        isGiftAidActive: donor.isGiftAidActive,
      }));
      const result = await bulkUpsertDonors({ donors: formattedDonors });
      const newCount = result.filter((item) => item.isNew).length;
      const updatedCount = result.filter((item) => !item.isNew).length;
      showNotification(
        "Donors Imported",
        `${newCount} new donors added, ${updatedCount} updated.`
      );
      return result;
    } catch (error) {
      console.error("Failed to bulk add donors:", error);
      showNotification("Error", "Failed to import donors. Please try again.");
      return [];
    }
  };

  const handleUpdateTransaction = async (transaction: Transaction) => {
    try {
      await updateTransaction({
        transactionId: transaction._id as Id<"transactions">,
        pledgeId: transaction.pledgeId
          ? (transaction.pledgeId as Id<"pledges">)
          : null,
        donorId: transaction.donorId
          ? (transaction.donorId as Id<"donors">)
          : undefined,
        donorName: transaction.donorName,
      });
    } catch (error) {
      console.error("Failed to update transaction:", error);
      showNotification("Error", "Failed to update transaction. Please try again.");
    }
  };

  return {
    handleAddDonor,
    handleUpdateDonor,
    handleAddPledge,
    handleUpdatePledge,
    handleBulkAddPledges,
    handleBulkAddDonors,
    handleUpdateTransaction,
  };
};
