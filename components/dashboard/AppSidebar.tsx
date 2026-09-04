"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Fuel,
    Truck,
    Settings,
    Users,
    BarChart3,
    LogOut,
    Database,
    Upload,
    Menu,
    Flame,
    Container,
    GitCompareArrows,
    UserCog
, ArrowLeftRight} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession, signOut } from "next-auth/react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

/** Compact light/dark switch for the sidebar footer. */
function SidebarThemeToggle() {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const isDark = mounted && (resolvedTheme === "dark" || theme === "dark");

    return (
        <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="p-2 rounded-lg text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-hover transition-colors"
        >
            {/* Render a stable icon until mounted to avoid hydration mismatch */}
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
    );
}

// Navigation IA — see UI_Redesign_Plan.pdf §05/§07
const navGroups = [
    {
        title: "Overview",
        items: [
            { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "SYSTEM_HEAD", "EMPLOYEE"] },
            {
                name: "FIS vs FRE", href: "/dashboard/fis-vs-fre", icon: ArrowLeftRight,
                roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "SYSTEM_HEAD", "EMPLOYEE"],
                // The two single-flow views stay reachable, nested beneath the
                // comparison that now fronts them.
                children: [
                    { name: "Fuel issues (FIS)", href: "/dashboard/fis", icon: Flame },
                    { name: "Fuel receipts (FRE)", href: "/dashboard/fre", icon: Container },
                ],
            },
        ]
    },
    {
        title: "Analysis",
        items: [
            { name: "Fleet", href: "/dashboard/fleet", icon: Truck, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "SYSTEM_HEAD", "EMPLOYEE"] },
            { name: "Cost centres", href: "/dashboard/departments", icon: Users, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "EMPLOYEE"] },
            { name: "Compare periods", href: "/dashboard/compare", icon: GitCompareArrows, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "SYSTEM_HEAD", "EMPLOYEE"] },
            { name: "Fuel report", href: "/dashboard/reports", icon: BarChart3, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "EMPLOYEE"] },
        ]
    },
    {
        title: "Data & Admin",
        items: [
            { name: "Fuel logs", href: "/dashboard/fuel-logs", icon: Database, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "SYSTEM_HEAD", "EMPLOYEE"] },
            { name: "Uploads", href: "/dashboard/upload", icon: Upload, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "EMPLOYEE"] },
            { name: "Registry", href: "/dashboard/registry", icon: Fuel, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "EMPLOYEE"] },
            { name: "Users", href: "/dashboard/users", icon: UserCog, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN"] },
            { name: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["SUPER_ADMIN"] },
        ]
    }
];

function NavContent({ pathname, session, setOpen }: { pathname: string, session: any, setOpen?: (open: boolean) => void }) {
    const userRole = (session?.user as any)?.role || "EMPLOYEE";
    const userName = session?.user?.name || session?.user?.email || "Signed in";
    const initial = String(userName).charAt(0).toUpperCase();
    const roleLabel = String(userRole).replace(/_/g, " ").toLowerCase();

    return (
        <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
            {/* Header */}
            <div className="px-6 pt-7 pb-5">
                <img src="/logo-on-dark.svg" alt="Motion Fuel Analyzer Logo" className="w-32 h-auto object-contain" />
            </div>

            {/* Navigation Groups */}
            <nav className="flex-1 px-3 py-2 space-y-6 overflow-y-auto">
                {navGroups.map((group) => {
                    const filteredItems = group.items.filter(item => item.roles.includes(userRole));
                    if (filteredItems.length === 0) return null;

                    return (
                        <div key={group.title}>
                            <h3 className="px-3 text-[10px] font-semibold text-sidebar-muted uppercase tracking-[0.15em] mb-2">
                                {group.title}
                            </h3>
                            <ul className="space-y-0.5">
                                {filteredItems.map((item) => {
                                    const children = (item as any).children as { name: string; href: string; icon: any }[] | undefined;
                                    const isActive = pathname === item.href;
                                    return (
                                        <li key={item.href}>
                                            <Link
                                                href={item.href}
                                                onClick={() => setOpen && setOpen(false)}
                                                className={cn(
                                                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 group",
                                                    isActive
                                                        ? "bg-primary text-primary-foreground font-semibold"
                                                        : "text-sidebar-muted font-medium hover:text-sidebar-foreground hover:bg-sidebar-hover"
                                                )}
                                            >
                                                <item.icon className={cn(
                                                    "h-[18px] w-[18px] shrink-0 transition-colors",
                                                    isActive ? "text-primary-foreground" : "text-sidebar-muted group-hover:text-sidebar-foreground"
                                                )} />
                                                <span>{item.name}</span>
                                            </Link>

                                            {children && (
                                                <ul className="mt-0.5 mb-1 ml-[26px] pl-3 border-l border-sidebar-hover space-y-0.5">
                                                    {children.map((child) => {
                                                        const childActive = pathname === child.href;
                                                        return (
                                                            <li key={child.href}>
                                                                <Link
                                                                    href={child.href}
                                                                    onClick={() => setOpen && setOpen(false)}
                                                                    className={cn(
                                                                        "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors duration-150 group",
                                                                        childActive
                                                                            ? "bg-sidebar-hover text-sidebar-foreground font-semibold"
                                                                            : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-hover"
                                                                    )}
                                                                >
                                                                    <child.icon className="h-3.5 w-3.5 shrink-0" />
                                                                    <span>{child.name}</span>
                                                                </Link>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </nav>

            {/* User block */}
            <div className="px-3 py-4 border-t border-sidebar-border">
                <div className="flex items-center gap-3 px-3 py-2">
                    <div className="w-9 h-9 rounded-full bg-sidebar-hover flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-[#60A5FA]">{initial}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-sidebar-foreground truncate">{userName}</p>
                        <p className="text-[11px] text-sidebar-muted capitalize truncate">{roleLabel}</p>
                    </div>
                    <SidebarThemeToggle />
                    <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        title="Sign out"
                        aria-label="Sign out"
                        className="p-2 rounded-lg text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-hover transition-colors"
                    >
                        <LogOut className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

export function AppSidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();

    return (
        <div className="hidden lg:flex w-64 flex-col h-screen fixed inset-y-0 left-0 z-50 border-r border-sidebar-border bg-sidebar">
            <NavContent pathname={pathname} session={session} />
        </div>
    );
}

export function MobileSidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation menu">
                    <Menu className="h-6 w-6" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 border-r border-sidebar-border">
                <NavContent pathname={pathname} session={session} setOpen={setOpen} />
            </SheetContent>
        </Sheet>
    );
}
