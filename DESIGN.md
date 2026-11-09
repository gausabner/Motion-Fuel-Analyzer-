---
name: Motion Fuel Analyzer
description: A municipal fuel-attribution console that shows what it can account for and links to what it cannot.
colors:
  action-blue: "#2563EB"
  ink: "#0F172A"
  paper: "#F8FAFC"
  card-white: "#FFFFFF"
  rule: "#E2E8F0"
  secondary-ink: "#64748B"
  blue-tint: "#DBEAFE"
  alarm-red: "#DC2626"
  petrol-blue: "#2A78D6"
  diesel-orange: "#EB6834"
  receipt-aqua: "#1BAF7A"
  night-canvas: "#0B1220"
  night-card: "#111C33"
  night-rule: "#1E293B"
  night-ink: "#F8FAFC"
  night-secondary-ink: "#94A3B8"
  night-petrol: "#3987E5"
  night-diesel: "#D95926"
  night-receipt: "#199E70"
typography:
  display:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.022em"
  headline:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.1em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  pill: "99px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    typography: "{typography.label}"
  button-primary-active:
    backgroundColor: "{colors.action-blue}"
    size: "0.97"
  button-outline:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card-surface:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  kpi-tile:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  kpi-tile-active:
    backgroundColor: "{colors.card-white}"
    size: "0.985"
  input-field:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "36px"
  table-head:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card-white}"
    typography: "{typography.label}"
    height: "48px"
  sidebar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.rule}"
    width: "224px"
---

# Design System: Motion Fuel Analyzer

## Overview

**Creative North Star: "The Audit Trail"**

Every number on screen has to be traceable to the transaction that produced it.
The interface's job is not to summarise fuel consumption attractively — it is to
show exactly how much of the total it can stand behind and to put the
unaccounted remainder one click away. Where a conventional dashboard would round
a gap away, this one names it: *28 codes · 47,624 L unassigned*, linked straight
to the registry that resolves them.

That purpose sets the density and the restraint. Surfaces are flat white cards
on a cool slate canvas, separated by a single hairline rule, because anything
more would be decoration competing with figures that end up in a council report.
Exactly one saturated colour exists in the chrome — Action Blue — and it means
"you can act here". The sidebar is ink in both light and dark, so the frame of
the application never moves while the data inside it changes.

The two rejected worlds are on record. An earlier industrial black-and-yellow
direction ("Hudson 8") was abandoned and must not be picked back up. The generic
SaaS dashboard — gradient hero tiles, purple-blue accents, rounded-everything,
emoji section markers — is the default this system exists in opposition to.

**Key Characteristics:**

- Flat surfaces, hairline borders, no shadow anywhere
- One saturated accent in the chrome; colour otherwise belongs to data
- Figures in tabular numerals, grouped, with a non-breaking space before the unit
- Uppercase micro-labels at 12px with wide tracking, never below that floor
- Ink sidebar in both themes; the frame holds still
- Exceptions are surfaced and linked, never smoothed

## Colors

A cool, near-neutral system with one saturated blue for action and a separate
three-hue set reserved for data. Chrome colours and data colours never borrow
from each other.

### Primary
- **Action Blue** (`#2563EB`): The only saturated colour in the chrome. Primary
  buttons, the active sidebar item, focus rings, links. Its scarcity is what
  makes it legible as "this does something".

### Secondary
- **Blue Tint** (`#DBEAFE`): Selected and active surfaces, icon wells inside
  tiles. The quiet companion to Action Blue, never used for text.

### Tertiary — the data set
Reserved for chart series and never used for interface chrome. Assigned by
entity, so a filter that drops a series cannot repaint the ones that remain.
Validated in both themes: all-pairs CVD ΔE 9.2 light, 9.4 dark.

- **Petrol Blue** (`#2A78D6` / night `#3987E5`): Petrol volume, series slot 1.
- **Diesel Orange** (`#EB6834` / night `#D95926`): Diesel volume, series slot 2.
- **Receipt Aqua** (`#1BAF7A` / night `#199E70`): Fuel received (FRE), slot 3.

### Neutral
- **Ink** (`#0F172A`): Body text, table headers, and the sidebar ground in both
  themes.
- **Paper** (`#F8FAFC`): The page canvas that cards float on in light mode.
- **Card White** (`#FFFFFF`): Card and popover surfaces.
- **Rule** (`#E2E8F0`): Borders, dividers, chart gridlines.
- **Secondary Ink** (`#64748B`): Labels, captions, axis ticks.
- **Night Canvas** (`#0B1220`) / **Night Card** (`#111C33`) / **Night Rule**
  (`#1E293B`): The dark theme is ink-based rather than grey-based, so it reads
  as the same product at night rather than an inverted copy.

### Named Rules

**The One Action Colour Rule.** Action Blue is the only saturated hue in the
chrome. If a new element needs attention and is not actionable, it earns it
through weight, size, or position — never by introducing a second accent.

