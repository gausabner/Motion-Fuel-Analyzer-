import {
    LayoutGrid, GitCompareArrows, TriangleAlert, Truck, Users, ArrowLeftRight, Flame, Container,
    List, Upload, Table2, FileText, UserCog, Settings, BarChart3, type LucideIcon,
} from "lucide-react";

export type NavItem = { name: string; href: string; icon: LucideIcon; roles: string[]; badge?: "exceptions" | "registry" };
export type NavGroup = { title: string; icon: LucideIcon; items: NavItem[] };

const ALL = ["SUPER_ADMIN", "SYSTEM_ADMIN", "SYSTEM_HEAD", "EMPLOYEE"];
const STAFF = ["SUPER_ADMIN", "SYSTEM_ADMIN", "EMPLOYEE"];
const ADMIN = ["SUPER_ADMIN", "SYSTEM_ADMIN"];

/**
 * One source for both navigation layouts. Three groups, then the pages inside
 * each — the pill menu shows the groups as a sliding control with the pages as
 * pill tabs underneath; the sidebar lists everything at once.
 */
export const NAV_GROUPS: NavGroup[] = [
    {
        title: "Overview", icon: LayoutGrid,
        items: [
            { name: "Dashboard", href: "/dashboard", icon: LayoutGrid, roles: ALL },
            { name: "Compare periods", href: "/dashboard/compare", icon: GitCompareArrows, roles: ALL },
        ],
    },
    {
        title: "Analysis", icon: BarChart3,
        items: [
            { name: "Exceptions", href: "/dashboard/exceptions", icon: TriangleAlert, roles: ALL, badge: "exceptions" },
            { name: "Fleet", href: "/dashboard/fleet", icon: Truck, roles: ALL },
            { name: "Cost centres", href: "/dashboard/departments", icon: Users, roles: STAFF },
            { name: "Issues vs receipts", href: "/dashboard/fis-vs-fre", icon: ArrowLeftRight, roles: ALL },
            { name: "Fuel issues", href: "/dashboard/fis", icon: Flame, roles: ALL },
            { name: "Fuel receipts", href: "/dashboard/fre", icon: Container, roles: ALL },
            { name: "Fuel logs", href: "/dashboard/fuel-logs", icon: List, roles: ALL },
        ],
    },
    {
        title: "Data & Admin", icon: Table2,
        items: [
            { name: "Uploads", href: "/dashboard/upload", icon: Upload, roles: STAFF },
            { name: "Vote registry", href: "/dashboard/registry", icon: Table2, roles: STAFF, badge: "registry" },
            { name: "Reports", href: "/dashboard/reports", icon: FileText, roles: STAFF },
            { name: "Users", href: "/dashboard/users", icon: UserCog, roles: ADMIN },
            { name: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["SUPER_ADMIN"] },
        ],
    },
];

export function groupsFor(role: string): NavGroup[] {
    return NAV_GROUPS.map(g => ({ ...g, items: g.items.filter(i => i.roles.includes(role)) })).filter(g => g.items.length > 0);
}

/** The item whose href is the longest prefix of the path — so /dashboard/fleet is Fleet, not Dashboard. */
export function activeItem(pathname: string, groups: NavGroup[]): { group: NavGroup; item: NavItem } | null {
    let best: { group: NavGroup; item: NavItem } | null = null;
    for (const group of groups) for (const item of group.items) {
        if (pathname === item.href || pathname.startsWith(item.href + "/")) {
            if (!best || item.href.length > best.item.href.length) best = { group, item };
        }
    }
    return best;
}

export type NavLayout = "top" | "sidebar";
export const NAV_LAYOUT_COOKIE = "mfa-nav-layout";
