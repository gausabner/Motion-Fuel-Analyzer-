# Design Tokens: "Industrial Monument"

## 1. Color Palette

### Primary (The Structure)
*   `--background`: `#FFFFFF` (White)
*   `--foreground`: `#151515` (Almost Black - Softer than pure black for text)
*   `--card`: `#F4F4F5` (Zinc-100 - Very light grey for cards, distinct from white bg)
*   `--card-foreground`: `#000000` (Pure Black)

### Accents (The "Caution" & "Action")
*   `--primary`: `#000000` (Black - Buttons, Active States)
*   `--primary-foreground`: `#FFFFFF` (White)
*   `--accent`: `#FDE047` (Yellow-300/400 - The "Hudson" Yellow)
*   `--accent-foreground`: `#000000`

### Muted / Borders
*   `--muted`: `#E4E4E7` (Zinc-200)
*   `--muted-foreground`: `#71717A` (Zinc-500)
*   `--border`: `#E4E4E7` (Zinc-200)

## 2. Typography

*   **Font Family:** `Inter` (Existing) or `Manrope`/`DMSans` if available.
*   **Headings:** Thick, Bold, Tight tracking.
    *   `h1`: `text-4xl font-extrabold tracking-tight`
    *   `h2`: `text-2xl font-bold tracking-tight`
*   **Body:** Clean, legible.
*   **Numbers:** Monospaced for tabular data, or `font-variant-numeric: tabular-nums`.

## 3. Spacing ("Monumental")

*   **Global Padding:** Increase standard container padding from `p-4` to `p-6` or `p-8`.
*   **Gap:** Increase grid gaps. `gap-6` minimum for major sections.
*   **Card Padding:** `p-6` internal padding for cards.

## 4. Radius

*   **Cards:** `rounded-xl` (12px) - Modern but solid.
*   **Buttons:** `rounded-md` (6px) or `rounded-full` depending on specific element from screenshot. (Screenshot shows slightly rounded corners, not pill). -> **Use `rounded-lg`**.

## 5. Shadows

*   **Style:** Very subtle, diffuse shadows. Or flat borders.
*   *Decision:* **Flat & Bordered**. The "Industrial" look often prefers structure over depth. Use `border border-zinc-100` and `shadow-sm`.
