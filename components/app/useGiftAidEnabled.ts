import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isGiftAidEnabled } from "../../lib/giftAid";

// Shares App's organizations.current subscription, so reading the setting
// here costs no extra query.
export const useGiftAidEnabled = (): boolean =>
  isGiftAidEnabled(useQuery(api.queries.organizations.current, {}));
