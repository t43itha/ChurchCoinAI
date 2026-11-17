import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { LaunchFeatures } from "../../convex/lib/launchFeatures";

export type { LaunchFeatures };

const ALL_OFF: LaunchFeatures = { billing: false, bankFeeds: false };

// Reads as off until the server answers, so nothing offers billing or bank feeds
// that the deployment can't complete.
export function useLaunchFeatures(): LaunchFeatures {
  return useQuery(api.queries.launchFeatures.get, {}) ?? ALL_OFF;
}
