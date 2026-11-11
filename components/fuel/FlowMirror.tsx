"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChartCard, MirroredBars, compact, type Mirror } from "./charts";
import type { FlowBucket, Granularity } from "@/lib/fuel-flow";

const GRANULARITIES: { key: Granularity; label: string }[] = [
    { key: "daily", label: "Day" },
    { key: "monthly", label: "Month" },
    { key: "yearly", label: "Year" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** How many buckets fit before the labels collide; the table view carries the rest. */
const MAX_MARKS = 14;

function label(key: string, g: Granularity): string {
    const [y, m, d] = key.split("-");
    if (g === "yearly") return y;
    if (g === "monthly") return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
    return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

/**
 * Received above the line, issued below it. The two flows are never summed:
 * the chip above each period is the difference between them, and it turns
 * solid where issues ran ahead of receipts by more than a tenth.
 */
export function FlowMirror({ data, granularity }: { data: FlowBucket[]; granularity: Granularity }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const setGranularity = (g: Granularity) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("granularity", g);
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const shown = data.slice(-MAX_MARKS);
    const marks: Mirror[] = shown.map(b => {
        const gap = b.receivedLitres - b.issuedLitres;
        const flag = b.issuedLitres > 0 && gap < 0 && Math.abs(gap) / b.issuedLitres > 0.1;
        return {
            label: label(b.key, granularity),
            received: b.receivedLitres,
            issued: b.issuedLitres,
            gap,
            flag,
            chip: `${gap >= 0 ? "+" : "−"}${compact(Math.abs(gap))}`,
        };
    });
    // Periods where fuel went out but nothing came in are a reporting gap, and are named as one.
    const gaps = data.filter(b => b.issuedLitres > 0 && b.receivedLitres === 0).length;
    const unit = granularity === "daily" ? "day" : granularity === "monthly" ? "month" : "year";

    return (
        <ChartCard
            title="Received against issued"
            sub={data.length > shown.length ? `Latest ${shown.length} of ${data.length} ${unit}s · litres` : `By ${unit} · litres`}
            right={
                <div className="flex gap-1.5" role="group" aria-label="Group by">
                    {GRANULARITIES.map(g => (
                        <button key={g.key} type="button" className="tab !px-3 !py-1 !text-xs" aria-pressed={granularity === g.key} onClick={() => setGranularity(g.key)}>
                            {g.label}
                        </button>
                    ))}
                </div>
            }
            legend={
                <>
                    <span><i className="sw" style={{ background: "var(--slate)", opacity: 0.55 }} />Received into storage</span>
                    <span><i className="sw" style={{ background: "var(--brand)" }} />Issued to vehicles</span>
                    <span>The figure above each bar is received minus issued</span>
                </>
            }
            table={{
                head: [unit.charAt(0).toUpperCase() + unit.slice(1), "Received (L)", "Issued (L)", "Difference (L)", "Deliveries"],
                rows: data.map(b => [
                    label(b.key, granularity),
                    Math.round(b.receivedLitres).toLocaleString("en-GB"),
                    Math.round(b.issuedLitres).toLocaleString("en-GB"),
                    `${b.receivedLitres - b.issuedLitres >= 0 ? "+" : "−"}${Math.abs(Math.round(b.receivedLitres - b.issuedLitres)).toLocaleString("en-GB")}`,
                    b.deliveryCount,
                ]),
            }}
        >
            {gaps > 0 && (
                <p className="text-[13px] text-muted-foreground">
                    {gaps} {unit}{gaps === 1 ? " has" : "s have"} issues but no receipt on record. That is a gap in the uploaded receipt reports, not an empty tank.
                </p>
            )}
            {marks.length === 0
                ? <p className="py-8 text-center text-[13px] text-muted-foreground">No issues or receipts in this selection.</p>
                : <MirroredBars data={marks} ariaLabel={`Fuel received and fuel issued for each ${unit}`} />}
        </ChartCard>
    );
}
