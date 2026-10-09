import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WizardFrame from "../components/wizard/WizardFrame";
import { nextFocusIndex } from "../components/wizard/useDialogFocus";

describe("nextFocusIndex", () => {
  it("moves Tab forward through the dialog's controls", () => {
    expect(nextFocusIndex(3, 0, false)).toBe(1);
    expect(nextFocusIndex(3, 1, false)).toBe(2);
  });

  it("wraps Tab from the last control back to the first", () => {
    expect(nextFocusIndex(3, 2, false)).toBe(0);
  });

  it("moves Shift+Tab backward and wraps from the first control to the last", () => {
    expect(nextFocusIndex(3, 2, true)).toBe(1);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
  });

  it("brings focus in at the first control with Tab, or the last with Shift+Tab, when focus is on the dialog", () => {
    expect(nextFocusIndex(3, -1, false)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
  });

  it("keeps focus on the only control whichever way Tab goes", () => {
    expect(nextFocusIndex(1, 0, false)).toBe(0);
    expect(nextFocusIndex(1, 0, true)).toBe(0);
  });

  it("has nothing to move to when the dialog has no enabled controls", () => {
    expect(nextFocusIndex(0, -1, false)).toBe(-1);
  });
});

describe("WizardFrame static markup", () => {
  it("renders the dialog without a document, focusable so focus can move into it", () => {
    // The test environment is node, so there is no document and the frame is not portalled.
    const markup = renderToStaticMarkup(
      createElement(WizardFrame, { ariaLabel: "Test", title: "Test", onClose: () => {} }, "Body")
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain("Body");
  });
});
