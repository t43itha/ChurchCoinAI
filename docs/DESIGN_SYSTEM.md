# ChurchCoin Design System

## Refined Ledger

ChurchCoin uses a Refined Ledger design language: calm financial software with warm paper backgrounds, white panels, 1px hairline borders, soft elevation, compact mono labels, amber navigation accents, and sage success states.

The current design source is `C:\Users\tabit\_Projects\ChurchCoinAI\churchcoin`. Key references in that folder:

- `pages.jsx`: shared page shell, panel, table, stat strip, and button patterns.
- `dashboard.jsx`: dashboard chrome variants and KPI/readiness patterns.
- `donors.jsx`: donor master-detail layout.
- `settings.jsx`: organisation settings tabs and card sections.
- `clerk-auth.jsx` and `clerkAppearance.refined-ledger.ts`: Clerk auth styling.

## Principles

1. **Calm ledger UI**: keep the app precise and accounting-led without neo-brutalist weight.
2. **Soft structure**: use white panels, 1px borders, 12px radii, and subtle shadows.
3. **Warm restraint**: paper backgrounds, amber accents, and sage status states carry the brand.
4. **Dense but readable**: page headers, stat strips, master-detail layouts, and tables should be easy to scan.
5. **Mono for ledger semantics**: use JetBrains Mono for labels, amounts, dates, and codes; use DM Sans for the main interface.
6. **No hard shadows in app chrome**: hard offset shadows belong to the older/current variant only, not the selected Refined Ledger direction.

## Tokens

| Token | Hex | Usage |
| --- | --- | --- |
| Ink | `#1c1917` | Primary text, dark buttons |
| Charcoal | `#2a2522` | Primary button hover |
| Paper | `#faf9f7` | Main app background |
| Panel Tint | `#fcfbf9` | Card headers and subtle table headers |
| Line | `#e7e5e1` | Panel borders and dividers |
| Subtle Line | `#efeee9` | Table row and internal dividers |
| Grey Dark | `#44403c` | Secondary text |
| Grey Mid | `#78716c` | Muted text and mono labels |
| Grey Light | `#f7f6f4` | Neutral hover surfaces |
| Sage | `#557555` | Success text |
| Sage Mid | `#6b8e6b` | Success dots and icons |
| Sage Wash | `#eef3ee` | Success badges and panels |
| Sage Line | `#cfe0cf` | Success badge border |
| Amber | `#a9743f` | Active navigation and links |
| Amber Mid | `#c79a5f` | Accent dots and active row rule |
| Amber Wash | `#faf2e9` | Active nav, selected donor rows, warnings |
| Amber Line | `#ecd8bd` | Warning badge border |
| Error | `#b53d3d` | Destructive and negative states |
| Error Mid | `#c64545` | Error dots and icons |
| Error Wash | `#fbeded` | Error badges |

These values are implemented in [tailwind.config.cjs](../tailwind.config.cjs) and [styles.css](../styles.css).

## Typography

Use `DM Sans` for the main UI and `JetBrains Mono` for ledger data.

Common label pattern:

```tsx
<span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-grey-mid">
  Donor Directory
</span>
```

Amount/date pattern:

```tsx
<span className="font-mono tabular-nums font-bold text-ink">£12,480.00</span>
```

## Components

### Panels

Panels use the handoff `PANEL` model:

```tsx
<section className="swiss-card">
  ...
</section>
```

Rendered style: white background, `1px solid #e7e5e1`, `12px` radius, clipped overflow, and very soft elevation. Avoid hard offset shadows for Refined Ledger pages.

### Page Headers

Authenticated pages should start with a white panel header containing a clear title, muted subtitle, and right-aligned actions where needed. This mirrors the `Page` component in the handoff.

### Buttons

Primary buttons are ink-filled with a soft hover lift:

```tsx
<button className="btn-primary px-4 py-2 font-semibold">
  Record Cash
</button>
```

Secondary/ghost buttons are white, hairline bordered, and softly tinted on hover. Use amber for active navigation and sage for success actions/status.

### Tables

Tables use `ledger-table`: hairline border, 12px radius, `#fcfbf9` headers, uppercase mono labels, and subtle row dividers. Hover state uses amber wash.

### Badges

Use understated dot/status styles rather than heavy pills where possible. Semantic badge classes:

- `badge-success`: sage wash, sage text, sage line.
- `badge-warning`: amber wash, amber text, amber line.
- `badge-error`: error wash, error text, error line.

## Page Patterns

### Dashboard

Use the Refined Ledger dashboard chrome: soft white header panel, period control as a rounded bordered button/select, dark primary “Record cash” action, KPI cards with tone-specific icon chips, and readiness sections with internal dividers.

### Donors

Use a master-detail layout. The left donor directory has a compact search field and selected rows highlighted with amber wash and a left amber rule. The right detail pane uses tabs for overview, history, profile, and communication.

### Clerk Auth

Clerk surfaces follow `clerkAppearance.refined-ledger.ts`: white card, 1px line border, 12px radius, soft shadow, DM Sans body, mono uppercase labels, ink primary buttons, amber links, and sage avatar/user status rings.

### Settings

Settings uses a tabbed Refined Ledger layout: top tabs with uppercase mono text and active ink underline, then section cards for organisation profile, funds, categories, users, invitations, and bank connections.

## File References

| Area | Active File |
| --- | --- |
| Global CSS utilities | [styles.css](../styles.css) |
| Tailwind tokens | [tailwind.config.cjs](../tailwind.config.cjs) |
| Clerk appearance | [components/AuthPage.tsx](../components/AuthPage.tsx) |
| Dashboard | [components/Dashboard.tsx](../components/Dashboard.tsx) |
| Donors | [components/DonorManager.tsx](../components/DonorManager.tsx) |
| Settings | [components/Settings.tsx](../components/Settings.tsx) |

## Implementation Notes

When changing UI, compare against the exported handoff screens and JSX in `churchcoin/`. Prefer the shared classes in `styles.css` and the Tailwind tokens before introducing one-off colour values.

Do not use the nearby `C:\Users\tabit\_Projects\churchcoin-new` project as the design source for this app.
