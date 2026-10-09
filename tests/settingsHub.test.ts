import { describe, expect, it } from "vitest";
import { ROLES, type UserRole } from "../lib/permissions";
import { searchWithout, searchWithoutTab, settingsRowsFor, sheetForSearch, sheetForTab, SETTINGS_ROWS } from "../components/settings/settingsRows";

const idsFor = (role: UserRole) => settingsRowsFor(role).map((row) => row.id);

describe("settings hub rows", () => {
  it("shows every row to an Admin", () => {
    expect(idsFor("Admin")).toEqual([
      "church",
      "gift-aid",
      "funds",
      "categories",
      "people",
      "bank",
      "billing",
      "privacy",
    ]);
  });

  it("hides the Admin-only rows from Finance Team without adding any", () => {
    expect(idsFor("Finance Team")).toEqual(["church", "gift-aid", "funds", "categories", "people", "bank"]);
    const adminOnly = SETTINGS_ROWS.filter((row) => row.capability).map((row) => row.id);
    expect(adminOnly).toEqual(["billing", "privacy"]);
  });

  it.each(["Pastorate", "Guest"] as const)("shows %s no settings rows", (role) => {
    expect(settingsRowsFor(role)).toEqual([]);
  });

  it("gives every role a row set that is a subset of the full list", () => {
    for (const role of ROLES) {
      for (const id of idsFor(role)) {
        expect(SETTINGS_ROWS.map((row) => row.id)).toContain(id);
      }
    }
  });

  it("groups rows in page order with no empty groups for an Admin", () => {
    const groups = [...new Set(settingsRowsFor("Admin").map((row) => row.group))];
    expect(groups).toEqual(["Church", "Team", "Money", "Account"]);
  });
});

describe("settings ?tab= deep links", () => {
  it("opens the matching sheet for a visible row", () => {
    expect(sheetForTab("billing", "Admin")).toBe("billing");
    expect(sheetForTab("bank", "Finance Team")).toBe("bank");
  });

  it("does not open a row the role cannot see", () => {
    expect(sheetForTab("billing", "Finance Team")).toBeNull();
    expect(sheetForTab("privacy", "Finance Team")).toBeNull();
    expect(sheetForTab("funds", "Guest")).toBeNull();
  });

  it("maps the old tab names onto the new sheets", () => {
    expect(sheetForTab("general", "Finance Team")).toBe("church");
    expect(sheetForTab("users", "Finance Team")).toBe("people");
    expect(sheetForTab("data", "Admin")).toBe("privacy");
    expect(sheetForTab("data", "Finance Team")).toBeNull();
  });

  it("ignores missing and unknown tabs", () => {
    expect(sheetForTab(null, "Admin")).toBeNull();
    expect(sheetForTab("", "Admin")).toBeNull();
    expect(sheetForTab("nonsense", "Admin")).toBeNull();
  });

  it("opens the sheet again when the same deep link is clicked after closing", () => {
    // The trial card's link: open from the URL, close (which drops ?tab=), then click the link again.
    let search = "?tab=billing";
    expect(sheetForSearch(search, "Admin")).toBe("billing");

    search = searchWithoutTab(search);
    expect(search).toBe("");
    expect(sheetForSearch(search, "Admin")).toBeNull();

    search = "?tab=billing";
    expect(sheetForSearch(search, "Admin")).toBe("billing");
  });

  it("drops only the tab param when closing a link with other params", () => {
    expect(searchWithoutTab("?tab=billing&subscription=cancelled")).toBe("?subscription=cancelled");
    expect(searchWithoutTab("?subscription=cancelled&tab=billing")).toBe("?subscription=cancelled");
  });

  it("leaves a search without a tab param alone", () => {
    expect(searchWithoutTab("")).toBe("");
    expect(searchWithoutTab("?subscription=cancelled")).toBe("?subscription=cancelled");
  });

  it("drops only the named params", () => {
    expect(searchWithout("?tab=bank&bankConnection=success&bankConnectionState=abc", ["bankConnection", "bankConnectionState"])).toBe(
      "?tab=bank"
    );
    expect(searchWithout("?tab=bank", ["bankConnection"])).toBe("?tab=bank");
  });

  it("does not replay a finished bank callback after close and reopen", () => {
    // The bank sheet clears its callback params from the browser URL, which React Router's location doesn't see.
    // Closing reads the browser search, so the stale router copy never gets written back.
    let browserSearch = "?tab=bank&bankConnection=success&bankConnectionState=abc";
    let routerSearch = browserSearch;

    browserSearch = searchWithout(browserSearch, ["bankConnection", "bankConnectionState"]);

    const closedSearch = searchWithoutTab(browserSearch);
    if (closedSearch !== routerSearch) {
      browserSearch = closedSearch;
      routerSearch = closedSearch;
    }

    // Reopening the bank row mounts the sheet, which reads the browser search for a callback.
    expect(sheetForSearch(browserSearch, "Admin")).toBeNull();
    expect(new URLSearchParams(browserSearch).get("bankConnection")).toBeNull();
    expect(routerSearch).toBe(browserSearch);
  });
});
