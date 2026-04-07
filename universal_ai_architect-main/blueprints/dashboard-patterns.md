# 📊 Universal Dashboard Patterns & Layout Logic

**Objective:** Standardize the spatial organization and functional behavior of all generated dashboard interfaces.

## 1. The "F-Pattern" Hierarchy

* **Top-Left (Primary Branding):** Reserved for the Logo and Workspace Switcher.
* **Top-Right (User Actions):** Reserved for Notifications, Search, and User Profile.
* **Left Sidebar (Navigation):** Group links by "Management" (Data) vs "System" (Settings).
* **Main Content Area:** Must have a consistent `max-width` to prevent data from stretching too thin on ultra-wide monitors.

## 2. KPI & Metric Section (The "At-a-Glance" Layer)

* **Placement:** Always located at the absolute top of the `Main` content area.
* **Grid:** Use a responsive 4-column grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`).
* **Anatomy of a Stat Card:**
* **Label:** Small, muted text (e.g., "Total Revenue").
* **Value:** Large, bold primary text.
* **Trend:** A percentage change with a colored indicator (Green for positive, Red for negative).
* **Icon:** A subtle background-tinted icon for visual reinforcement.



## 3. Data Visualization (The "Insights" Layer)

* **Context over Clutter:** Charts must include a Legend and clear X/Y axis labels.
* **Aspect Ratio:** Maintain a consistent height for chart containers (e.g., `h-[300px]` or `h-[400px]`) to ensure the dashboard doesn't "jump" during render.
* **Interactivity:** Charts should have a "Hover Tooltip" behavior defined in the prompt.

## 4. Data Tables & Lists (The "Action" Layer)

* **Sticky Headers:** Tables longer than 10 rows must have a sticky header for context while scrolling.
* **Row Actions:** Action buttons (Edit, Delete, View) should stay pinned to the far right.
* **Pagination vs. Infinite Scroll:** Default to Pagination (Bottom-Right) unless the `project-requirements.md` specifies otherwise.
* **Empty States:** Use a "No results found" illustration or text if a filter returns 0 rows.

## 5. Navigation & Wayfinding

* **Active State:** The current page link must be visually distinct (e.g., bold text, left-border accent, or background highlight).
* **Breadcrumbs:** Always include breadcrumbs above the page title for deep-nested pages (e.g., `Home > CRM > Leads > Edit`).
* **Collapsible Sidebar:** On desktop, the sidebar should be collapsible to an icon-only "mini" state to maximize screen real estate.

## 6. Global Command / Search

* **Shortcuts:** Suggest `Cmd+K` or `Ctrl+K` as the global search trigger.
* **Results:** Group search results by category (e.g., "Pages," "Recent Leads," "Actions").
