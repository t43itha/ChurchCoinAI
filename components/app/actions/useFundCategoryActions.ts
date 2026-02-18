import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Fund, FundCreateInput } from "../../../types";
import { CategoryItem, ShowNotification } from "./types";

interface UseFundCategoryActionsArgs {
  categories?: CategoryItem[];
  showNotification: ShowNotification;
}

export const useFundCategoryActions = ({
  categories,
  showNotification,
}: UseFundCategoryActionsArgs) => {
  const createFund = useMutation(api.mutations.funds.create);
  const updateFund = useMutation(api.mutations.funds.update);
  const removeFund = useMutation(api.mutations.funds.remove);

  const createCategory = useMutation(api.mutations.categories.create);
  const removeCategory = useMutation(api.mutations.categories.remove);

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
      showNotification(
        "Error",
        error.message || "Failed to delete fund. Please try again."
      );
    }
  };

  const handleAddCategory = async (categoryName: string) => {
    try {
      await createCategory({ name: categoryName });
      showNotification("Category Added", `"${categoryName}" has been added.`);
    } catch (error: any) {
      console.error("Failed to add category:", error);
      showNotification(
        "Error",
        error.message || "Failed to add category. Please try again."
      );
    }
  };

  const handleRemoveCategory = async (categoryName: string) => {
    const category = categories?.find((item) => item.name === categoryName);
    if (!category) {
      showNotification("Error", "Category not found.");
      return;
    }

    try {
      await removeCategory({ categoryId: category._id as Id<"categories"> });
      showNotification("Category Removed", `"${categoryName}" has been removed.`);
    } catch (error: any) {
      console.error("Failed to remove category:", error);
      showNotification(
        "Error",
        error.message || "Failed to remove category. Please try again."
      );
    }
  };

  return {
    handleAddFund,
    handleUpdateFund,
    handleRemoveFund,
    handleAddCategory,
    handleRemoveCategory,
  };
};
