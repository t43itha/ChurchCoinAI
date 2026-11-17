import { query } from "../_generated/server";
import { getLaunchFeatures } from "../lib/launchFeatures";

// Deliberately unauthenticated: the signed-out landing page reads it too.
export const get = query({
  args: {},
  handler: async () => getLaunchFeatures(),
});