**The Data-Chrome Separation Rule.** Series colours are for marks only. An
interface element never borrows Petrol Blue or Diesel Orange, and a chart series
never uses Action Blue. Cross the line and the reader stops being able to tell
what is data and what is a control.

**The Measured Colour Rule.** Every series colour resolves from a CSS custom
property through `lib/chart-theme.ts`. A hex literal in a chart component is a
defect — it cannot follow the theme, and dark mode is where that shows.

## Typography

**Display / Body Font:** Outfit (with `ui-sans-serif, system-ui, sans-serif`)
**Label Font:** Outfit, uppercase with wide tracking
**Numerals:** Outfit with `font-variant-numeric: tabular-nums`

**Character:** A single geometric sans carries the whole system. Outfit's even
circular forms match the "motion" wordmark, and its tabular figures line up down
a column, which matters more here than typographic variety — most of the text in
this product is a number.

### Hierarchy
- **Display** (700, 1.875rem/30px, -0.022em): Page titles. One per route.
- **Headline** (800, 1.5rem/24px, -0.02em): KPI values, section figures. Sized
  by the card's own width rather than the viewport (see Layout).
- **Title** (700, 1.125rem/18px): Card titles, table captions.
- **Body** (400, 1rem/16px, 1.6): Running copy, descriptions, table cells.
- **Label** (600, 0.75rem/12px, 0.1em tracking, uppercase): Column headers, KPI
  labels, axis ticks, chart legends.

### Named Rules

**The 12px Floor Rule.** No text renders below 12px, anywhere, including SVG
labels inside charts. Recharts tick and legend sizes are px on SVG and do not
scale with the root, so they are set explicitly to 12 and checked separately.

**The Honest Root Rule.** The root font-size stays at the browser default. It
was once pinned to 68% to buy density, which silently overrode every reader's
own font-size preference and dropped body text to 10.88px. Density comes from
spacing — padding, gaps, sidebar width — never from shrinking the root em.

**The Tabular Figure Rule.** Any digit that appears in a column gets
`tabular-nums`. A number that shifts horizontally between rows cannot be scanned.

## Layout

A fixed ink sidebar (224px, `lg:pl-56` on the main region) beside a fluid content
column capped at 1600px, on a 4px spacing scale. Tight groups sit at 8–16px;
sections separate at 24–32px.

KPI tiles run in a responsive grid — four across on wide screens, two at tablet,
one on phones — at a 16px gutter. Cards carry 16px of internal padding, the same
step the rest of the layout uses: there is one card in this system and one
spacing step for it. Tables
scroll inside their own container so the page body never scrolls sideways.

**The Container-Sized Figure Rule.** A headline figure is sized by the width of
the card holding it, not by the viewport. Each KPI tile is a container query
scope, stepping 18 → 20 → 24 → 30px as the card crosses 170/230/310px. A viewport
breakpoint cannot distinguish a four-up row at 1280px from a three-up row at the
same width, which is how `N$37,021,710` once rendered at 30px in a 220px card.

**The No Side-Scroll Rule.** The page body never scrolls horizontally at any
width down to 375px. Only tables, charts and code may exceed the column, each in
its own `overflow-x: auto` container.

## Elevation & Depth

**Surfaces in this system have no shadows.** Cards, tiles, tables and panels are
flat at every state, including hover. The single exception is the floating
overlay — see the Overlay Exception below. Depth is carried entirely by a 1px border in Rule against the Paper
canvas, and by the ink sidebar sitting behind the content plane.

Interactive surfaces signal through border colour and a press scale, not by
lifting. A clickable KPI tile brightens its border toward Action Blue on hover
and compresses to 0.985 on press; a button compresses to 0.97. Nothing rises
off the page.

### Named Rules

**The Flat Surface Rule.** No `box-shadow` on any surface that sits in the page
plane — cards, tiles, tables, panels — in any state. If an element needs to
separate from its neighbour, it gets a border or more space. A shadow added to
signal interactivity is a sign the border and press states were not doing their
job.

**The Overlay Exception.** Something that genuinely floats above the plane and
is dismissed — a chart tooltip, a popover, a dialog — carries exactly one
elevation: `0 4px 16px -4px rgb(15 23 42 / 0.18)`. This is the only shadow in
the system, and it exists to say "this is temporary and above everything", not
to add depth.

## Shapes

Softly rounded rectangles on a 12px base radius (`--radius: 0.75rem`), stepping
down to 10px for medium controls and 8px for small ones. Pills (99px) appear
only on scrollbar thumbs and status badges.

Chart marks follow the same logic: bars carry a 3–4px radius on their data end
only, anchored flush to the baseline, so the rounding never implies the value
floats above zero. Stacked segments are separated by a 2px gap in the surface
colour rather than a stroke.

## Components

