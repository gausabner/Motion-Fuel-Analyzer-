"use client";

import { useId } from "react";
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
import { groupsFor, activeItem } from "@/lib/nav";
import { BrandLockup } from "@/components/brand/Logo";
import { useNavBadges } from "./NavBadges";

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

function NavContent({ pathname, session, setOpen, label }: { pathname: string, session: any, setOpen?: (open: boolean) => void, label: string }) {
    // The desktop sidebar is `hidden lg:flex` — display:none but still in the DOM —
    // so when the mobile sheet opens, this component is mounted twice. Group ids
    // must therefore be per-instance, or aria-labelledby resolves to the hidden
    // copy and the page carries duplicate ids.
    const instanceId = useId();
    const groupId = (title: string) => `${instanceId}-${title.replace(/\s+/g, "-").toLowerCase()}`;
    const userRole = (session?.user as any)?.role || "EMPLOYEE";
    const groups = groupsFor(userRole);
    const current = activeItem(pathname, groups)?.item.href;
    const { badges } = useNavBadges();
    const userName = session?.user?.name || session?.user?.email || "Signed in";
    const initial = String(userName).charAt(0).toUpperCase();
    const roleLabel = String(userRole).replace(/_/g, " ").toLowerCase();

    return (
        <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
            {/* Header */}
            <Link href="/dashboard" className="mx-3 mt-4 mb-1 rounded-lg px-2 py-1.5 text-primary-foreground" aria-label="Motion Fuel Analyzer — dashboard">
                <BrandLockup />
            </Link>

            {/* Navigation Groups */}
            <nav aria-label={label} className="flex-1 px-3 py-3 space-y-5 overflow-y-auto">
                {groups.map((group) => (
                    <section key={group.title} aria-labelledby={groupId(group.title)}>
                        <div id={groupId(group.title)} className="px-2.5 pb-1.5 text-[10.5px] text-sidebar-muted">
                            {group.title}
                        </div>
                        <ul className="space-y-0.5">
                            {group.items.map((item) => {
                                const isActive = current === item.href;
                                const count = item.badge ? badges[item.badge] : 0;
                                return (
                                    <li key={item.href}>
                                        <Link
                                            href={item.href}
                                            aria-current={isActive ? "page" : undefined}
                                            onClick={() => setOpen && setOpen(false)}
                                            className={cn(
 "flex items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-[13.5px]",
                                                "[transition:background-color_150ms_ease,color_150ms_ease,transform_150ms_var(--ease-spring)] active:scale-[0.98] motion-reduce:active:scale-100",
                                                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70",
                                                isActive ? "bg-white font-semibold text-[#0B1324]" : "text-sidebar-foreground [@media(hover:hover)]:hover:bg-sidebar-hover"
                                            )}
                                        >
                                            <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-[#1D4ED8]" : "opacity-80")} aria-hidden="true" />
                                            <span>{item.name}</span>
                                            {count > 0 && (
                                                <span className={cn("ml-auto rounded-full px-[7px] font-mono text-[11px]", isActive ? "bg-crit-soft text-crit" : "bg-[#3A1C22] text-[#FCA5A5]")}>{count}</span>
                                            )}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </nav>

            {/* User block */}
            <div className="px-3 py-4 border-t border-sidebar-border">
                {/* The inner px-3 doubled the block's own padding, and with four
                    items on one row the name column collapsed to 39px — enough
                    for "Sup…", which identifies nobody. */}
                <div className="flex items-center gap-2 py-2">
                    <div className="w-9 h-9 rounded-full bg-sidebar-hover flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-primary-foreground">{initial}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-sidebar-foreground truncate" title={userName}>{userName}</p>
                        <p className="text-xs text-sidebar-muted capitalize truncate">{roleLabel}</p>
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
        <div className="hidden lg:flex w-[216px] flex-col h-screen fixed inset-y-0 left-0 z-50 bg-sidebar">
            <NavContent pathname={pathname} session={session} label="Main" />
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
                <NavContent pathname={pathname} session={session} setOpen={setOpen} label="Mobile" />
            </SheetContent>
        </Sheet>
    );
}
