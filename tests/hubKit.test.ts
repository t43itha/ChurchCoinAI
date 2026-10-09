import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AlertTriangle, Gift } from "lucide-react";
import { describe, expect, it } from "vitest";
import HeroCard from "../components/hub/HeroCard";
import HubHeader from "../components/hub/HubHeader";
import HubLayout from "../components/hub/HubLayout";
import { NeedsYou, NeedsYouItem } from "../components/hub/NeedsYou";
import SectionTitle from "../components/hub/SectionTitle";

const render = (element: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/dashboard"] }, element));

describe("NeedsYou", () => {
  it("says the list is clear instead of hiding the section", () => {
    const html = render(createElement(NeedsYou, null));
    expect(html).toContain("You&#x27;re up to date.");
  });

  it("uses a custom empty message when given one", () => {
    const html = render(createElement(NeedsYou, { emptyText: "Nothing to file." }));
    expect(html).toContain("Nothing to file.");
  });

  it("renders rows as links when given an href, buttons for onClick, and static rows otherwise", () => {
    const html = render(
      createElement(
        NeedsYou,
        null,
        createElement(NeedsYouItem, { tone: "amber", icon: AlertTriangle, title: "Linked", href: "/transactions" }),
        createElement(NeedsYouItem, { tone: "grey", icon: Gift, title: "Clickable", onClick: () => undefined }),
        createElement(NeedsYouItem, { tone: "sage", icon: Gift, title: "Static" })
      )
    );
    expect(html).toMatch(/<a [^>]*href="\/transactions"[^>]*>[\s\S]*Linked/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>[\s\S]*Clickable/);
    expect(html).toMatch(/<div class="[^"]*">[\s\S]*Static/);
    expect(html).not.toContain("You&#x27;re up to date.");
  });

  it("shows the action label in place of the chevron", () => {
    const withAction = render(
      createElement(NeedsYouItem, { tone: "amber", icon: AlertTriangle, title: "Transfers to pair", action: "2" })
    );
    expect(withAction).toContain(">2</span>");
    const withoutAction = render(createElement(NeedsYouItem, { tone: "amber", icon: AlertTriangle, title: "Plain" }));
    expect(withoutAction).toContain("<svg");
    expect(withoutAction).not.toContain(">2</span>");
  });
});

describe("HeroCard", () => {
  it("draws a legend entry and a bar segment for each split", () => {
    const html = render(
      createElement(HeroCard, {
        label: "Funds held",
        value: "£10,000",
        sub: "Breaking even",
        segments: [
          { label: "Unrestricted", value: "£7,000", amount: 7000, colour: "#a9cfa9" },
          { label: "Restricted", value: "£3,000", amount: 3000, colour: "#8f877e" },
        ],
      })
    );
    expect(html).toContain("Funds held");
    expect(html).toContain("£10,000");
    expect(html).toContain("Breaking even");
    expect(html).toContain("<dt");
    expect(html).toContain("Unrestricted");
    expect(html).toContain("£3,000");
    expect(html).toContain("flex-grow:7000");
    expect(html).toContain("flex-grow:3000");
  });

  it("omits the legend when there are no segments", () => {
    const html = render(createElement(HeroCard, { label: "Funds held", value: "£0" }));
    expect(html).not.toContain("<dl");
  });
});

describe("HubHeader", () => {
  it("renders the eyebrow, title, status and actions", () => {
    const html = render(
      createElement(HubHeader, {
        eyebrow: "Friday 9 October",
        title: "October so far",
        status: "Bank data last synced today.",
        actions: createElement("button", { type: "button" }, "Record giving"),
      })
    );
    expect(html).toContain("Friday 9 October");
    expect(html).toContain("<h1");
    expect(html).toContain("October so far");
    expect(html).toContain("Bank data last synced today.");
    expect(html).toContain("Record giving");
  });

  it("leaves out the actions wrapper when there are none", () => {
    const html = render(createElement(HubHeader, { title: "Plain" }));
    expect(html).not.toContain("flex-wrap gap-2.5");
  });
});

describe("SectionTitle", () => {
  it("links to the page named in link", () => {
    const html = render(
      createElement(SectionTitle, { link: { label: "All funds", to: "/funds" }, children: "Funds to watch" })
    );
    expect(html).toContain("<h2");
    expect(html).toContain('href="/funds"');
    expect(html).toContain("All funds");
  });

  it("renders without a link when none is given", () => {
    const html = render(createElement(SectionTitle, { children: "Needs you" }));
    expect(html).toContain("Needs you");
    expect(html).not.toContain("<a ");
  });
});

describe("HubLayout", () => {
  it("puts the receipt in an aside beside the page", () => {
    const html = render(
      createElement(HubLayout, {
        receipt: createElement("p", null, "Receipt body"),
        children: createElement("p", null, "Page body"),
      })
    );
    expect(html).toContain("<aside");
    expect(html).toContain("Receipt body");
    expect(html).toContain("Page body");
  });

  it("has no aside when there is no receipt", () => {
    const html = render(createElement(HubLayout, { children: createElement("p", null, "Page body") }));
    expect(html).not.toContain("<aside");
  });
});
