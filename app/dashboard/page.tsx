import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toLocalYmd } from "@/lib/date-format";
import { getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardView } from "@/components/fuel/DashboardView";
import { PeriodControl } from "@/components/fuel/PeriodControl";
import { getLatestMonth } from "@/lib/fuel-insights";
import { getOverview } from "@/lib/overview";
import { DEFAULT_CURRENCY } from "@/lib/format";

export const dynamic = "force-dynamic";

const iso = (d: Date) => encodeURIComponent(d.toISOString());

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
    const params = await searchParams;
    const latest = await getLatestMonth();

    // No explicit range: open on the latest month that has data, via redirect
    // so the URL always states the period on screen.
    if ((!params.from || !params.to) && latest) {
        redirect(`/dashboard?from=${iso(latest.from)}&to=${iso(latest.to)}`);
    }

    const fromDay = params.from ? toLocalYmd(params.from) : toLocalYmd(new Date());
    const toDay = params.to ? toLocalYmd(params.to) : fromDay;

    const [settings, user] = await Promise.all([
        (prisma as any).systemSettings.findFirst({ where: { id: "global" } }).catch(() => null),
        getSessionUser(),
    ]);
    const currency = settings?.currencySymbol || DEFAULT_CURRENCY;
    const data = await getOverview(fromDay, toDay, currency);

    // Presets hang off the latest month with data, not today's date: "this
    // month" on a fuel system is the last month that was uploaded.
    const anchor = latest?.from ?? new Date();
    const thisFrom = new Date(anchor.getFullYear(), anchor.getMonth(), 1), thisTo = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const lastFrom = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1), lastTo = new Date(anchor.getFullYear(), anchor.getMonth(), 0);
    const ytdFrom = new Date(anchor.getFullYear(), 0, 1);
    const periods = [
        { key: "last", label: "Last month", href: `/dashboard?from=${iso(lastFrom)}&to=${iso(lastTo)}`, f: lastFrom, t: lastTo },
        { key: "this", label: "This month", href: `/dashboard?from=${iso(thisFrom)}&to=${iso(thisTo)}`, f: thisFrom, t: thisTo },
        { key: "ytd", label: "Year to date", href: `/dashboard?from=${iso(ytdFrom)}&to=${iso(thisTo)}`, f: ytdFrom, t: thisTo },
    ];
    const period = periods.find(p => toLocalYmd(p.f) === fromDay && toLocalYmd(p.t) === toDay)?.key ?? "custom";

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const first = (user?.name || "").split(" ")[0];
    const upload = data.lastUpload
        ? `Last upload ${new Date(data.lastUpload.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}, ${new Date(data.lastUpload.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
        : "No uploads yet";

    return (
        <div className="flex flex-col gap-4">
            <PageHeader title={first ? `${greeting}, ${first}` : greeting} scope={[data.range.label, "All depots · fuel issued to vehicles", upload]}>
                <PeriodControl periods={periods.map(({ key, label, href }) => ({ key, label, href }))} value={period} from={params.from} to={params.to} />
            </PageHeader>
            <DashboardView data={data} currency={currency} periods={[]} period={period} />
        </div>
    );
}
