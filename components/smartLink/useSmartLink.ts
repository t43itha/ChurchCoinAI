import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { notify } from "../../lib/notifications";
import type { SmartLinkCursor, SmartLinkMatch, SmartLinkPage } from "../../lib/smartLink";
import { errorMessage } from "../transactions/transactionView";

export type SmartLinkState = { matches: SmartLinkMatch[]; remaining: number; cursor: SmartLinkCursor | null };

export const EMPTY_SMART_LINK: SmartLinkState = { matches: [], remaining: 0, cursor: null };

/**
 * A fresh run replaces earlier suggestions; checking more adds the next page's to them.
 * A later pledge batch can suggest a gift again, so only the first suggestion per gift
 * is kept: confirming a second one would move the gift off a pledge already confirmed.
 */
export function addSmartLinkPage(state: SmartLinkState, page: SmartLinkPage, continued: boolean): SmartLinkState {
  const suggested = new Set(continued ? state.matches.map((m) => m.transactionId) : []);
  const fresh = page.matches.filter((m) => !suggested.has(m.transactionId) && suggested.add(m.transactionId));
  return {
    matches: continued ? [...state.matches, ...fresh] : fresh,
    remaining: page.remaining,
    cursor: page.nextCursor,
  };
}

// Smart Link checks unlinked income a page at a time. This keeps the
// suggestions found so far and where the next page starts.
export function useSmartLink() {
  const reconcile = useAction(api.actions.ai.reconcilePledges);
  const [state, setState] = useState(EMPTY_SMART_LINK);
  const [isChecking, setIsChecking] = useState(false);

  const check = async (continued: boolean): Promise<SmartLinkPage | null> => {
    const cursor = continued ? state.cursor : null;
    setIsChecking(true);
    try {
      const page = await reconcile(cursor ? { after: cursor } : {});
      setState((previous) => addSmartLinkPage(previous, page, continued));
      return page;
    } catch (error) {
      notify("Error", errorMessage(error, "Smart Link failed. Please try again."));
      return null;
    } finally {
      setIsChecking(false);
    }
  };

  return {
    matches: state.matches,
    remaining: state.remaining,
    isChecking,
    start: () => check(false),
    checkMore: () => check(true),
    dismiss: (match: SmartLinkMatch) =>
      setState((previous) => ({ ...previous, matches: previous.matches.filter((m) => m !== match) })),
  };
}
