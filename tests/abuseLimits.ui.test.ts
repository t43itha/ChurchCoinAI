// What a person sees of the paging and cooldown limits: Smart Link says how
// many gifts it has not checked yet, and the People sheet says when an
// invitation can be emailed again.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import MatchSheet from "../components/campaigns/MatchSheet";
import SmartLinkSheet from "../components/transactions/SmartLinkSheet";
import PeopleSheet from "../components/settings/PeopleSheet";
import { addSmartLinkPage, EMPTY_SMART_LINK } from "../components/smartLink/useSmartLink";
import type { Invitation, Transaction } from "../types";

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
}));

afterEach(() => vi.useRealTimers());

const gift = { _id: "t1", date: "2026-06-02", description: "SO GRACE", amount: 50, type: "Income", category: "Donations", fundId: "f", isReconciled: false } as Transaction;
const match = { transactionId: "t1", pledgeId: "p1", donorName: "Grace Okafor", reason: "Same amount each month" };
const sheetProps = (remaining: number) => ({
  matches: [match], transactions: [gift], onConfirm: () => {}, onClose: () => {},
  remaining, isChecking: false, onCheckMore: () => {},
});

describe("Smart Link suggestions", () => {
  it.each([
    ["Campaigns", (remaining: number) => createElement(MatchSheet, { ...sheetProps(remaining), onDismiss: () => {} })],
    ["Transactions", (remaining: number) => createElement(SmartLinkSheet, { ...sheetProps(remaining), onIgnore: () => {} })],
  ])("say how many gifts are left to check, with a way to continue (%s)", (_screen, sheet) => {
    const more = renderToStaticMarkup(sheet(1_234));
    expect(more).toContain("1,234 more to check");
    expect(more).toContain("Check more");
    const done = renderToStaticMarkup(sheet(0));
    expect(done).not.toContain("more to check");
    expect(done).not.toContain("Check more");
  });

  it("keeps earlier suggestions when checking more, and starts afresh on a new run", () => {
    const first = addSmartLinkPage(EMPTY_SMART_LINK, { matches: [match], remaining: 300, nextCursor: { date: "2026-01-01", transactionId: "t1" } }, false);
    const later = { ...match, transactionId: "t2" };
    const second = addSmartLinkPage(first, { matches: [later], remaining: 0, nextCursor: null }, true);
    expect(second).toEqual({ matches: [match, later], remaining: 0, cursor: null });
    expect(addSmartLinkPage(second, { matches: [], remaining: 5, nextCursor: { date: "2026-02-01", transactionId: "t9" } }, false))
      .toEqual({ matches: [], remaining: 5, cursor: { date: "2026-02-01", transactionId: "t9" } });
  });
});

describe("People sheet", () => {
  const invitation = (lastSentAt?: number): Invitation => ({
    _id: "invite", organizationId: "org", email: "new@example.invalid", role: "Guest", invitedBy: "user",
    status: "pending", createdAt: 0, expiresAt: Date.now() + 86_400_000, lastSentAt,
  });
  const render = (lastSentAt?: number) => renderToStaticMarkup(createElement(PeopleSheet, {
    currentUser: { _id: "user", name: "Pat", email: "pat@example.invalid", role: "Admin" },
    churchName: "St Mary's", users: [], pendingInvitations: [invitation(lastSentAt)],
    onUpdateUserRole: () => {}, onResendInvitation: async () => null, onCancelInvitation: () => {},
    onInvite: () => {}, onClose: () => {},
  }));

  it("says when an invitation emailed in the last ten minutes can be resent", () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T12:02:00Z") });
    const sentAt = Date.parse("2026-11-17T12:00:00Z");
    const allowedAt = new Date(sentAt + 10 * 60_000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const html = render(sentAt);
    expect(html).toContain(`Resend after ${allowedAt}`);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Resend after/);
    expect(render(sentAt - 10 * 60_000)).toContain(">Resend<");
  });
});
