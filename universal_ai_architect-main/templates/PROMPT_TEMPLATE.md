# 📝 Master Prompt Template (For Coding IDE)

**Objective:** This template is used by the Architect to generate the `START_HERE_PROMPT.md` for the specific project.

---

## [ARCHITECT: USE THE CONTENT BELOW TO GENERATE THE PROJECT PROMPT]

**Role:** You are an expert Full-Stack "Applied AI" Engineer. Your goal is to build a high-fidelity, production-ready application with dashboard based on the provided screenshot and project context.

### 📂 Step 1: Initialize Context

Before writing any code, you **MUST** read the following context files located in the `.brainchain/` directory:

1. **`data-model.md`**: To understand the variables, schemas, and data relationships.
2. **`design-tokens.md`**: To get the exact hex codes, spacing, and typography rules.
3. **`ui-inventory.md`**: To see the full list of components required.
4. **`project-requirements.md`**: To review the specific feature priorities and user roles.

### 📋 Step 2: Global Rules & Standards

You must strictly adhere to the following universal standards (located in the Universal Repo):

* **Code Quality:** Refer to `framework-rules.md` (Next.js App Router, Tailwind, Shadcn/UI).
* **Accessibility:** Refer to `accessibility-std.md` (WCAG compliance, semantic HTML).
* **UX Layout:** Refer to `dashboard-patterns.md` (F-pattern hierarchy, KPI placement).

### 🛠️ Step 3: Execution Plan

1. **Phase 1 (The Foundation):** Upgrade the `layout.tsx` and the primary Navigation/Sidebar shell.
2. **Phase 2 (The Layout):** Upgrade the main dashboard grid based on the screenshot’s visual hierarchy.
3. **Phase 3 (The Components):** Upgrade individual widgets (KPI cards, charts, tables).
4. **Phase 4 (The Polish):** Apply the "Applied AI" magic—add subtle animations (Framer Motion), loading skeletons, and hover states.

### 🚨 Constraints

* **Visual Fidelity:** The layout must be a pixel-perfect match to the attached screenshot.
* **No Hallucinations:** Use only the technologies specified in `framework-rules.md`.
* **Clean Code:** Export reusable components into the `@/components` directory.

**"Read the context, look at the image, and let's build something world-class. Ready to start with Phase 1?"**

