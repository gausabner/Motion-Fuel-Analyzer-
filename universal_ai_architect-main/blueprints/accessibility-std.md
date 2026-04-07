# ♿ Universal Accessibility & UX Standards

**Status:** Mandatory Requirement for all Generated Dashboards

## 1. Visual Accessibility (Contrast & Color)

* **Contrast Ratio:** All text and meaningful UI elements (icons, borders) must meet **WCAG 2.1 AA** standards (at least 4.5:1 for normal text).
* **Color as Meaning:** Never use color as the *only* indicator of status.
* *Bad:* A red dot for "Error."
* *Good:* A red dot + an "Error" icon or text label.


* **Focus States:** Every interactive element (buttons, inputs, links) must have a visible `:focus` or `:focus-visible` ring using the theme’s primary brand color.

## 2. Interactive Elements (Touch & Click)

* **Tap Targets:** All clickable elements must be at least **44x44 pixels** to ensure usability on mobile and for users with limited motor control.
* **Loading States:** Every data-fetching component must include a **Skeleton Loader** or a subtle "Progress" indicator to prevent "Layout Shift" (CLS).
* **Empty States:** If a dashboard widget has no data, it must display a "No Data Found" message rather than simply being blank.

## 3. Screen Reader Support (ARIA)

* **Semantic HTML:** Use proper tags instead of generic `div`s.
* `<nav>` for sidebars.
* `<main>` for the dashboard content.
* `<header>` for the top bar.
* `<table>` or `aria-grid` for data displays.


* **Labels:** Every input must have a corresponding `<label>`. Icons without text must have an `aria-label` (e.g., a "Trash" icon must have `aria-label="Delete Item"`).

## 4. Responsive Behavior (The 10-Second Scan)

* **Hierarchy:** On mobile, the most critical "KPI Cards" from the screenshot must be displayed at the very top of the scroll.
* **Data Density:** Tables must be horizontally scrollable or converted to "Card stacks" on screens smaller than 768px.
* **Font Scaling:** Use `rem` units exclusively. Base font size must be `1rem` (typically 16px).

## 5. Keyboard Navigation

* **Tab Order:** Users must be able to navigate the entire dashboard using only the `Tab` and `Shift + Tab` keys in a logical top-to-bottom, left-to-right flow.
* **Modals:** When a modal/dialogue opens, focus must be trapped within that modal until it is closed.

