"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { financialYearStart, yearToDateLabel } from "@/lib/financial-year";
import { useNavBadges } from "@/components/dashboard/NavBadges";

type Preset = "this-month" | "last-month" | "ytd";

/**
 * Presets hang off the latest month that has data, not today's date: on a
 * system fed by monthly uploads, the calendar month is usually still empty.
 * This matches lib/periods.ts, so a preset means the same dates on every page.
 */
function presetRange(preset: Preset, anchor: Date, fyStart = 1): { from: Date; to: Date } {
    const y = anchor.getFullYear(), m = anchor.getMonth();
    if (preset === "this-month") return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) };
    if (preset === "last-month") return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0) };
    return { from: financialYearStart(anchor, fyStart), to: new Date(y, m + 1, 0) };
}

const monthLabel = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });

function sameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * One-click date presets. Applying a preset navigates immediately (no Apply
 * step), preserving every other active filter param.
 */
export function DateRangePresets({ className }: { className?: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const { badges } = useNavBadges();
    const anchor = (() => {
        if (!badges.anchor) return new Date();
        const [y, m, d] = badges.anchor.split("-").map(Number);
        return new Date(y, m - 1, d);
    })();

    const fyStart = badges.fyStart ?? 1;

    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const activePreset = ((): Preset | null => {
        if (!from || !to) return null;
        const f = new Date(from), t = new Date(to);
        for (const p of ["this-month", "last-month", "ytd"] as Preset[]) {
            const r = presetRange(p, anchor, fyStart);
            if (sameDay(f, r.from) && sameDay(t, r.to)) return p;
        }
        return null;
    })();

    const apply = (preset: Preset) => {
        const { from, to } = presetRange(preset, anchor, fyStart);
        const params = new URLSearchParams(searchParams.toString());
        params.set("from", from.toISOString());
        params.set("to", to.toISOString());
        router.push(`${pathname}?${params.toString()}`);
    };

    const chips: { key: Preset; label: string }[] = [
        { key: "this-month", label: monthLabel(presetRange("this-month", anchor).from) },
        { key: "last-month", label: monthLabel(presetRange("last-month", anchor).from) },
        { key: "ytd", label: yearToDateLabel(fyStart) },
    ];

    return (
        <div className={cn("flex flex-wrap gap-2", className)} role="group" aria-label="Period">
            {chips.map(({ key, label }) => (
                <button
                    key={key}
                    type="button"
                    onClick={() => apply(key)}
                    className="tab"
                    aria-pressed={activePreset === key}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
