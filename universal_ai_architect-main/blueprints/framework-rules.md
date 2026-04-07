# 🛠️ Applied AI Framework Rules & Coding Standards

**Objective:** Ensure all generated code is production-ready, highly performant, and follows modern React/Next.js best practices.

## 1. Core Tech Stack (The "Modern Stack")

* **Framework:** Next.js (Latest Stable) using **App Router** (`/app` directory).
* **Styling:** **Tailwind CSS** (Utility-first approach).
* **Components:** **Shadcn/UI** (Radix UI + Tailwind) for core primitives.
* **Icons:** **Lucide React**.
* **Types:** **TypeScript** (Strict mode). No `any` types allowed.
* **State Management:** Use `React Context` or `Zustand` for global state; `React Query` for server-state/data-fetching.

## 2. Component Architecture

* **Atomic Design:** Keep components small and focused.
* `components/ui`: Shadcn primitives (Input, Button, Card).
* `components/shared`: Reusable custom components (Sidebar, Navbar).
* `components/dashboard`: Page-specific features (RevenueChart, LeadTable).


* **Server vs. Client:** Use **Server Components** by default. Only add `'use client'` at the top of files that require interactivity (hooks, event listeners).
* **Prop Types:** Every component must have an interface/type definition for its props.

## 3. Tailwind & Styling Standards

* **No Arbitrary Values:** Avoid `w-[342px]`. Use standard Tailwind scales (`w-64`, `w-full`).
* **Conditional Classes:** Use the `cn()` utility (clsx + tailwind-merge) for dynamic classes.
* *Example:* `className={cn("text-sm", isActive && "text-blue-600")}`


* **Responsive Design:** Always code **Mobile-First**. Use `sm:`, `md:`, `lg:`, and `xl:` prefixes to handle larger screens.
* **Dark Mode:** Use the `dark:` variant for all components. Refer to CSS variables (e.g., `bg-background`, `text-foreground`) instead of hardcoding hexes where possible.

## 4. AI-Specific Coding Instructions

* **No Placeholders:** Never write `// Logic goes here`. Write the actual logic or at least a functional mock.
* **Real Data Mapping:** Map components to the fields defined in `data-model.md`. Do not invent generic variable names like `item1`, `item2`.
* **Self-Documenting Code:** Use descriptive variable and function names. Add brief JSDoc comments for complex logic.
* **Error Handling:** Include basic error boundaries and "Loading" states for all data-dependent components.

## 5. Directory Structure Standards

All new projects must follow this directory map:

```
├── app/                  # App Router (Pages & Layouts)
├── components/           # UI, Shared, and Feature components
├── hooks/                # Custom React hooks
├── lib/                  # Utility functions (utils.ts, constants.ts)
├── public/               # Static assets (images, fonts)
├── types/                # Global TypeScript definitions
└── styles/               # Global CSS (globals.css)

```