import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { LaunchFeatures } from "../../convex/lib/launchFeatures";

export type { LaunchFeatures };

export type LaunchFeatureState = LaunchFeatures & { loaded: boolean };

const LOADING: LaunchFeatureState = { billing: false, bankFeeds: false, loaded: false };

// Reads as off until the server answers, so nothing offers billing or bank feeds
// that the deployment can't complete. `loaded` lets a caller hold a one-shot
// decision (a deep link) until the real values are in.
export function useLaunchFeatures(): LaunchFeatureState {
  const features = useQuery(api.queries.launchFeatures.get, {});
  return useMemo(() => (features ? { ...features, loaded: true } : LOADING), [features]);
}
