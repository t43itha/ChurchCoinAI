import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WizardFrame from "../components/wizard/WizardFrame";

const frame = (overlay?: string) =>
  renderToStaticMarkup(
    createElement(
      WizardFrame,
      {
        ariaLabel: "Test",
        title: "Test",
        onClose: () => {},
        onBack: () => {},
        progress: { total: 3, current: 1 },
        rail: createElement("aside", null, "Rail"),
        receipt: createElement("aside", null, "Receipt"),
        notice: createElement("p", null, "Notice"),
        footer: createElement("footer", null, "Footer"),
        overlay: overlay ? createElement("div", null, overlay) : undefined,
      },
      "Body"
    )
  );

describe("WizardFrame static markup", () => {
  it("renders the dialog without a document, focusable so focus can move into it", () => {
    // The test environment is node, so there is no document and the frame is not portalled.
    const markup = renderToStaticMarkup(
      createElement(WizardFrame, { ariaLabel: "Test", title: "Test", onClose: () => {} }, "Body")
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('tabindex="-1"');
    // The dialog takes focus itself on mount, so it must not draw a ring.
    expect(markup).toContain("outline-none");
    expect(markup).toContain("Body");
  });

  it("leaves everything inert-free when no overlay is open", () => {
    expect(frame()).not.toContain("inert");
  });

  it("makes the rail, header, progress, body, notice, footer and receipt inert while an overlay is open", () => {
    const markup = frame("Count sheet");
    // Rail, header, progress, body, the notice/footer wrapper and the receipt wrapper.
    expect(markup.split('inert=""').length - 1).toBe(6);
    expect(markup).toContain("Count sheet");
  });

  it("renders the overlay after the inert footer wrapper, outside everything it covers", () => {
    // The overlay is the last child of the main column, so it follows the closed footer wrapper directly.
    expect(frame("Count sheet")).toMatch(/<\/footer><\/div><div>Count sheet<\/div>/);
  });
});
