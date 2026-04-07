# UI Inventory

## 1. Layout Components
*   **`Sidebar` (Redesign):** Grouped navigation, "active" state indication with black pill or left-border.
*   **`TopBar`:** Breadcrumbs, DateRangePicker (Minimalist), User Profile.
*   **`PageShell`:** Wrapper with consistent "Monumental" padding.

## 2. Dashboard Widgets
*   **`IndustrialKPI`:**
    *   Props: `label`, `value`, `icon`, `trend?`.
    *   Style: Light grey background, strong black value text.
*   **`StatusProgressWidget`:**
    *   Visual: Horizontal bar split by percentage.
    *   Usage: Petrol vs Diesel, Budget vs Spend.
*   **`MinimalistBarChart`:**
    *   Library: Recharts.
    *   Style: No grid, no axis lines (or very subtle), black bars, custom tooltip (black/yellow).

## 3. Fleet & Data Widgets
*   **`ScatterMatrix` (Upgrade):**
    *   Style: Black/Grey dots. Yellow selection.
*   **`RankingList`:**
    *   Style: Clean list with progress bars for values.

## 4. Shadcn Primitives (Required)
*   `Card`
*   `Button`
*   `Progress`
*   `Separator`
*   `Badge`
