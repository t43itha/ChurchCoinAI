import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import NewChooser from "../components/app/NewChooser";
import { newChooserRows, newKindModal, parseNewKind } from "../components/app/newChooserRows";
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

describe("NewChooser", () => {
  it("lists the rows the role can open", () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(NewChooser, { role: "Finance Team", onClose: () => undefined }))
    );
    expect(html).toContain("What are you adding?");
    expect(html).toContain("Sunday&#x27;s giving");
    expect(html).toContain("Bank cash and cheques");
  });

  it.each<UserRole>(["Pastorate", "Guest"])("explains why %s has nothing to add", (role) => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(NewChooser, { role, onClose: () => undefined }))
    );
    expect(html).toContain("can view the books but not add to them");
    // Only the frame's own Close button is left; no row buttons.
    expect(html.match(/<button/g)).toHaveLength(1);
  });
});
