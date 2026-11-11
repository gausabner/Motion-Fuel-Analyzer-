/**
 * Shared loading state: a skeleton in the page's own shape — head, KPI row,
 * a chart drawn as capsule columns. Never a spinner on an empty axis.
 */
export default function DashboardLoading() {
    return (
        <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="Loading">
            <div className="flex flex-col gap-2">
                <div className="skel-line h-7 w-64" />
                <div className="skel-line h-4 w-96 max-w-full" />
            </div>
            <div className="skel-line h-[76px] rounded-[22px]" />
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skel-line h-[128px] rounded-[18px]" />)}
            </div>
            <div className="monumental-card">
                <div className="skel h-[220px]">
                    {[55, 48, 70, 62, 88, 66, 74, 58, 80, 68].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
                </div>
            </div>
        </div>
    );
}
