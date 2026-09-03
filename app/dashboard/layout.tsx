import { AppSidebar, MobileSidebar } from "@/components/dashboard/AppSidebar";
import { PageTransition } from "@/components/dashboard/PageTransition";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background">
            <AppSidebar />

            {/* Mobile Header */}
            <div className="lg:hidden flex items-center p-4 border-b border-border bg-card">
                <MobileSidebar />
                <img src="/logo-on-light.svg" alt="Motion Fuel Analyzer Logo" className="ml-3 w-32 h-auto object-contain" />
            </div>

            <main className="lg:pl-64 min-h-screen transition-all duration-300">
                <div className="container mx-auto p-4 md:p-10 lg:p-16 max-w-[1600px]">
                    <PageTransition>
                        {children}
                    </PageTransition>
                </div>
            </main>
        </div>
    );
}
