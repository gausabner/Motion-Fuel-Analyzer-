import { cookies } from "next/headers";
import { AppSidebar, MobileSidebar } from "@/components/dashboard/AppSidebar";
import { TopNav } from "@/components/dashboard/TopNav";
import { PageTransition } from "@/components/dashboard/PageTransition";
import { NavBadgesProvider } from "@/components/dashboard/NavBadges";
import { VehiclePanelProvider } from "@/components/fuel/VehiclePanel";
import { BrandLockup } from "@/components/brand/Logo";
import { NAV_LAYOUT_COOKIE } from "@/lib/nav";

/**
 * App shell. The pill menu is the default: it gives charts the whole window
 * and behaves the same on a phone. The sidebar remains as a preference
 * (Settings → Appearance), stored in a cookie so the server renders the right
 * shell with no flash.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const sidebar = (await cookies()).get(NAV_LAYOUT_COOKIE)?.value === "sidebar";

    return (
        <NavBadgesProvider>
            <VehiclePanelProvider>
                <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground">
                    Skip to content
                </a>
                {sidebar ? (
                    <div className="min-h-screen">
                        <AppSidebar />
                        <div className="flex items-center gap-3 px-4 pt-4 lg:hidden">
                            <MobileSidebar />
                            <BrandLockup />
                        </div>
                        <main id="main" className="min-h-screen lg:pl-[216px]">
                            <div className="mx-auto max-w-[1500px] px-4 pb-10 pt-5 md:px-6">
                                <PageTransition>{children}</PageTransition>
                            </div>
                        </main>
                    </div>
                ) : (
                    <div className="mx-auto min-h-screen max-w-[1500px] px-3.5 pb-10 pt-5 md:px-6">
                        <TopNav />
                        <main id="main" className="mt-4">
                            <PageTransition>{children}</PageTransition>
                        </main>
                    </div>
                )}
            </VehiclePanelProvider>
        </NavBadgesProvider>
    );
}
