import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared loading state for every dashboard route — the official arrow mark
 * drifts up-right (brand motion) above the standard page-anatomy skeleton,
 * so route changes read as a branded transition rather than a blank flash.
 */
export default function DashboardLoading() {
    return (
        <div className="space-y-10 animate-in fade-in duration-300">
            {/* Page header */}
            <div className="flex justify-between items-center gap-4">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-96 max-w-full" />
                </div>
                <Skeleton className="h-11 w-36 hidden md:block" />
            </div>

            {/* Filter bar */}
            <Skeleton className="h-[72px] w-full rounded-xl" />

            {/* Branded loading indicator */}
            <div className="flex flex-col items-center justify-center py-6 gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/logo-mark.svg"
                    alt=""
                    aria-hidden="true"
                    className="w-12 h-12 animate-logo-drift"
                />
                <span className="text-xs font-semibold text-muted-foreground tracking-wide">Loading…</span>
            </div>

            {/* KPI row */}
            <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-[130px] rounded-xl" />
                ))}
            </div>

            {/* Chart card */}
            <Skeleton className="h-[380px] w-full rounded-xl" />
        </div>
    );
}
