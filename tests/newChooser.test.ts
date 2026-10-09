import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import MobileTabBar from "../components/app/MobileTabBar";
import NewChooser from "../components/app/NewChooser";
import { canAddNew, linkParamsToRemove, newChooserRows, newKindModal, parseNewKind, planNewKind } from "../components/app/newChooserRows";
import { ROLES, type UserRole } from "../lib/permissions";

const ROW_IDS: Record<UserRole, string[]> = {
  Admin: ["giving", "statement", "sync", "entry", "transfer", "cash-banking"],
  "Finance Team": ["giving", "statement", "sync", "entry", "transfer", "cash-banking"],
  Pastorate: [],
  Guest: [],
};

describe("newChooserRows", () => {
  it.each(ROLES)("offers the expected rows to %s", (role) => {
    expect(newChooserRows(role).map((row) => row.id)).toEqual(ROW_IDS[role]);
  });

  it("only links to Transactions with a known new= kind or the cash banking view", () => {
    for (const row of newChooserRows("Admin")) {
      const [path, query] = row.to.split("?");
      expect(path).toBe("/transactions");
      if (row.id === "cash-banking") {
        expect(query).toBe("view=cash-banking");
      } else {
        expect(parseNewKind(query?.replace(/^new=/, ""))).not.toBeNull();
      }
    }
  });
});

describe("parseNewKind", () => {
  it("accepts the five chooser kinds", () => {
    for (const kind of ["giving", "statement", "sync", "entry", "transfer"]) {
      expect(parseNewKind(kind)).toBe(kind);
    }
  });

  it("rejects unknown, empty and missing values", () => {
    expect(parseNewKind("delete")).toBeNull();
    expect(parseNewKind("")).toBeNull();
    expect(parseNewKind(null)).toBeNull();
    expect(parseNewKind(undefined)).toBeNull();
  });
});

describe("newKindModal", () => {
  it("maps each kind to the modal it opens on Transactions", () => {
    expect(newKindModal("giving")).toBe("cashTakings");
    expect(newKindModal("statement")).toBe("statementImport");
    expect(newKindModal("sync")).toBe("bankSync");
    expect(newKindModal("entry")).toBe("singleEntry");
    expect(newKindModal("transfer")).toBe("journalTransfer");
  });
});

describe("MobileTabBar", () => {
  const render = (role: UserRole) =>
    renderToStaticMarkup(createElement(MemoryRouter, null, createElement(MobileTabBar, { role, onNew: () => undefined })));

  it.each<UserRole>(["Admin", "Finance Team"])("shows five slots including New to %s", (role) => {
    const html = render(role);
    expect(html).toContain('aria-label="New entry"');
    expect(html.match(/<a /g)).toHaveLength(4);
  });

  it.each<UserRole>(["Pastorate", "Guest"])("shows four slots and no New entry to %s", (role) => {
    const html = render(role);
    expect(html).not.toContain('aria-label="New entry"');
    expect(html.match(/<a /g)).toHaveLength(4);
  });
});

describe("canAddNew", () => {
  it.each(ROLES)("matches whether %s is offered any rows", (role) => {
    expect(canAddNew(role)).toBe(ROW_IDS[role].length > 0);
  });
});

describe("planNewKind", () => {
  const loaded = { canEdit: true, bankConnectionsLoaded: true };

  it("does nothing without a ?new= value", () => {
    expect(planNewKind({ param: null, handled: null, ...loaded })).toEqual({ type: "idle" });
  });

  it("waits for bank connections before a sync, then syncs once they arrive", () => {
    expect(planNewKind({ param: "sync", handled: null, canEdit: true, bankConnectionsLoaded: false })).toEqual({
      type: "wait",
    });
    expect(planNewKind({ param: "sync", handled: null, ...loaded })).toEqual({
      type: "handled",
      modal: "bankSync",
      leaveReconciliation: true,
    });
  });

  it("does not wait on bank connections for other kinds", () => {
    expect(planNewKind({ param: "entry", handled: null, canEdit: true, bankConnectionsLoaded: false })).toEqual({
      type: "handled",
      modal: "singleEntry",
      leaveReconciliation: true,
    });
  });

  it("syncs once when connections load after a wait, and not again on a Strict Mode replay", () => {
    expect(planNewKind({ param: "sync", handled: null, canEdit: true, bankConnectionsLoaded: false }).type).toBe("wait");
    const first = planNewKind({ param: "sync", handled: null, ...loaded });
    expect(first.type).toBe("handled");
    // The page records the param as handled before the replay runs, so the replay does nothing.
    expect(planNewKind({ param: "sync", handled: "sync", ...loaded })).toEqual({ type: "idle" });
  });

  it("leaves the reconciliation view for a new entry, so the add form is visible", () => {
    expect(planNewKind({ param: "entry", handled: null, ...loaded })).toEqual({
      type: "handled",
      modal: "singleEntry",
      leaveReconciliation: true,
    });
  });

  it("consumes the param for roles that cannot edit but opens nothing", () => {
    expect(planNewKind({ param: "sync", handled: null, canEdit: false, bankConnectionsLoaded: false })).toEqual({
      type: "handled",
      modal: null,
      leaveReconciliation: false,
    });
  });

  it("consumes an unknown kind without opening anything", () => {
    expect(planNewKind({ param: "delete", handled: null, ...loaded })).toEqual({
      type: "handled",
      modal: null,
      leaveReconciliation: false,
    });
  });
});

describe("NewChooser", () => {
  it("lists the rows the role can open", () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(NewChooser, { role: "Finance Team", onClose: () => undefined }))
    );
    expect(html).toContain("What are you adding?");
    expect(html).toContain("Sunday&#x27;s giving");
    expect(html).toContain("Bank cash and cheques");
  });

  it.each<UserRole>(["Pastorate", "Guest"])("offers no rows to %s", (role) => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(NewChooser, { role, onClose: () => undefined }))
    );
    expect(html).not.toContain("Sunday&#x27;s giving");
  });
});

describe("linkParamsToRemove", () => {
  const handled = { type: "handled", modal: "singleEntry", leaveReconciliation: true } as const;

  it("removes new and view together when both arrive, so neither restores the other", () => {
    expect(linkParamsToRemove(handled, "cash-banking")).toEqual(["new", "view"]);
  });

  it("keeps new while a sync waits for bank connections, but still takes view", () => {
    expect(linkParamsToRemove({ type: "wait" }, "cash-banking")).toEqual(["view"]);
  });

  it("leaves unrelated params and other view values alone", () => {
    expect(linkParamsToRemove({ type: "idle" }, "something-else")).toEqual([]);
    expect(linkParamsToRemove(handled, null)).toEqual(["new"]);
  });
});
