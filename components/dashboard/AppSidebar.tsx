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
    Menu
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useSession, signOut } from "next-auth/react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useState } from "react";

// Grouping Logic for "Industrial" Navigation
const navGroups = [
    {
        title: "Analytics",
        items: [
            { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "SYSTEM_HEAD", "EMPLOYEE"] },
            { name: "Fleet Command", href: "/dashboard/fleet", icon: Truck, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "SYSTEM_HEAD", "EMPLOYEE"] },
            { name: "Cost Centres", href: "/dashboard/departments", icon: Users, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "EMPLOYEE"] },
            { name: "Reports", href: "/dashboard/reports", icon: BarChart3, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "EMPLOYEE"] },
        ]
    },
    {
        title: "Data Management",
        items: [
            { name: "Fuel Logs", href: "/dashboard/fuel-logs", icon: Database, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "SYSTEM_HEAD", "EMPLOYEE"] },
            { name: "Ingestion", href: "/dashboard/upload", icon: Upload, roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "EMPLOYEE"] },
            { name: "System Settings", href: "/dashboard/settings", icon: Settings, roles: ["SUPER_ADMIN"] },
        ]
    }
];

function NavContent({ pathname, userRole, setOpen }: { pathname: string, userRole: string, setOpen?: (open: boolean) => void }) {
    return (
        <div className="flex flex-col h-full bg-black text-white">
            {/* Header */}
            <div className="p-8">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-yellow-400 flex items-center justify-center">
                        <Fuel className="h-5 w-5 text-black" />
                    </div>
                    <h1 className="text-xl font-extrabold tracking-tight text-white">
                        Motion Fuel Analyser
                    </h1>
                </div>
                <p className="text-[10px] uppercase tracking-[0.2em] mt-2 text-zinc-500 font-bold">Industrial Ops</p>
            </div>

            {/* Navigation Groups */}
            <nav className="flex-1 px-4 py-4 space-y-8 overflow-y-auto">
                {navGroups.map((group) => {
                    const filteredItems = group.items.filter(item => item.roles.includes(userRole));
                    if (filteredItems.length === 0) return null;

                    return (
                        <div key={group.title}>
                            <h3 className="px-4 text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">
                                {group.title}
                            </h3>
                            <ul className="space-y-1">
                                {filteredItems.map((item) => {
                                    const isActive = pathname === item.href;
                                    return (
                                        <li key={item.href}>
                                            <Link
                                                href={item.href}
                                                onClick={() => setOpen && setOpen(false)}
                                                className={cn(
                                                    "flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 group relative",
                                                    isActive
                                                        ? "bg-white text-black font-bold shadow-sm"
                                                        : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                                                )}
                                            >
                                                <item.icon className={cn(
                                                    "h-5 w-5 transition-colors",
                                                    isActive ? "text-black" : "text-zinc-500 group-hover:text-white"
                                                )} />
                                                <span>{item.name}</span>
                                                {isActive && (
                                                    <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-yellow-400" />
                                                )}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="p-6 border-t border-border bg-black">
                {/* Simplified footer for mobile/desktop shared component */}
                <button
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="flex items-center gap-3 px-4 py-3 w-full text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors border border-transparent hover:border-white/10"
                >
                    <LogOut className="h-4 w-4" />
                    <span className="font-semibold text-sm">Logout</span>
                </button>
            </div>
        </div>
    );
}

export function AppSidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const userRole = (session?.user as any)?.role || "EMPLOYEE";

    return (
        <div className="hidden lg:flex w-64 flex-col h-screen fixed inset-y-0 left-0 z-50 border-r border-border bg-black">
            <NavContent pathname={pathname} userRole={userRole} />
        </div>
    );
}

export function MobileSidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const userRole = (session?.user as any)?.role || "EMPLOYEE";
    const [open, setOpen] = useState(false);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="h-6 w-6" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 border-r border-border">
                <NavContent pathname={pathname} userRole={userRole} setOpen={setOpen} />
            </SheetContent>
        </Sheet>
    );
}
