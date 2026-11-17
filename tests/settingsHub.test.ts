import { describe, expect, it } from "vitest";
import { ROLES, type UserRole } from "../lib/permissions";
import { searchWithout, searchWithoutTab, settingsRowsFor, sheetForSearch, sheetForTab, SETTINGS_ROWS } from "../components/settings/settingsRows";

const ALL_ON = { billing: true, bankFeeds: true };
const ALL_OFF = { billing: false, bankFeeds: false };
const idsFor = (role: UserRole, features = ALL_ON) => settingsRowsFor(role, features).map((row) => row.id);

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
    expect(settingsRowsFor(role, ALL_ON)).toEqual([]);
  });

  it("gives every role a row set that is a subset of the full list", () => {
    for (const role of ROLES) {
      for (const id of idsFor(role)) {
        expect(SETTINGS_ROWS.map((row) => row.id)).toContain(id);
      }
    }
  });

  it("groups rows in page order with no empty groups for an Admin", () => {
    const groups = [...new Set(settingsRowsFor("Admin", ALL_ON).map((row) => row.group))];
    expect(groups).toEqual(["Church", "Team", "Money", "Account"]);
  });
});

describe("settings rows at launch", () => {
  it("hides Bank connections and Plan and billing while both features are off", () => {
    expect(idsFor("Admin", ALL_OFF)).toEqual(["church", "gift-aid", "funds", "categories", "people", "privacy"]);
    expect(idsFor("Finance Team", ALL_OFF)).toEqual(["church", "gift-aid", "funds", "categories", "people"]);
  });

  it("brings each row back with its own feature", () => {
    expect(idsFor("Admin", { billing: true, bankFeeds: false })).toContain("billing");
    expect(idsFor("Admin", { billing: true, bankFeeds: false })).not.toContain("bank");
    expect(idsFor("Admin", { billing: false, bankFeeds: true })).toContain("bank");
    expect(idsFor("Admin", { billing: false, bankFeeds: true })).not.toContain("billing");
  });

  it("does not open a switched-off sheet from an old deep link", () => {
    expect(sheetForTab("billing", "Admin", ALL_OFF)).toBeNull();
    expect(sheetForTab("bank", "Admin", ALL_OFF)).toBeNull();
  });
});

describe("settings ?tab= deep links", () => {
  it("opens the matching sheet for a visible row", () => {
    expect(sheetForTab("billing", "Admin", ALL_ON)).toBe("billing");
    expect(sheetForTab("bank", "Finance Team", ALL_ON)).toBe("bank");
  });

  it("does not open a row the role cannot see", () => {
    expect(sheetForTab("billing", "Finance Team", ALL_ON)).toBeNull();
    expect(sheetForTab("privacy", "Finance Team", ALL_ON)).toBeNull();
    expect(sheetForTab("funds", "Guest", ALL_ON)).toBeNull();
  });

  it("maps the old tab names onto the new sheets", () => {
    expect(sheetForTab("general", "Finance Team", ALL_ON)).toBe("church");
    expect(sheetForTab("users", "Finance Team", ALL_ON)).toBe("people");
    expect(sheetForTab("data", "Admin", ALL_ON)).toBe("privacy");
    expect(sheetForTab("data", "Finance Team", ALL_ON)).toBeNull();
  });

  it("ignores missing and unknown tabs", () => {
    expect(sheetForTab(null, "Admin", ALL_ON)).toBeNull();
    expect(sheetForTab("", "Admin", ALL_ON)).toBeNull();
    expect(sheetForTab("nonsense", "Admin", ALL_ON)).toBeNull();
  });

  it("opens the sheet again when the same deep link is clicked after closing", () => {
    // The trial card's link: open from the URL, close (which drops ?tab=), then click the link again.
    let search = "?tab=billing";
    expect(sheetForSearch(search, "Admin", ALL_ON)).toBe("billing");

    search = searchWithoutTab(search);
    expect(search).toBe("");
    expect(sheetForSearch(search, "Admin", ALL_ON)).toBeNull();

    search = "?tab=billing";
    expect(sheetForSearch(search, "Admin", ALL_ON)).toBe("billing");
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
    expect(sheetForSearch(browserSearch, "Admin", ALL_ON)).toBeNull();
    expect(new URLSearchParams(browserSearch).get("bankConnection")).toBeNull();
    expect(routerSearch).toBe(browserSearch);
  });
});
