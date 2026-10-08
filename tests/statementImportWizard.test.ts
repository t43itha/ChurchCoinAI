import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import StatementImportWizard from "../components/statementImport/StatementImportWizard";
import type { ImportReview } from "../components/statementImport/useImportReview";
import type { PendingReviewTransaction } from "../components/statementImport/types";
import type { Fund } from "../types";

vi.mock("convex/react", () => ({
  useQuery: () => [],
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
}));

const noop = () => {};

const funds: Fund[] = [{ _id: "general", name: "General Fund", type: "Unrestricted", balance: 0 }];

const namesFor = (type?: string) => (type === "Income" ? ["Offerings"] : type === "Expenditure" ? ["Insurance"] : []);

// The wizard only reads these fields; the rest of the hook is not used by the static render.
function fakeReview(rows: PendingReviewTransaction[] = []): ImportReview {
  return {
    isReviewOpen: rows.length > 0,
    isBankReview: false,
    openReview: noop,
    rows,
    duplicateWarnings: new Set<number>(),
    alreadyImportedRows: [],
    predictions: new Map(),
    isCategorising: false,
    categorisingCount: rows.length,
    statusMessage: "",
    isSyncingBank: false,
    isFetchingMoreBank: false,
    hasMoreBankRows: false,
    startStatementReview: () => true,
    addStatementRows: () => true,
    syncFromBank: async () => {},
    fetchNextBankBatch: async () => {},
    updateRow: noop,
    removeRow: noop,
    assignFundToAll: noop,
    includeAlreadyImported: noop,
    pairing: {
      suggestionFor: () => undefined,
      activeFor: () => undefined,
      isDismissed: () => false,
      partnerLabel: () => "",
      accept: noop,
      undo: noop,
      dismiss: noop,
    },
    categorise: async () => {},
    confirm: async () => ({ ok: false }),
    clear: noop,
  } as ImportReview;
}

const batch: PendingReviewTransaction[] = [
  {
    reviewRowId: "a",
    date: "2026-03-01",
    description: "J ADEYEMI · TITHE",
    amount: 250,
    type: "Income",
    category: "Offerings",
    fundId: "general",
  },
  {
    reviewRowId: "b",
    date: "2026-03-02",
    description: "BACS INSURANCE",
    amount: 20,
    type: "Expenditure",
    category: "Insurance",
    fundId: "general",
  },
];

const render = (props: { review?: ImportReview; initialStep?: "check" } = {}) =>
  renderToStaticMarkup(
    createElement(StatementImportWizard, {
      funds,
      categoryNamesFor: namesFor,
      review: props.review ?? fakeReview(),
      onClose: noop,
      initialStep: props.initialStep,
    })
  );

describe("statement import wizard", () => {
  it("opens on the upload step with the drop zone and bank tips collapsed", () => {
    const markup = render();
    expect(markup).toContain("Add your bank statement");
    expect(markup).toContain("Drop the file here");
    expect(markup).toContain("How do I download this from my bank?");
    expect(markup).toContain('accept=".csv,text/csv"');
    // Nothing is ready to add yet, so the check step's button is not shown.
    expect(markup).not.toContain("Add 2 transactions");
  });

  it("lists the steps on the rail and skips the fix step when no rows need fixing", () => {
    const markup = render();
    expect(markup).toContain("Check columns");
    expect(markup).toContain("Categorise");
    expect(markup).toContain("Check &amp; import");
    // The fix step is on the rail but struck through and not clickable.
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*line-through[^>]*>(?:(?!<\/button>)[\s\S])*Fix rows/);
  });

  it("renders the check step with the totals, the fund split and one button to add", () => {
    const markup = render({ review: fakeReview(batch), initialStep: "check" });
    expect(markup).toContain("Ready to add 2 transactions");
    expect(markup).toContain("Money in");
    expect(markup).toContain("Money out");
    expect(markup).toContain("Transfers paired");
    expect(markup).toContain("General Fund");
    expect(markup).toContain("+£230.00");
    expect(markup).toContain("Add 2 transactions");
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Add 2 transactions/);
  });

  it("disables the add button and says what still needs a category when a row has none", () => {
    const withGap: PendingReviewTransaction[] = [...batch, { ...batch[0], reviewRowId: "c", category: "" }];
    const markup = render({ review: fakeReview(withGap), initialStep: "check" });
    expect(markup).toContain("1 still need a category");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Add 3 transactions/);
  });
});
