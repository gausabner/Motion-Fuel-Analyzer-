"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { LogOut, Moon, Sun, Settings } from "lucide-react";
import { Seg } from "@/components/ui/Seg";
import { BrandLockup } from "@/components/brand/Logo";
import { activeItem, groupsFor } from "@/lib/nav";
import { useNavBadges } from "./NavBadges";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function ThemeButton() {
    const { setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const dark = mounted && resolvedTheme === "dark";
    return (
        <button type="button" className="ibtn" onClick={() => setTheme(dark ? "light" : "dark")}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>
            {dark ? <Sun /> : <Moon />}
        </button>
    );
}

export function UserMenu({ onDark = false }: { onDark?: boolean }) {
    const { data: session } = useSession();
    const role = (session?.user as any)?.role || "EMPLOYEE";
    const name = session?.user?.name || session?.user?.email || "Signed in";
    const initials = String(name).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "?";
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Account menu for ${name}`}
                    className={`grid h-9 w-9 flex-none place-items-center rounded-full text-[12.5px] font-semibold text-primary-foreground [transition:transform_150ms_var(--ease-spring)] active:scale-[0.94] ${onDark ? "bg-white/10" : "bg-brand"}`}>
                    {initials}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5">
                <DropdownMenuLabel className="font-normal">
                    <span className="block truncate text-[13px] font-semibold">{name}</span>
                    <span className="block text-xs capitalize text-muted-foreground">{String(role).replace(/_/g, " ").toLowerCase()}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {role === "SUPER_ADMIN" && (
                    <DropdownMenuItem asChild><Link href="/dashboard/settings"><Settings /> Settings</Link></DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}><LogOut /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/**
 * The pill menu: three groups in a sliding ink control, then the pages of the
 * current group as pill tabs. It gives charts the full width of the window and
 * behaves the same on a phone, where the control scrolls sideways.
 */
export function TopNav() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const { badges } = useNavBadges();
    const role = (session?.user as any)?.role || "EMPLOYEE";
    const groups = groupsFor(role);
    const active = activeItem(pathname, groups);
    const group = active?.group ?? groups[0];

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <Link href="/dashboard" className="rounded-lg text-foreground" aria-label="Motion Fuel Analyzer — dashboard">
                    <BrandLockup className="[&>span]:max-sm:hidden" />
                </Link>
                <nav aria-label="Sections" className="min-w-0">
                    <Seg
                        label="Sections"
                        value={group?.title ?? ""}
                        items={groups.map(g => ({ key: g.title, label: g.title, href: g.items[0].href, icon: <g.icon aria-hidden="true" /> }))}
                    />
                </nav>
                <div className="flex flex-none gap-2">
                    <ThemeButton />
                    <UserMenu />
                </div>
            </div>
            {group && (
                <nav aria-label={`${group.title} pages`} className="flex flex-wrap gap-2">
                    {group.items.map(item => {
                        const on = active?.item.href === item.href;
                        const count = item.badge ? badges[item.badge] : 0;
                        return (
                            <Link key={item.href} href={item.href} className="tab" aria-current={on ? "page" : undefined}>
                                {item.name}
                                {count > 0 && <span className="nav-badge" aria-label={`${count} open`}>{count}</span>}
                            </Link>
                        );
                    })}
                </nav>
            )}
        </div>
    );
}
