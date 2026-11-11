---
name: Motion Fuel Analyzer
description: A municipal fuel-accounting console that says what happened in words, then shows the evidence.
colors:
  ink: "#0B1324"
  municipal-blue: "#1D4ED8"
  sky: "#60A5FA"
  slate: "#64748B"
  canvas: "#EEF2F8"
  wash: "#D6E4FB"
  card: "#FFFFFF"
  surface-2: "#F4F7FB"
  line: "#E2E8F1"
  grid: "#EBEFF5"
  bar: "#D5E0F1"
  body-ink: "#0F172A"
  muted-ink: "#5B6B82"
  ok: "#15803D"
  warn: "#B45309"
  crit: "#B91C1C"
  night-canvas: "#090E18"
  night-card: "#111827"
  night-ink: "#E6ECF5"
  night-muted-ink: "#9AAAC0"
  night-blue: "#3B82F6"
  night-sky: "#93C5FD"
typography:
  ui:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
rounded:
  card: "22px"
  tile: "18px"
  control: "999px"
---

# Design system: Motion Fuel Analyzer

This replaces the earlier "Audit Trail" system. The source of truth is the
six-screen prototype made in Claude Design; the tokens live in
`app/globals.css` and the shared pieces in `components/fuel/`,
`components/ui/` and `components/brand/`.

## Six rules

1. **One ink mark per chart.** The selected or most important mark is ink;
   everything else is a pale bar. Colour is never used for variety.
2. **Every number has a "compared to".** A KPI carries a delta, a share or a
   reference; a bare figure is unfinished.
3. **Words before charts.** Each page opens with a sentence (`.bigline`) that
   states the finding. The chart underneath is the evidence.
4. **Two clicks to the plate.** Any unit number is a `Plate` that opens the
   vehicle panel.
5. **Motion only on change.** Things move when the selection, the period or
   the data changes. The liquid in the tank gauge is the single ambient motion.
6. **Status is shape plus colour.** Severity is a dot or a diamond as well as
   a hue, so it survives greyscale and colour-blindness.

## Colour

| Role | Light | Dark | Used for |
|---|---|---|---|
| Ink (`--primary`) | `#0B1324` | `#E6ECF5` | Primary button, selected tab, the one emphasised chart mark, the menu bar |
| Municipal Blue (`--brand`) | `#1D4ED8` | `#3B82F6` | Links, focus ring, diesel, liquid, ordinary chart marks |
| Sky (`--sky`, chart-1) | `#60A5FA` | `#93C5FD` | Petrol |
| Slate (`--slate`, chart-3) | `#64748B` | `#94A3B8` | Receipts |
| Canvas | `#EEF2F8` with `#D6E4FB` blooms | `#090E18` | Page background only |
| Card | `#FFFFFF` | `#111827` | Every surface |
| Surface 2 | `#F4F7FB` | `#0E1522` | Table headers, inset panels, tracks |
| Muted ink | `#5B6B82` | `#9AAAC0` | Secondary text, axis labels |
| ok / warn / crit | `#15803D` / `#B45309` / `#B91C1C` | `#4ADE80` / `#FBBF24` / `#F87171` | Status, each with a `-soft` fill |

Emphasis is ink, not blue. Blue means "you can act on this" or "this is
diesel". Petrol's sky blue does not reach 3:1 on white, so every chart that
uses it also carries direct labels and a table view.

## Type

Instrument Sans for the interface; IBM Plex Mono (`.mono`) for anything a
person might read back to someone else: unit numbers, vote codes, dates,
litres and money in tables. Page title 25px/600, card title 16px/600, summary
sentence 22px/600, body 13 to 14px, table header 11.5px/500. No uppercase
labels, no weights above 600.

## Shape and surface

Cards are flat: 22px radius, 1px line, 18px padding, no shadow, no blur, no
gradient. KPI tiles use 18px. Buttons, tabs, inputs and badges are pills.
Popovers and the vehicle drawer are the only elevated surfaces. Page sections
sit 14px apart (`gap-3.5`).

## Components

- **Menu** (`TopNav`, `Seg`): three groups in an ink segmented control with a
  sliding white pill; the pages of the open group are pill tabs beneath.
  A sidebar layout is available per browser from Settings.
- **PageHeader**: title plus two or three scope facts, actions on the right.
- **Summary** (`.bigline`): one sentence, one supporting line.
- **KPI tile** (`.kpi`, `IndustrialKPI`): label, value, then context or delta.
- **ChartCard**: title, sub-label, legend, and a chart/table toggle on every chart.
- **Charts** (`components/fuel/charts.tsx`): `CapsuleColumns`, `RankedBars`,
  `PairedBars`, `MirroredBars`, `DotStrip`, `DailyLine`, `Sparkline`. Flat
  fills, y from zero, labels on the marks when there are 12 or fewer.
- **Plate** and **VehiclePanel**: the unit number and the drawer it opens.
- **Tables**: surface-2 header with rounded ends, hairline rows, mono figures.
- **Toast**: ink pill, bottom centre, with Undo for five seconds after any
  action that changes a record.

## Motion

| What | Duration | Curve |
|---|---|---|
| Press | 150ms, scale 0.96 | spring |
| Menu and tab indicator | 320ms | spring `cubic-bezier(.34,1.36,.64,1)` |
| Figures rolling on period change | 450ms, tiles 35ms apart | ease-out `cubic-bezier(.22,1,.36,1)` |
| Chart marks on load | 700ms | spring |
| Drawer | 340ms in, 260ms out | spring in, ease-out out |
| Liquid level | 900ms | ease-out |

Selection changes are transitions, so they retarget mid-flight. Hover effects
are gated to hover-capable pointers. With reduced motion, movement is removed
and colour and opacity changes remain.

## Logo

Ink on light, near-white on dark, through `currentColor`. Never blue, never in
a circle or tinted box, never a spinner or watermark. The full logo appears at
240px or wider (sign-in, landing, Settings → About); the square mark is used
in the menu and the favicon.

## Do not

- Show a figure the data cannot support. Say what is missing instead.
- Use pies, donuts, coloured bars for variety, glass, blur or card gradients.
- Add a second ambient animation.
- Use emoji or mix icon families (lucide, 2px stroke, throughout).
- Add FIS and FRE together.
