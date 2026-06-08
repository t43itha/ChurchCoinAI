# Named In-Person Donations Design

## Context

The `Record In-Person Giving` modal currently supports weekly service-level aggregate rows only. That newer service ledger is useful for bulk cash, PDQ, and cheque totals, but it regressed a previous capability: entering named donor contributions in the same cash collection workflow.

The previous implementation supported donor search, automatic donor matching/creation, Gift Aid flags, contribution category, fund selection, and payment method. The new design restores named donations while preserving the current service-total ledger.

## Goals

- Keep the current service-ledger workflow for fast bulk entry by service.
- Add a `Named Donations` tab inside the same modal for donor-attributed gifts.
- Link named donation transactions to donors and funds.
- Keep all service totals and named donations under one `cashCollectionId` so banking and reconciliation still happen as one in-person giving batch.
- Make both tabs usable on mobile without horizontal overflow.
- Keep `Week Ending` as the only batch-level date field.

## Non-Goals

- Do not restore the old `Petty Cash` tab in this change.
- Do not restore the old standalone `Category Totals` tab, because the current service ledger already handles aggregate service totals.
- Do not add a default service date field to the modal header.
- Do not create a separate cash collection for named donations.

## User Experience

The modal keeps the current header and `Week Ending` field. Below that, it has two tabs:

- `Service Totals`
- `Named Donations`

### Service Totals Tab

This tab preserves the current service ledger behavior:

- Service Date
- Service / Note
- Fund
- Cash
- PDQ
- Cheque
- Total

On desktop and tablet widths, this can remain a dense table for fast data entry. On mobile widths, service rows should render as stacked cards instead of relying on a wide horizontal table. Each card should group:

- Service Date and Fund
- Service / Note
- Cash, PDQ, and Cheque
- Row total and remove action

The add action remains a full-width dashed button at the bottom: `Add Service Row`.

### Named Donations Tab

This tab restores individual donor-attributed giving. Each row captures:

- Donor
- Category
- Fund
- Payment Method
- Amount
- Gift Aid
- Remove action

The category options should use the existing canonical income categories, with at least:

- `Tithes & First Fruits`
- `Donation`
- `Offerings`
- `Thanksgiving`

The fund selector should allow any valid organization fund so a named donation can be assigned to Building Fund, General Fund, or another restricted/designated fund.

The payment method should support:

- Cash
- Cheque
- Card

The donor field should reuse the existing donor search behavior from transaction editing/manual transaction creation. Selecting a donor should populate donor name, donor ID, and the donor's Gift Aid status when available. Typed donor names without a donor ID should be matched or created server-side using the existing cash collection donor matching helper.

The add action should mirror the service tab: one full-width dashed button at the bottom, labelled `Add Named Donation`.

On desktop and tablet widths, named donations can render as table-like rows for speed. On mobile widths, each donation should render as a stacked card with labels visible for every field.

## Data Model

No new tables are required.

Named donations should be represented as normal `transactions` rows with:

- `type: "Income"`
- `donorName`
- `donorId` when known or matched
- `fundId`
- `category`
- `amount`
- `paymentMethod`
- `isGiftAidEligible`
- `cashCollectionId`
- `date` set to the collection `weekEndingDate`

Service total transactions continue to be generated from service rows and linked to the same `cashCollectionId`.

The `cashCollections` table remains the batch header for in-person giving:

- `weekEndingDate`
- `collectionDate`
- `recordedAt`
- `recordedBy`
- `notes`
- `status`

For this design, the submitted `collectionDate` can be the same as `weekEndingDate` because the user confirmed the modal should not add a separate default service date. Individual service total rows still keep their own service dates in the generated transaction dates.

## Backend Contract

Extend `api.mutations.cashCollections.submitCollection` to accept both:

- `serviceRows`
- `namedDonations`

The mutation should accept submissions where either section has valid entries. A valid submission must contain at least one service row or one named donation.

Named donation input shape:

