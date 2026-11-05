"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Preset = "this-month" | "last-month" | "ytd";

function presetRange(preset: Preset): { from: Date; to: Date } {
    const now = new Date();
    if (preset === "this-month") {
        return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
    }
    if (preset === "last-month") {
        return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0) };
    }
    return { from: new Date(now.getFullYear(), 0, 1), to: now };
}

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

    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const activePreset = ((): Preset | null => {
        if (!from || !to) return null;
        const f = new Date(from), t = new Date(to);
        for (const p of ["this-month", "last-month", "ytd"] as Preset[]) {
            const r = presetRange(p);
            if (sameDay(f, r.from) && sameDay(t, r.to)) return p;
        }
        return null;
    })();

    const apply = (preset: Preset) => {
        const { from, to } = presetRange(preset);
        const params = new URLSearchParams(searchParams.toString());
        params.set("from", from.toISOString());
        params.set("to", to.toISOString());
        router.push(`${pathname}?${params.toString()}`);
    };

    const chips: { key: Preset; label: string }[] = [
        { key: "this-month", label: "This month" },
        { key: "last-month", label: "Last month" },
        { key: "ytd", label: "YTD" },
    ];

    return (
        <div className={cn("flex flex-wrap gap-1.5", className)}>
            {chips.map(({ key, label }) => (
                <button
                    key={key}
                    type="button"
                    onClick={() => apply(key)}
                    className={cn(
                        "h-9 px-3.5 rounded-lg text-xs font-semibold border transition-colors",
                        activePreset === key
                            ? "bg-accent text-accent-foreground border-transparent"
                            : "bg-card text-foreground/80 border-border hover:bg-muted"
                    )}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
