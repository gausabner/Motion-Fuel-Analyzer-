# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three roles share one system, each doing a different job with the same data.

- **Fuel / fleet officer — depot office, daily.** Reconciles issues against
  receipts, chases vote numbers that do not resolve to a cost centre, and
  investigates readings that look wrong. Knows the data intimately and works
  through it at a desk during office hours. The highest-frequency user.
- **Finance or audit officer — monthly and at audit.** Produces cost-centre
  spend, attribution and recovery figures for council reporting. Needs the
  numbers to be defensible and exportable as evidence, which matters more here
  than operational speed.
- **Fleet manager / supervisor — operational oversight.** Watches consumption
  per unit, identifies abnormal usage, and makes decisions about specific
  vehicles.

Access is enforced by role: `SUPER_ADMIN` and `SYSTEM_ADMIN` are the
administrative roles (`ADMIN_ROLES` in `lib/auth.ts`); `EMPLOYEE` is the
default on registration, and registration requires approval.

## Product Purpose

Account for every litre of fuel a municipal fleet issues, and attribute it to
the cost centre that spent it.

Before this existed there was no systematic analysis. Fuel issues were being
recorded, but nobody could answer where the litres went, which units were
abnormal, or how much of the spend was properly attributed. The product turns
the periodic HR reports into a standing answer to those questions.

Success is that a figure on screen can be taken into a council report or an
audit without being re-derived by hand.

## Positioning

Attribution is the mechanism, not reporting. The product resolves each
transaction's vote number to a registered cost centre, self-heals vote
prefixes, measures the share of litres that actually attribute, and names the
codes and volume that do not — rather than asserting full allocation. A
neighbouring fuel-reporting tool shows totals; this one shows what portion of
the total it can stand behind, and links straight to the unresolved remainder.

## Operating Context

- Data arrives as periodic **HR-series report exports** (HR580, HR640, HR940),
  uploaded through the app rather than entered by hand.
- Two distinct flows that are never summed: **FIS** (fuel issued to vehicles)
  and **FRE** (fuel received into storage). Confusing them is the core domain
  error the product exists to prevent.
- **Vote numbers** are the attribution key, mapping transactions to cost
  centres (departments and divisions such as Solid Waste Management, Public
  Transport, Traffic Management, Emergency Services).
- Currency is the **Namibian dollar (N$ / NAD)**, configurable in Settings and
  never hardcoded in the interface.
- Fuel types are Petrol, Petrol Unleaded and Diesel; volumes in litres,
  typically whole litres.
- Outputs leave the system as CSV per table and PDF for the full report.

## Capabilities and Constraints

- Dashboards for consumption, fleet units, cost centres, period comparison,
  and FIS vs FRE reconciliation.
- Upload and ingest of HR-series reports, with uploaded files retained and
  re-downloadable by administrators.
- A registry for resolving unassigned vote numbers to cost centres.
- Real credentials-based authentication; API routes gated by session and role;
  CSP enforced in middleware.
- Prisma over SQLite. Scale at the time of writing: 921 fleet units, 27,419
  FIS transactions, 1,851,214 L, N$37,490,206.92.
- Next.js App Router with Tailwind v4, Recharts and Radix. Note: this Next.js
  version has breaking changes from model training data — `node_modules/next/dist/docs/`
  is the source of truth, per AGENTS.md.
- **Undecided:** whether the product becomes multi-tenant. It serves one
  organisation today but is intended to be productised for other municipalities
  later, so one council's specifics should not be hard-coded. No tenant
  separation exists yet.

## Brand Commitments

- The product is **Motion Fuel Analyzer**; the mark reads "motion" with the
  line "advanced management systems", which is a vendor identity rather than a
  single council's.
- The interface language is plain and operational. Figures are the subject;
  the product states what it can and cannot account for rather than rounding
  the difference away.
- Display formatting is centralised in `lib/format.ts` and the currency symbol
  comes from `SystemSettings`, never a literal.

## Evidence on Hand

- Real operating data in `prisma/dev.db`, including genuine August 2025
  consumption (`sample_fuel_data.xlsx` is real data, not a fixture).
- Planning documents: `UI_Redesign_Plan.pdf`, `Unresolved_Votes_Remediation_Plan.pdf`,
  `SECURITY_HARDENING_PLAN.md`.
- 97 passing unit tests covering vote resolution, transaction filters and
  pagination.
- `START_HERE_PROMPT.md` describes a "Hudson 8" black-and-yellow industrial
  direction that the shipped interface does **not** follow — it is superseded
  evidence, not a live brief.
- `README.md` is unmodified create-next-app boilerplate and carries no product
  truth.
- **No** customer list, testimonials, pricing, benchmarks, deployment or
  licensing claims exist. Future work must not invent them, and must not name
  the municipality unless the user supplies it.

## Product Principles

1. **Never assert what has not been measured.** A coverage figure is computed
   from the data and linked to its exceptions; a hardcoded "100% allocated"
   card is the failure mode this product was built against.
2. **One number, one format, everywhere.** The same quantity reads identically
   on every screen and in every export, or the reader stops trusting all of it.
3. **Issues and receipts are separate flows.** They are never summed, and any
   view that puts them together has to say which is which.
4. **Exceptions are the product.** Unassigned votes, reversals hidden by an
   average, zero-row imports and abnormal units are surfaced and linked, not
   smoothed over.
5. **Built for repetition.** The primary user performs the same reconciliation
   many times a day; anything that adds delay to a repeated action is a cost,
   not a flourish.

## Accessibility & Inclusion

**WCAG 2.1 AA is required** — public-sector procurement applies. Future work
must hold that bar: contrast ratios on text and on chart marks, keyboard
reachability for every control including drill-downs, accessible names on all
inputs, one visible `h1` per route, and identity in charts never carried by
colour alone.