### Buttons
- **Shape:** Gently rounded (10px), 36px tall at default size.
- **Primary:** Action Blue ground, white label, 8px × 16px padding.
- **Outline / Ghost:** Card White or transparent ground with a Rule border.
- **Press:** `scale(0.97)` over 160ms on the soft ease-out curve. This is the
  only acknowledgement the operator gets before the query returns, so it is not
  optional.
- **Hover:** Background shifts only, gated behind `(hover: hover)` so a tap on a
  phone does not leave the state stuck.
- **Focus:** A 2px Action Blue ring at 2px offset, drawn outside the element so
  it never shifts layout.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Card White on Paper; Night Card on Night Canvas.
- **Shadow Strategy:** None, in any state. See Elevation & Depth.
- **Border:** 1px Rule.
- **Internal Padding:** 16px.

### KPI Tiles
The signature component. An icon well in Blue Tint, an uppercase label that
wraps rather than truncating, the figure in tabular numerals sized by container
query, and an optional sub-value. When the tile opens a drill-down it renders as
a `<button>` with an accessible name of the form "*label*: *value*. View
breakdown", so the figure is reachable and announced without a mouse.

### Inputs / Fields
- **Style:** Card White ground, 1px Rule border, 10px radius, 36px tall.
- **Focus:** The shared 2px Action Blue ring.
- **Labels:** Every control has one. Where the visual design carries the meaning
  (a search field behind a magnifier icon), the label is `sr-only` rather than
  absent — a placeholder is not a label.

### Tables
Ink header band with white uppercase labels at the 12px label style, 48px tall.
Rows separate on 1px Rule with a muted hover tint. Numeric columns are right
aligned and tabular. Long tables paginate rather than scroll indefinitely.

### Navigation
The ink sidebar, 224px, grouped under uppercase section headings (Overview,
Analysis, Data & Admin). The active item takes an Action Blue ground. Both the
desktop rail and the mobile sheet are `<nav>` landmarks with distinct accessible
names, and their section ids derive from a `useId()` so the two copies can
coexist in the DOM without colliding.

### Charts
- **Grid:** Horizontal rules only, in Rule at 70% opacity, with a solid baseline.
  No vertical gridlines, no dashes.
- **Axes:** 12px Secondary Ink ticks, no axis line, no tick marks. Volume axes
  speak in thousands (`8k`), not six-digit litres; the exact figure lives in the
  tooltip.
- **Marks:** 2px lines, bars capped at a sensible max width, 8px active dots.
- **Tooltip:** Card surface, 1px Rule border, 8px radius. Line and area charts
  get a dashed crosshair; bar and category charts get a translucent band.
- **Legend:** Present whenever two or more series are drawn; series with four or
  fewer members also carry direct labels so identity is never colour-alone.

### Named Rules

**The Press-Is-Feedback Rule.** Anything pressable compresses on `:active`.
Buttons 0.97, large tiles 0.985, both over 160ms. On a surface where most
actions wait on a database read, the press is the only immediate response the
interface can give.

**The Repeated-Action Rule.** Controls used dozens of times an hour — filters,
pagination, tab switches — get no entrance or exit animation. Motion on a
repeated action reads as latency, not polish.

## Do's and Don'ts

### Do:
- **Do** route every displayed number through `lib/format.ts`, and every chart
  colour through `lib/chart-theme.ts`. One quantity reads identically on every
  screen and in every export, or the reader stops trusting all of it.
- **Do** take the currency symbol from `SystemSettings`. A literal `N$` goes
  stale the moment Settings changes while every figure around it updates.
- **Do** state coverage as a measured share with a link to its exceptions.
- **Do** keep issues (FIS) and receipts (FRE) visually distinct and never summed.
- **Do** hold WCAG 2.1 AA: 4.5:1 on body text, 3:1 on large text and chart
  marks, keyboard reach for every drill-down, one visible `h1` per route.
- **Do** gate every hover style behind `@media (hover: hover)`.

### Don't:
- **Don't** add a `box-shadow` to any surface in the page plane, in any state.
  Only a floating, dismissible overlay gets the one elevation value.
- **Don't** introduce a second saturated accent into the chrome, or use a series
  colour on an interface element.
- **Don't** encode a categorical difference as two steps of one hue. Petrol and
  Diesel are different fuels, not more and less of one thing.
- **Don't** colour a mark by its rank. A filter that changes the set must not
  repaint the survivors; sorted bars already encode rank by position.
- **Don't** use `transition-all`, or any `ease-in` curve on an interface element.
- **Don't** pin a font size in px where the rem scale would do, and never render
  text below 12px.
- **Don't** put a coloured border wider than 1px on a card, list item or callout.
- **Don't** drift toward the abandoned "Hudson 8" black-and-yellow industrial
  direction, or toward the generic SaaS dashboard look — gradient hero tiles,
  purple-blue accents, emoji section markers.