```ts
{
  donorName: string;
  donorId?: Id<"donors">;
  category: string;
  fundId: Id<"funds">;
  paymentMethod: "Cash" | "Cheque" | "Card";
  amount: number;
  isGiftAidEligible: boolean;
}
```

Backend validation:

- Verify each fund belongs to the current organization.
- Verify a supplied donor ID belongs to the current organization.
- For typed donor names without a donor ID, find or create the donor using the existing normalization helper.
- Reject named donation rows with no donor name, no fund, no category, or non-positive amount.
- Reject submissions with no valid service rows and no valid named donations.

Generated named donation transaction description:

```text
{category} - {donorName}
```

## Totals

The modal footer should show enough information to make the batch understandable:

- Service total
- Named donations total
- Gift Aid eligible total
- Batch total

The submit/save buttons should be enabled when the combined batch total is greater than zero.

## Transactions Page: In-Person Giving Tab

The `/transactions` In-Person Giving tab should continue to show one ledger row per cash collection. Named donations do not create separate collection rows. They increase the same collection's total and fund totals.

The collapsed collection row should still show:

- Week Ending
- Fund / Status
- Total
- Expand action

Fund totals should include both service total transactions and named donation transactions. For example, if a service row posts to General Fund and a named donation posts to Building Fund, the collapsed row should show both fund totals.

The expanded collection view should split the detail into two sections:

- `Service Totals`
- `Named Donations`

### Expanded Service Totals

This section should keep the current service summary table/card behavior:

- Day
- Service Date
- Service / Note
- Cash
- PDQ
- Cheque
- Total

Only service-generated transactions should appear here. The grouping helper can identify these through the existing `notes: "service:{serviceNote}"` marker.

### Expanded Named Donations

This section should list donor-attributed transactions linked to the same `cashCollectionId` but not marked as service rows. Each named donation should show:

- Donor
- Category
- Fund
- Payment Method
- Gift Aid status
- Amount

On mobile, named donations should render as cards rather than a wide table.

### Grouping Helper Changes

`lib/inPersonGiving.ts` should distinguish service rows from named donations instead of grouping every cash collection income transaction into service rows.

Recommended structure:

- Keep `rows` for service rows.
- Add `namedDonations` for donor-attributed transactions.
- Compute `total` from both sections.
- Compute `fundTotals` from both sections.
- Keep collections visible when either section has entries.

This avoids the current regression risk where named donations would be displayed as generic `Service` rows in the expanded ledger.

## Error Handling

Client-side validation should prevent obviously empty rows from being submitted.

Server-side validation remains authoritative and should return clear errors for:

- Invalid fund
- Invalid donor
- Missing donor name on named donation
- No valid entries in either tab

If the mutation fails, the modal should show the error in the existing error panel.

## Responsive Behavior

Both tabs must be usable at iPhone-width viewports.

Desktop/tablet:

- Service totals: table-like rows
- Named donations: table-like rows

Mobile:

- Service totals: stacked service record cards
- Named donations: stacked donation cards

The modal shell should preserve the recent mobile overflow fixes:

- Constrain width to the viewport.
- Use `min-w-0` on flex containers that hold wide content.
- Keep any unavoidable horizontal overflow inside the tab content, not on the page or modal shell.

## Testing

Manual browser checks:

- Open `/transactions`.
- Open `Record Cash`.
- Confirm the modal has `Service Totals` and `Named Donations` tabs.
- At desktop width, confirm both tabs are usable and totals update.
- At iPhone-width, confirm both tabs use stacked cards and do not cause page-level horizontal overflow.
- Enter a service row and a named donation, submit, and confirm transactions are created under one cash collection.
- Confirm named donation transactions appear in the transaction list with donor, fund, category, method, and Gift Aid metadata.
- Open the In-Person Giving tab and confirm the collection collapsed row includes named donation amounts in fund totals and total.
- Expand the collection and confirm service totals and named donations appear in separate sections.

Automated checks:

- Run `npm run typecheck`.
- Run `npm run build`.
- Add focused tests if the existing test setup can exercise the cash collection mutation without excessive scaffolding.
