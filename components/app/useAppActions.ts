import {
  CategoryItem,
  ShowNotification,
} from "./actions/types";
import { useDonorPledgeActions } from "./actions/useDonorPledgeActions";
import { useFundCategoryActions } from "./actions/useFundCategoryActions";
import { useOrganizationAdminActions } from "./actions/useOrganizationAdminActions";

interface UseAppActionsArgs {
  categories?: CategoryItem[];
  showNotification: ShowNotification;
}

export const useAppActions = ({
  categories,
  showNotification,
}: UseAppActionsArgs) => {
  const donorPledgeActions = useDonorPledgeActions({ showNotification });
  const fundCategoryActions = useFundCategoryActions({
    categories,
    showNotification,
  });
  const organizationAdminActions = useOrganizationAdminActions({
    showNotification,
  });

  return {
    ...donorPledgeActions,
    ...fundCategoryActions,
    ...organizationAdminActions,
  };
};
