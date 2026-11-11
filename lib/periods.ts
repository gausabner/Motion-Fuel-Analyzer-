import { toLocalYmd } from "@/lib/date-format";
import { getLatestMonth } from "@/lib/fuel-insights";
import { rangeLabel } from "@/lib/overview";

const monthLabel = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const iso = (d: Date) => encodeURIComponent(d.toISOString());

/**
 * Resolve the period a briefing-style page is showing, and the three presets
 * that hang off the latest month with data ("this month" on a fuel system is
 * the last month that was uploaded, not today's date).
 */
export async function resolvePeriod(path: string, params: { from?: string; to?: string }) {
    const latest = await getLatestMonth();
    const anchor = latest?.from ?? new Date();
    const thisFrom = new Date(anchor.getFullYear(), anchor.getMonth(), 1), thisTo = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const lastFrom = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1), lastTo = new Date(anchor.getFullYear(), anchor.getMonth(), 0);
    const ytdFrom = new Date(anchor.getFullYear(), 0, 1);
    const fromDay = params.from ? toLocalYmd(params.from) : toLocalYmd(thisFrom);
    const toDay = params.to ? toLocalYmd(params.to) : toLocalYmd(thisTo);
    const defs = [
        { key: "last", label: monthLabel(lastFrom), f: lastFrom, t: lastTo },
        { key: "this", label: monthLabel(thisFrom), f: thisFrom, t: thisTo },
        { key: "ytd", label: "Year to date", f: ytdFrom, t: thisTo },
    ];
    return {
        fromDay, toDay,
        from: params.from ?? thisFrom.toISOString(), to: params.to ?? thisTo.toISOString(),
        periods: defs.map(d => ({ key: d.key, label: d.label, href: `${path}?from=${iso(d.f)}&to=${iso(d.t)}` })),
        period: defs.find(d => toLocalYmd(d.f) === fromDay && toLocalYmd(d.t) === toDay)?.key ?? "custom",
    };
}

/** The date range a filtered page is showing, in words, for its header. */
export function scopeRange(from?: string, to?: string): string {
    const day = (v: string) => new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    if (from && to) return rangeLabel(toLocalYmd(from), toLocalYmd(to));
    if (from) return `From ${day(from)}`;
    if (to) return `Up to ${day(to)}`;
    return "All dates on record";
}
